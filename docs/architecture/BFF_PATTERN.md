# BFF (Backend For Frontend) Pattern

This document explains the BFF pattern as implemented in this plugin.

---

## What is the BFF Pattern?

The BFF (Backend For Frontend) pattern gives a plugin its own backend service. Instead of the frontend making direct K8s API calls through the dashboard's `/api/k8s/*` pass-through, it calls the plugin's own backend, which performs server-side logic and returns processed results.

### When to Use a BFF

- **Server-side aggregation** -- Combine multiple API calls into a single response (this plugin aggregates quickstart metadata from multiple GitHub repos)
- **External service integration** -- Call third-party APIs using credentials stored server-side (API keys never reach the browser)
- **Complex business logic** -- Processing that would be too expensive or impractical in the browser (Helm CLI execution, RBAC pre-checks)
- **Data transformation** -- Heavy filtering, sorting, or enrichment before sending data to the frontend

### When NOT to Use a BFF

- Simple CRUD on K8s resources -- use the dashboard's `/api/k8s/*` pass-through instead
- Reading dashboard config or user info -- use `/api/status`, `/api/config`, etc.
- Anything the dashboard backend already provides (see `DASHBOARD_APIS.md`)

---

## How It Works

### Token Flow

```text
Browser                    Dashboard Backend              Plugin BFF              K8s API / Helm CLI
  |                              |                            |                     |
  |-- fetch('/quickstarts-manager/api/catalog') ------------->|                     |
  |                              |                            |-- fetch GitHub ---->|
  |                              |                            |<-- quickstarts.yaml-|
  |<-- aggregated catalog -------|<-- JSON response ----------|                     |
  |                              |                            |                     |
  |-- POST /quickstarts-manager/api/quickstarts/:name/install |                     |
  |                    [authorize: true]                       |                     |
  |                              |-- POST /:name/install ----->|                     |
  |                              |   Authorization: Bearer ... |                     |
  |                              |                            |-- helm install ---->|
  |                              |                            |   (temp kubeconfig) |
  |<-- SSE progress events ------|<-- SSE stream -------------|<-- release status --|
```

Key points:

1. The frontend calls a path like `/quickstarts-manager/api/catalog` at the same origin
2. The dashboard backend matches this against `proxyService` entries in the federation ConfigMap
3. When `authorize: true`, the dashboard converts the user's session token into an `Authorization: Bearer <token>` header
4. The BFF receives the user's actual OpenShift token and uses it for K8s API calls and Helm operations -- all RBAC permissions are the user's own
5. For long-running operations (install/upgrade/remove), the BFF streams progress via Server-Sent Events (SSE)

### Dashboard Proxy Configuration

The dashboard discovers BFF services via the `proxyService` field in the federation ConfigMap:

```json
{
  "name": "quickstartsManager",
  "backend": {
    "remoteEntry": "/remoteEntry.js",
    "service": { "name": "quickstarts-manager", "namespace": "cp-quickstarts-manager", "port": 8080 }
  },
  "proxyService": [{
    "path": "/quickstarts-manager/api",
    "pathRewrite": "/api",
    "authorize": true,
    "tls": false,
    "service": { "name": "quickstarts-manager-bff", "namespace": "cp-quickstarts-manager", "port": 3000 }
  }]
}
```

| Field | Purpose |
|---|---|
| `path` | URL prefix the dashboard intercepts |
| `pathRewrite` | Replacement prefix forwarded to the BFF |
| `authorize` | Forward the user's Bearer token |
| `service` | K8s Service name, namespace, and port for the BFF |

---

## This Plugin's BFF Implementation

### Directory Structure

```text
bff/
  package.json              # Express + TypeScript project
  tsconfig.json
  Containerfile             # UBI9 Node 22 + Helm CLI, runs on port 3000
  src/
    server.ts               # Express app entry point
    types.ts                # Shared types
    types/
      catalog.ts            # Catalog response types
      lifecycle.ts          # Lifecycle operation types
      status.ts             # Status response types
    routes/
      catalog.ts            # GET /api/catalog, GET /api/catalog/:name
      status.ts             # GET /api/quickstarts/status?namespace=X
      lifecycle.ts          # POST install/upgrade, DELETE remove (SSE)
    services/
      registryClient.ts     # Fetches and caches quickstarts.yaml from registry repo
      quickstartMetadataClient.ts  # Fetches quickstart.yaml from each quickstart repo
      helmService.ts        # Helm CLI wrapper with temp kubeconfig
      k8sApiClient.ts       # Kubernetes API client (Route discovery, RBAC)
      lifecycleService.ts   # Orchestrates install/upgrade/remove flows
      rbacChecker.ts        # SelfSubjectAccessReview pre-checks
    utils/
      cache.ts              # In-memory cache with TTL
      github.ts             # GitHub raw URL construction
      httpClient.ts         # HTTP fetch wrapper with timeout and size limits
      k8sClient.ts          # K8s API base URL discovery (in-cluster/out-of-cluster)
      validation.ts         # Input validation (namespace, quickstart name, protected namespaces)
  __tests__/                # Unit tests for all routes and services
```

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/config` | No | Returns `{ bffNamespace }` |
| `GET` | `/api/catalog` | No | List all quickstarts from curated registry (cached). `?refresh=true` bypasses cache. |
| `GET` | `/api/catalog/:name` | No | Single quickstart details |
| `POST` | `/api/quickstarts/:name/install` | Yes | Install quickstart via Helm. Body: `{ namespace, values? }`. Supports SSE. |
| `POST` | `/api/quickstarts/:name/upgrade` | Yes | Upgrade existing quickstart. Body: `{ namespace, values? }`. Supports SSE. |
| `DELETE` | `/api/quickstarts/:name` | Yes | Remove quickstart. Query: `?namespace=X`. Supports SSE. |
| `GET` | `/api/quickstarts/status` | Yes | Check deployed quickstart in namespace. Query: `?namespace=X`. |

### Services

**registryClient** -- Fetches and caches `quickstarts.yaml` from the configurable registry repo via raw GitHub URL. Serves stale cache on fetch failure (stale-while-revalidate pattern). Configurable TTL (default: 300s).

**quickstartMetadataClient** -- For each quickstart in the registry, fetches `quickstart.yaml` from its repo's raw URL. Concurrency-limited (default: 5 simultaneous fetches) to avoid GitHub rate limits. Per-quickstart cache with TTL. Gracefully returns null for missing or malformed metadata.

**helmService** -- Wraps Helm CLI execution. Creates a temporary kubeconfig per request using the forwarded Bearer token (written with mode 0o600, cleaned up after use). Supports both OCI registry charts and in-repo chart paths. Sanitizes error output to prevent token/path leakage. Input validation: strict regex for Helm value keys/values, max 50 values per operation.

**k8sApiClient** -- Authenticated Kubernetes API client. Supports Route discovery (listing OpenShift Routes in a namespace) and SelfSubjectAccessReview. In-cluster and out-of-cluster auto-detection. Request timeout (30s) and response body size limit (10MB).

**lifecycleService** -- Orchestrates quickstart lifecycle operations:
- **Install**: resolve metadata → check for existing release (one-per-namespace) → RBAC pre-check → `helm install` → discover Routes
- **Upgrade**: resolve metadata → `helm upgrade` → discover Routes
- **Remove**: `helm uninstall`

Emits step-by-step progress events for SSE streaming. Validates OCI references and chart types.

**rbacChecker** -- Checks required permissions via SelfSubjectAccessReview against the target namespace. Returns structured results: which permissions are granted, which are denied. Used by lifecycleService before install.

### SSE Streaming

Lifecycle operations (install/upgrade/remove) support Server-Sent Events for real-time progress:

```text
event: progress
data: {"steps": [{"id": "resolve", "label": "Resolving quickstart", "status": "completed"}, ...]}

event: progress
data: {"steps": [{"id": "resolve", "label": "Resolving quickstart", "status": "completed"}, {"id": "helm-install", "label": "Running helm install", "status": "running"}]}

event: complete
data: {"success": true, "message": "Installed successfully", "steps": [...], "routes": [...]}
```

The BFF sends heartbeat comments (`: keepalive`) every 15 seconds to keep the connection alive. For clients that don't request SSE (`Accept: text/event-stream`), the response is a standard JSON body with the final result.

### Security Model

- **No persistent credentials**: The BFF never stores cluster credentials. Each request uses the user's forwarded Bearer token via a temporary kubeconfig.
- **Token leakage prevention**: Helm error output is sanitized to strip tokens, temp file paths, and kubeconfig contents.
- **Input validation**: All user inputs (namespace, quickstart name, Helm values) are validated with strict regex patterns. Protected namespaces (`kube-*`, `openshift-*`, `redhat-ods-*`, `default`, `opendatahub`) are blocked at the route level.
- **Value injection prevention**: Helm values are restricted to alphanumeric keys and safe value patterns (no shell metacharacters).

### K8s Client

The `k8sClient.ts` utility discovers the K8s API server:

- **In-cluster**: Uses `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` env vars, reads the CA cert from the service account mount
- **Local dev**: Uses the `K8S_API_BASE` env var to point at the cluster API. Set `K8S_TLS_INSECURE=true` for self-signed certs.

The BFF always uses the user's forwarded token, never a service account token. This ensures all actions respect the user's RBAC permissions.

---

## Deployment

The BFF runs as a separate Deployment and Service in the Helm chart:

- **Deployment**: `quickstarts-manager-bff` -- Node.js + Helm CLI container on port 3000
- **Service**: `quickstarts-manager-bff` -- ClusterIP service exposing port 3000
- **ServiceAccount**: `quickstarts-manager-bff` -- with ClusterRole for namespace and resource management
- **ClusterRole**: Permissions for creating/deleting namespaces, managing Helm-deployed resources, and SelfSubjectAccessReview

Both are gated by `.Values.bff.enabled` (default: `true`).

---

## Local Development

The BFF runs as a separate Node.js process alongside the plugin dev server and the dashboard. See [LOCAL_SETUP.md](../development/LOCAL_SETUP.md) for full step-by-step instructions.

### Three-process setup

| Process | Port | What it does |
|---|---|---|
| Dashboard (container or source) | 8443 | Host app; proxies frontend and BFF requests |
| BFF service | 3000 | Plugin backend; makes K8s API calls and runs Helm server-side |
| Plugin dev server | 9500 | Plugin frontend; serves webpack bundles with HMR |

### Starting the BFF

```bash
cd bff
npm install                                              # first time only
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev # must set K8S_API_BASE
```

**`K8S_API_BASE` is required.** When the BFF runs locally (not in-cluster), it doesn't have access to the `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` env vars that Kubernetes provides to pods. `K8S_API_BASE` tells the BFF where to find the cluster API server. Without it, all K8s API calls will fail and the endpoint returns 502.

> **Tip:** If your cluster uses a self-signed certificate (common in dev/lab environments), add `K8S_TLS_INSECURE=true` to skip TLS verification for K8s API calls:
>
> ```bash
> K8S_TLS_INSECURE=true K8S_API_BASE=$(oc whoami --show-server) npm run start:dev
> ```
>
> This is not needed in production — the in-cluster CA bundle mounted from the `kube-root-ca.crt` ConfigMap handles TLS automatically.

### Dashboard proxy configuration

The dashboard must include a `proxyService` entry in `MODULE_FEDERATION_CONFIG` to route `/quickstarts-manager/api/*` requests to the BFF:

```json
"proxyService": [{
  "path": "/quickstarts-manager/api",
  "pathRewrite": "/api",
  "authorize": true,
  "tls": false,
  "localService": { "host": "localhost", "port": 3000 },
  "service": { "name": "placeholder", "namespace": "opendatahub", "port": 3000 }
}]
```

Without this entry, the dashboard won't proxy BFF requests and the frontend will receive HTML (the SPA fallback) instead of JSON.

### Standalone frontend development

The webpack dev server (`config/webpack.dev.js`) also has a proxy entry for `/quickstarts-manager/api` that forwards to `localhost:3000`. This allows developing the frontend against the BFF without the full dashboard, but note that no user token will be forwarded in this mode.

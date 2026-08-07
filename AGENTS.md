# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `quickstarts-manager`, a community plugin for the **Red Hat OpenShift AI (RHOAI) Dashboard**. It provides users with an interface to browse, deploy, and manage AI Quickstarts from the [rh-ai-quickstart](https://github.com/rh-ai-quickstart) GitHub organization directly from the dashboard.

Each quickstart is a standalone AI application (chatbot, RAG pipeline, model serving stack, etc.) that lives in its own repository and is deployable via a Helm chart. This plugin acts as a catalog and lifecycle manager: users pick a namespace, browse available quickstarts, install one, and later upgrade or remove it — all through the dashboard UI.

### Reference Implementation

This plugin follows the same architecture as [community-plugins-admin](https://github.com/rh-ai-community-plugins/community-plugins-admin), which manages the lifecycle of other RHOAI dashboard plugins via Helm. The key difference: quickstarts are standalone apps (not dashboard plugins), so there is no `MODULE_FEDERATION_CONFIG` patching — the BFF simply runs Helm operations and reports status.

## Build & Development Commands

```bash
npm run start:dev     # Dev server on port 9500 with HMR
npm run build         # Production build to dist/
npm test              # Run all tests (Jest + jsdom)
npm run test:watch    # Watch mode
npm run test:coverage # Tests with coverage report
npm run lint          # ESLint on src/ + markdownlint on **/*.md
```

To run a single test file:

```bash
npx jest src/app/hooks/useCurrentUser.test.ts
```

### BFF Service Commands

```bash
cd bff
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev  # Dev server on port 3000 (K8S_API_BASE required for local dev)
K8S_TLS_INSECURE=true K8S_API_BASE=$(oc whoami --show-server) npm run start:dev  # With self-signed cert
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled server (in-cluster, K8S_API_BASE not needed)
npm test              # Run BFF tests (Jest + node)
npm run lint          # ESLint on bff/src/
```

## Architecture

### Core Concept: One Quickstart Per Namespace

To avoid resource name collisions (many quickstarts name components generically, e.g., "backend"), the plugin enforces a **one quickstart per namespace** rule. This drives the entire UI flow:

1. User selects a namespace (or creates one)
2. If no quickstart is deployed there → **Catalog view** (browse and install)
3. If a quickstart is already deployed → **Status view** (release info, routes, upgrade/remove)

### Quickstart Registry

The list of available quickstarts is curated in a `quickstarts.yaml` file hosted in a configurable Git repository. The BFF fetches this file via raw GitHub URL and caches it.

**Registry location is configured via environment variables:**

| Variable | Default | Description |
|---|---|---|
| `QUICKSTART_REGISTRY_REPO` | `https://github.com/rh-ai-community-plugins/quickstarts-manager` | GitHub repo hosting the registry |
| `QUICKSTART_REGISTRY_FILE` | `quickstarts.yaml` | Filename within the repo |
| `QUICKSTART_REGISTRY_BRANCH` | `main` | Branch to fetch from |

The `quickstarts.yaml` file lists quickstart names and their source repositories:

```yaml
quickstarts:
  - name: lemonade-stand-assistant
    repository: https://github.com/rh-ai-quickstart/lemonade-stand-assistant
  - name: rag
    repository: https://github.com/rh-ai-quickstart/RAG
```

Each listed repository must contain a `quickstart.yaml` metadata file (see `docs/quickstart-spec.md` for the spec and `quickstart.yaml.template` for an example). The BFF fetches and caches these individually.

### Quickstart Metadata (`quickstart.yaml`)

Each quickstart repo that wants to be featured must include a `quickstart.yaml` at its root. This file declares everything the plugin needs to install and manage the quickstart:

- **Identity**: name, display name, description, version, icon
- **Maintainer**: name, GitHub handle
- **Repository**: source URL
- **Deployment**: scope (project or cluster), Helm chart source (OCI registry ref or in-repo path), configurable values
- **RBAC**: required permissions in the target namespace so the plugin can pre-check access
- **Prerequisites**: hardware/software requirements (GPU, storage, etc.) displayed to the user before install
- **Tags**: for catalog filtering

Helm chart sources support two modes because quickstart repos vary in structure:

- **OCI registry**: `chart.type: oci` with `chart.ref: oci://quay.io/...`
- **In-repo path**: `chart.type: repo` with `chart.path: chart/` (or `deploy/helm/`, etc.)

### Module Federation Plugin System

The plugin exposes two remote modules to the RHOAI dashboard host via Webpack Module Federation (configured inline in `config/webpack.common.js`):

- **`./extensions`** (`src/rhoai/extensions.ts`) — Defines extension points:
  - `app.area` — registers the `quickstarts-manager` feature area
  - `app.navigation/section` (x2) — `community-plugins` shared parent section (with `CommunityNavIcon`) and `quickstarts-manager` plugin subsection (with `QuickstartsManagerNavIcon`)
  - `app.navigation/href` (x2) — "Quickstarts" nav item and "Settings" nav item under the `quickstarts-manager` section
  - `app.route` — mounts the App component with wildcard routing at `/quickstarts-manager/*`
- **`./Icon`** (`src/app/components/QuickstartsManagerNavIcon.tsx`) — SVG icon for the plugin's nav subsection. A separate `CommunityNavIcon.tsx` provides the icon for the shared `community-plugins` parent section.

Shared singletons (react, react-dom, react-router-dom, @patternfly/react-core, @openshift/dynamic-plugin-sdk) are provided by the host and not bundled into the plugin.

### Pages

The plugin has three pages, routed under `/quickstarts-manager/*`:

- **Catalog view** — Shown when no quickstart is deployed in the selected namespace. Displays available quickstarts from the curated registry with filtering by tags, search, and detail panels showing description, prerequisites, and required permissions. Install action triggers Helm deployment into the selected namespace.
- **Status view** — Shown when a quickstart is deployed in the selected namespace. Displays Helm release status (deployed, failed, pending, etc.), resource summary, and auto-discovered OpenShift Routes as clickable shortcuts (open in new tab). Provides upgrade and remove actions.
- **Settings page** (`/quickstarts-manager/settings`) — Admin-only page for configuring GitHub token (for higher API rate limits) and HTTP proxy URL. Gated by `useCurrentUser().user?.isAdmin` — non-admins see an EmptyState. Persists settings to a K8s Secret via the BFF.

Catalog and Status views share the `ProjectSelector` component at the top for namespace selection (with favorites support).

### Custom Hooks

Hooks in `src/app/hooks/` provide data fetching and API integration:

**Retained from seed project (reusable across community plugins):**

- `useCurrentUser` — Fetches authenticated user info from `/api/status`.
- `useProjects` — Fetches accessible projects from the OpenShift projects API.
- `useFavoriteProjects` — Manages localStorage-backed project favorites.
- `useLastSelectedProject` — Persists last selected project in localStorage.
- `useAccessReview` — Checks RBAC permissions via SelfSubjectAccessReview.

**Quickstart-specific hooks:**

- `useQuickstartCatalog` — Fetches the curated quickstart list from the BFF (`/api/catalog`). Returns catalog entries with metadata, loading state, error, and a refresh function.
- `useQuickstartStatus` — Checks whether a quickstart is deployed in the selected namespace (`/api/quickstarts/status?namespace=X`). Returns the Helm release info (name, version, status, chart) and discovered Routes, or null if nothing is deployed.
- `useQuickstartLifecycle` — Provides install, upgrade, and remove operations via the BFF. Handles SSE progress streaming for long-running Helm operations.
- `useSettings` — Fetches and manages plugin settings (GitHub token, proxy URL) via the BFF `/api/settings` endpoint. Returns `{ settings, loading, error, saving, save, remove }`. Handles 403 as a permission error.

### BFF Service

The `bff/` directory contains a standalone Express.js + TypeScript backend service implementing the BFF pattern. The dashboard proxies requests from `/quickstarts-manager/api/*` to this service, forwarding the user's Bearer token.

#### BFF Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Returns `{ bffNamespace }` (from `POD_NAMESPACE` env var) |
| `GET` | `/api/catalog` | List all quickstarts from curated registry (cached). `?refresh=true` bypasses cache. |
| `GET` | `/api/catalog/:name` | Single quickstart details (fetches `quickstart.yaml` from source repo) |
| `GET` | `/api/quickstarts/status` | Check deployed quickstart in namespace (`?namespace=X`). Returns Helm release info + discovered Routes, or 404 if none. |
| `POST` | `/api/quickstarts/:name/install` | Install quickstart via Helm. Body: `{ namespace, values? }`. Supports SSE progress streaming. |
| `POST` | `/api/quickstarts/:name/upgrade` | Upgrade existing quickstart. Supports SSE progress streaming. |
| `DELETE` | `/api/quickstarts/:name` | Remove quickstart via Helm. Query: `?namespace=X`. Supports SSE progress streaming. |
| `GET` | `/api/settings` | Get plugin settings (admin-only). Returns masked GitHub token, proxy URL, and config source. |
| `PUT` | `/api/settings` | Update plugin settings (admin-only). Body: `{ githubToken?, proxyUrl? }`. Writes to K8s Secret. |
| `DELETE` | `/api/settings` | Clear plugin settings (admin-only). Removes Secret data. |

#### BFF Services

- **`catalogClient`** — Fetches and caches `quickstarts.yaml` from the configurable registry repo via raw GitHub URL.
- **`quickstartMetadataClient`** — Fetches and caches individual `quickstart.yaml` files from each quickstart's source repo.
- **`helmService`** — Wraps Helm CLI execution. Creates temporary kubeconfig per request using the forwarded Bearer token. Handles both OCI registry charts and in-repo chart paths. Sanitizes errors to prevent token leakage.
- **`lifecycleService`** — Orchestrates quickstart lifecycle: resolves metadata → validates RBAC → runs Helm operation → discovers Routes. No dashboard config patching needed (quickstarts are standalone apps).
- **`k8sApiClient`** — Kubernetes API client for direct API interactions (Route discovery, RBAC pre-checks, namespace operations).
- **`settingsService`** — Centralized settings reader/writer. Reads GitHub token and proxy URL from volume-mounted Secret files at `/etc/quickstarts-manager/settings/`, falls back to env vars (`GITHUB_TOKEN`, `HTTPS_PROXY`), caches with 30s TTL. Writes settings to K8s Secret via the admin's forwarded token.

#### BFF Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | BFF listen port |
| `POD_NAMESPACE` | `cp-quickstarts-manager` | Namespace where the BFF is deployed (injected via Kubernetes downward API) |
| `K8S_API_BASE` | (in-cluster auto-discovery) | Kubernetes API server URL (set for local dev) |
| `K8S_TLS_INSECURE` | `false` | Accept self-signed certs (local dev only) |
| `QUICKSTART_REGISTRY_REPO` | `https://github.com/rh-ai-community-plugins/quickstarts-manager` | GitHub repo hosting `quickstarts.yaml` |
| `QUICKSTART_REGISTRY_FILE` | `quickstarts.yaml` | Registry filename |
| `QUICKSTART_REGISTRY_BRANCH` | `main` | Branch to fetch from |
| `CACHE_TTL` | `300` | Cache duration in seconds for catalog data |
| `GITHUB_TOKEN` | (none) | GitHub personal access token for higher API rate limits (env-var fallback) |
| `GITHUB_API_BASE` | (derived from repo host) | GitHub API base URL for in-repo (`chart.type: repo`) chart fetching via Trees + Blobs API. Defaults to `https://api.github.com` for github.com repos and `https://<host>/api/v3` for GitHub Enterprise Server. Set to override. **Note:** this only affects chart fetching. The registry (`quickstarts.yaml`) and metadata (`quickstart.yaml`) are still fetched via `raw.githubusercontent.com` (github.com only), so full GitHub Enterprise support is not wired end-to-end — quickstarts are expected to live on public github.com. |
| `HTTPS_PROXY` | (none) | HTTP/HTTPS proxy URL for outbound GitHub requests (env-var fallback) |
| `SETTINGS_MOUNT_PATH` | `/etc/quickstarts-manager/settings` | Path where the settings Secret is volume-mounted |

### Entry Point Chain

`src/index.ts` → dynamic import → `src/bootstrap.tsx` (React 18 root render). The dynamic import is required for Module Federation to resolve shared dependencies before the app renders.

### Plugin Registration

`plugin.yaml` at the repo root is a unified flat manifest that serves both as the Module Federation runtime config (consumed by the RHOAI dashboard) and the community plugin catalog metadata (consumed by the charter registry). It declares plugin identity, maintainer, RHOAI version compatibility, deployment model, container image, install method, Module Federation remote entry and routes, RBAC requirements, and support links.

### Webpack Configs

- `config/webpack.common.js` — Shared config: entry point, loaders, Module Federation, path alias `~` → `./src`
- `config/webpack.dev.js` — Dev server on port 9500, proxies `/quickstarts-manager/api` to BFF at `localhost:3000` and `/quickstarts-manager` to dashboard at `localhost:8443`
- `config/webpack.prod.js` — Output to `dist/`, CSS extraction, vendor chunk splitting

### Test Setup

Jest with `ts-jest` preset and `jsdom` environment (`jest.config.js`). `jest.setup.tsx` mocks `react-router-dom` (useNavigate, useParams, useLocation, Outlet, Routes, Route, Navigate) and polyfills TextEncoder/TextDecoder. CSS modules are proxied to return property names as class names (`jest.style-mock.js`).

### Scripts

- `scripts/build-push.sh` — Builds and pushes container images (frontend, BFF, or both) to Quay.io. Auto-computes the next version from git tags if not provided.
- `scripts/scan-image.sh` — Builds container images locally and scans them for vulnerabilities using Trivy.
- `scripts/sync-chart-version.js` — Syncs the version from root `package.json` into `chart/Chart.yaml`, `bff/package.json`, and `plugin.yaml` (both `version` and `image.tag`). Runs automatically via npm's `version` lifecycle hook.

### Deployment

- **Frontend container**: Multi-stage build in `Containerfile` — UBI9 Node 22 builder → UBI9 Nginx 1.24 serving `dist/` on port 8080 as UID 1001. Nginx adds CORS header on `remoteEntry.js`.
- **BFF container**: Multi-stage build in `bff/Containerfile` — UBI9 Node 22 builder → UBI9 Node 22 runtime on port 3000 as UID 1001. Must have `helm` CLI available in the container for lifecycle operations.
- **Helm chart**: `chart/` deploys to Kubernetes with Deployment + Service for both frontend and BFF into the `cp-quickstarts-manager` namespace by default (configurable via `values.yaml`). Frontend defaults to `quay.io/rh-ai-community-plugins/quickstarts-manager:latest`, BFF to `quay.io/rh-ai-community-plugins/quickstarts-manager-bff:latest`.

### CI/CD Workflows

- `.github/workflows/ci.yml` — Runs tests and lint for both frontend and BFF on push/PR to main.
- `.github/workflows/build-push.yml` — Builds and pushes both container images to Quay.io. Manually triggered via `workflow_dispatch` with a version input.

## Documentation

Project documentation lives under `docs/` in semantic subfolders:

```text
docs/architecture/   — Plugin system internals and extension contract
docs/development/    — Local dev setup and dashboard API reference
docs/deployment/     — OpenShift deployment with Helm and dashboard registration
```

## Key Conventions

- Path alias: `~` maps to `./src` (webpack) and `@` maps to `./src` (jest). Use `~` in source code imports.
- UI components use **PatternFly 6** (`@patternfly/react-core`, `@patternfly/react-icons`).
- TypeScript strict mode is enabled. Target is ES2020 with ESNext modules and `react-jsx` transform.
- No standalone ESLint config file — uses `@typescript-eslint` defaults via dev dependencies.

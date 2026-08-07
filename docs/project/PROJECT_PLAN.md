# Quickstarts Manager — Project Plan

## Overview

Build a community plugin for the RHOAI Dashboard that lets users browse, deploy, and manage AI Quickstarts from the [rh-ai-quickstart](https://github.com/rh-ai-quickstart) GitHub organization — directly from the dashboard UI.

Each quickstart is a standalone AI application (chatbot, RAG pipeline, model serving stack, etc.) in its own repository, deployable via a Helm chart. This plugin provides a catalog of curated quickstarts and one-click deployment into user-selected namespaces, following the same architecture as [community-plugins-admin](https://github.com/rh-ai-community-plugins/community-plugins-admin).

### Key Design Decisions

- **One quickstart per namespace** — avoids resource name collisions (many quickstarts name components generically, e.g., "backend")
- **Any authenticated user** can deploy into namespaces they have RBAC access to (not admin-only)
- **No MODULE_FEDERATION_CONFIG patching** — quickstarts are standalone apps, not dashboard plugins
- **Curated registry** — a `quickstarts.yaml` file in a configurable GitHub repo lists available quickstarts
- **Per-quickstart metadata** — each quickstart repo must include a `quickstart.yaml` declaring its Helm chart source, prerequisites, and RBAC requirements

### Quickstart Registry

The source of available quickstarts is a curated `quickstarts.yaml` file hosted in a configurable GitHub repository (default: `https://github.com/rh-ai-community-plugins/quickstarts-manager`). Each entry points to a quickstart repo:

```yaml
quickstarts:
  - name: lemonade-stand-assistant
    repository: https://github.com/rh-ai-quickstart/lemonade-stand-assistant
  - name: rag
    repository: https://github.com/rh-ai-quickstart/RAG
```

Detailed metadata comes from each quickstart's own `quickstart.yaml` at the repo root — see `docs/quickstart-spec.md` for the full specification and `quickstart.yaml.template` for an annotated example.

## Architecture

### High-Level Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│  Cluster (Helm chart)                                           │
│  ┌────────────────────┐   ┌──────────────────────────────────┐  │
│  │  Plugin Frontend   │   │  BFF (Express + Helm CLI)        │  │
│  │  (Nginx, port 8080)│   │  (port 3000)                     │  │
│  │  Module Federation │   │  Aggregates & caches quickstart  │  │
│  │  remoteEntry.js    │   │  metadata from registry &        │  │
│  │                    │   │  individual repos. Executes Helm │  │
│  │                    │   │  install/upgrade/uninstall using  │  │
│  │                    │   │  forwarded Bearer token.         │  │
│  └────────────────────┘   └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Sources

| Source | What It Provides | Access Method |
|---|---|---|
| **Quickstart registry** (`quickstarts.yaml`) | Curated list of quickstart names and repo URLs | BFF fetches from GitHub raw content |
| **Quickstart repos** (`quickstart.yaml` per repo) | Version, description, Helm chart source, prerequisites, RBAC requirements, tags | BFF fetches from each repo's raw content |
| **Cluster state** | Deployed quickstarts (Helm releases), OpenShift Routes | BFF queries K8s API and Helm CLI using forwarded Bearer token |

### Why BFF

Each page load would otherwise require the frontend to fetch `quickstarts.yaml` from the registry repo, then fan out to N quickstart repos to fetch their `quickstart.yaml`. The BFF centralizes this: it fetches, aggregates, and caches metadata server-side, serving a single pre-assembled response to the frontend. The BFF also wraps Helm CLI execution — the frontend never runs Helm directly.

### Quickstart Lifecycle Operations

| Operation | Mechanism |
|---|---|
| **Install** | Resolve metadata → validate RBAC in target namespace → `helm install` (OCI ref or in-repo chart) → discover Routes |
| **Upgrade** | Discover existing Helm release → `helm upgrade` to new chart version |
| **Remove** | `helm uninstall` the quickstart release → optionally delete namespace |

No `MODULE_FEDERATION_CONFIG` management is needed — quickstarts are standalone apps.

### Authentication & RBAC

- The BFF forwards the user's Bearer token (received from the dashboard proxy) for all K8s API and Helm operations.
- Helm creates a temporary kubeconfig per request using the forwarded token — no persistent cluster credentials.
- Before install, the BFF checks the user's RBAC permissions in the target namespace against the quickstart's declared `requiredPermissions`.
- The `deployment.scope` field in `quickstart.yaml` indicates whether the quickstart needs only namespace-scoped resources (`project`) or also cluster-scoped resources (`cluster`).

---

## Navigation & Page Structure

```text
RHOAI Dashboard Sidebar
└── Community Plugins (shared section)
    └── Quickstarts Manager (plugin section)
        └── Quickstarts      → /quickstarts-manager/quickstarts
```

The single page conditionally renders one of two views based on the selected namespace:

- **No quickstart deployed** → Catalog view (browse, search, filter, install)
- **Quickstart deployed** → Status view (release info, Routes, upgrade/remove)

Both views share the `ProjectSelector` component at the top for namespace selection.

---

## Phases

### Phase 1: Foundation & Project Restructure

**Goal**: Remove seed demo pages, establish the new navigation/routing structure, and clean up the BFF for the new architecture.

**Deliverables**:

1. **Remove seed pages**
   - Delete `UserInfoPage.tsx`, `ClusterResourcesPage.tsx`, `NamespaceSummaryPage.tsx` and their tests
   - Delete `useK8sResources.ts`, `useNamespaceSummary.ts` and their tests

2. **Keep reusable components and hooks**
   - Components: `ProjectSelector`, `CreateProjectModal`, `CommunityBanner`, `QuickstartsManagerNavIcon`, `CommunityNavIcon`
   - Hooks: `useCurrentUser`, `useProjects`, `useFavoriteProjects`, `useLastSelectedProject`, `useAccessReview`

3. **Update extensions.ts**
   - Replace three `app.navigation/href` extensions (UserInfo, ClusterResources, NamespaceSummary) with a single "Quickstarts" nav item (`/quickstarts-manager/quickstarts`)

4. **Update App.tsx routing**
   - Single route: `quickstarts/*` → `QuickstartsPage`
   - Default redirect from `/` to `quickstarts`

5. **Create placeholder page**
   - `QuickstartsPage.tsx` — shell with `ProjectSelector` at top, placeholder content area that will become Catalog/Status views

6. **Update BFF**
   - Remove `namespaceSummary` route and handler
   - Keep health and config endpoints
   - Set up route file structure for catalog and lifecycle endpoints

7. **Update tests and verify**
   - Remove tests for deleted components
   - Add basic tests for the new page
   - Ensure `npm test` and `npm run lint` pass for both frontend and BFF

**Dependencies**: None (starting point)
**Estimated effort**: 2–3 days

---

### Phase 2: BFF — Quickstart Catalog & Metadata

**Goal**: Build the BFF services and endpoints that fetch, aggregate, and cache quickstart metadata from the registry and individual repos.

**Deliverables**:

1. **Registry client** (`bff/src/services/registryClient.ts`)
   - Fetch `quickstarts.yaml` from configurable raw GitHub URL (env vars: `QUICKSTART_REGISTRY_REPO`, `QUICKSTART_REGISTRY_BRANCH`, `QUICKSTART_REGISTRY_FILE`)
   - Parse YAML into typed quickstart list
   - In-memory cache with configurable TTL (env var: `CACHE_TTL`, default: 300s)
   - Graceful fallback on fetch failure (serve stale cache)

2. **Quickstart metadata client** (`bff/src/services/quickstartMetadataClient.ts`)
   - For each quickstart in the registry, fetch `quickstart.yaml` from its repo's raw URL
   - Parse and validate against expected schema (name, displayName, description, version, deployment, chart)
   - Per-quickstart cache with TTL
   - Concurrent fetches with concurrency limit (avoid GitHub rate limits)
   - Handle missing or malformed `quickstart.yaml` gracefully (mark as "metadata unavailable")

3. **Catalog routes** (`bff/src/routes/catalog.ts`)
   - `GET /api/catalog` — merged list: registry entry + resolved metadata for each quickstart. Response includes: name, displayName, description, version, repository, deployment scope, chart source, prerequisites, tags, RBAC requirements. Query param: `?refresh=true` to force cache invalidation.
   - `GET /api/catalog/:name` — full metadata for a single quickstart. Returns 404 if not found.

4. **Environment variable configuration**
   - Add all registry/cache env vars to BFF server startup
   - Document defaults in `AGENTS.md`

5. **Unit tests**
   - Registry client with mocked HTTP (cache hit/miss, stale fallback, parse errors)
   - Metadata client with mocked HTTP (concurrent fetch, missing metadata, malformed YAML)
   - Catalog route response shape and filtering

**Dependencies**: None (can run in parallel with Phase 1)
**Estimated effort**: 3–4 days

---

### Phase 3: BFF — Helm Service & Status

**Goal**: Build the Helm CLI wrapper and the status endpoint that checks for deployed quickstarts in a namespace.

**Deliverables**:

1. **Helm service** (`bff/src/services/helmService.ts`)
   - Create temporary kubeconfig per request using the forwarded Bearer token (write to temp file, delete after use)
   - Timeout handling (default: 330s)
   - Output buffer limit (default: 5MB)
   - Support for OCI chart references (`helm install <name> oci://...`)
   - Support for in-repo chart paths (fetch chart subdirectory via GitHub Trees + Blobs API to a temp dir, install from local path — see `bff/src/utils/githubChart.ts`)
   - Sanitize error output to prevent token leakage
   - Functions: `helmInstall`, `helmUpgrade`, `helmUninstall`, `helmList`
   - Validate Helm values (strict patterns for keys/values to prevent injection)

2. **K8s API client** (`bff/src/services/k8sApiClient.ts`)
   - Authenticated requests to K8s API using forwarded Bearer token
   - Route discovery: list OpenShift Routes in a namespace (`GET /apis/route.openshift.io/v1/namespaces/{ns}/routes`)
   - In-cluster and out-of-cluster auto-detection (same pattern as existing `k8sClient.ts`)

3. **Status endpoint** (`bff/src/routes/status.ts`)
   - `GET /api/quickstarts/status?namespace=X` — check for Helm releases in the namespace using `helm list`
   - If a release exists: return release name, chart, version, status, app version, and discovered Routes (with URLs)
   - If no release: return 404
   - Validate namespace parameter (block protected namespaces: `kube-system`, `openshift-*`, `redhat-ods-*`)

4. **Unit tests**
   - Helm service with mocked `child_process.execFile` (install, upgrade, uninstall, error sanitization)
   - K8s API client with mocked HTTP (route discovery)
   - Status endpoint (release found, no release, protected namespace rejection)

**Dependencies**: None (can run in parallel with Phases 1 and 2)
**Estimated effort**: 4–5 days

---

### Phase 4: BFF — Lifecycle Operations

**Goal**: Build the lifecycle endpoints that install, upgrade, and remove quickstarts via Helm.

**Deliverables**:

1. **Lifecycle service** (`bff/src/services/lifecycleService.ts`)
   - **Install flow**: resolve quickstart metadata from catalog → validate RBAC in target namespace (via SelfSubjectAccessReview) → run `helm install` → discover created Routes → return result
   - **Upgrade flow**: discover existing Helm release namespace → resolve latest metadata → run `helm upgrade` → return result
   - **Remove flow**: discover release → run `helm uninstall` → return result
   - Handle both OCI and in-repo chart sources (delegate to helmService)

2. **Lifecycle routes** (`bff/src/routes/lifecycle.ts`)
   - `POST /api/quickstarts/:name/install` — body: `{ namespace, values? }`. Validates: Bearer token, quickstart name pattern, namespace not protected. Supports SSE progress streaming (`Accept: text/event-stream`).
   - `POST /api/quickstarts/:name/upgrade` — body: `{ namespace }`. Supports SSE.
   - `DELETE /api/quickstarts/:name?namespace=X` — Supports SSE.
   - Quickstart name validation: `/^[a-z][a-z0-9-]{0,62}[a-z0-9]$/`
   - SSE heartbeat every 15s for long-running operations

3. **RBAC pre-check utility** (`bff/src/services/rbacChecker.ts`)
   - Given a list of required permissions (from `quickstart.yaml`) and a target namespace, check each via SelfSubjectAccessReview
   - Return structured result: which permissions are granted, which are denied
   - Used by lifecycle service before install

4. **Unit tests**
   - Lifecycle service with mocked Helm and K8s clients (install, upgrade, remove flows)
   - Lifecycle routes (request validation, SSE streaming, error responses)
   - RBAC checker with mocked SelfSubjectAccessReview responses

**Dependencies**: Phase 2 (catalog for metadata resolution), Phase 3 (Helm service, K8s client)
**Estimated effort**: 5–7 days

---

### Phase 5: Catalog View

**Goal**: Build the frontend catalog browsing experience showing available quickstarts when no quickstart is deployed in the selected namespace.

**Deliverables**:

1. **Catalog data hook** (`src/app/hooks/useQuickstartCatalog.ts`)
   - Fetches from BFF `GET /quickstarts-manager/api/catalog`
   - Returns typed quickstart list with loading/error states and a `refresh()` function
   - Supports `?refresh=true` for cache bypass

2. **Quickstart status hook** (`src/app/hooks/useQuickstartStatus.ts`)
   - Fetches from BFF `GET /quickstarts-manager/api/quickstarts/status?namespace=X`
   - Returns Helm release info + discovered Routes, or `null` if nothing deployed
   - Re-fetches when selected namespace changes
   - Returns loading/error states and a `refresh()` function

3. **QuickstartsPage** (`src/app/pages/QuickstartsPage.tsx`)
   - `ProjectSelector` at top for namespace selection
   - Conditionally renders `CatalogView` or `StatusView` based on `useQuickstartStatus` result
   - Loading skeleton while status is being checked

4. **Catalog view component** (`src/app/components/CatalogView.tsx`)
   - PatternFly card grid listing all available quickstarts
   - Each card shows: display name, description, version, tags as labels, deployment scope badge
   - Click card → expand detail panel or modal

5. **Catalog filtering and search**
   - Text search by name/description
   - Filter by tags
   - Refresh button (bypasses cache)

6. **Quickstart detail panel** (`src/app/components/QuickstartDetailPanel.tsx`)
   - Full description, version, maintainer, repository link
   - Prerequisites list (informational warnings)
   - Required RBAC permissions
   - Deployment scope and chart source info
   - "Install" button (wired up in Phase 6)

7. **Unit tests**
   - Hook tests with mocked BFF responses
   - Page rendering with catalog vs. status conditional
   - Catalog view: card rendering, search, filtering
   - Detail panel rendering

**Dependencies**: Phase 1 (routing/page structure), Phase 2 (BFF catalog endpoint)
**Estimated effort**: 4–5 days

---

### Phase 6: Status View & Lifecycle UI

**Goal**: Build the status view for deployed quickstarts and wire up install/upgrade/remove actions from the UI.

**Deliverables**:

1. **Lifecycle hook** (`src/app/hooks/useQuickstartLifecycle.ts`)
   - `install(name, namespace, values?)` — POST to BFF, handle SSE progress streaming
   - `upgrade(name, namespace)` — POST to BFF with SSE
   - `remove(name, namespace)` — DELETE to BFF with SSE
   - Returns operation state: `idle | in_progress | success | error`
   - Progress messages from SSE for display in UI

2. **Status view component** (`src/app/components/StatusView.tsx`)
   - Helm release info: name, version, status badge (deployed/failed/pending), chart, app version
   - Discovered Routes displayed as clickable links (open in new tab)
   - Upgrade button (shown when installed version differs from latest in catalog)
   - Remove button with confirmation modal
   - Refresh button to re-check status

3. **Install flow UI**
   - Install button in `QuickstartDetailPanel` (from Phase 5)
   - Namespace selection (already done via ProjectSelector)
   - Optional: Helm values override form for `defaultValues` from `quickstart.yaml`
   - Progress modal with SSE messages during install
   - Success state → automatically switch to Status view
   - Error state → display error message with retry option

4. **Remove confirmation modal** (`src/app/components/RemoveQuickstartModal.tsx`)
   - Confirmation dialog warning about data loss
   - Require quickstart name re-typing for safety
   - Progress display during removal
   - On success → switch back to Catalog view

5. **Upgrade flow UI**
   - Upgrade button in StatusView
   - Progress modal with SSE messages
   - On success → refresh status view

6. **Unit tests**
   - Lifecycle hook with mocked fetch/SSE
   - Status view rendering with various release states
   - Install flow: progress display, success/error states
   - Remove modal: confirmation, name validation
   - Upgrade flow

**Dependencies**: Phase 4 (BFF lifecycle endpoints), Phase 5 (catalog view, detail panel)
**Estimated effort**: 5–7 days

---

### Phase 7: Helm Chart & Deployment Updates

**Goal**: Update the Helm chart, container images, and CI/CD for the new architecture.

**Deliverables**:

1. **BFF container image**
   - Update `bff/Containerfile` to include `helm` CLI binary (download with SHA256 verification)
   - Ensure the container runs as non-root (UID 1001) with Helm home set to a writable directory

2. **BFF RBAC resources in Helm chart**
   - `chart/templates/bff-serviceaccount.yaml` — dedicated ServiceAccount for BFF
   - `chart/templates/bff-clusterrole.yaml` — ClusterRole with permissions for:
     - Creating/deleting namespaces (for quickstart deployment)
     - Managing Helm-deployed resources across namespaces (Deployments, Services, ConfigMaps, Secrets, Routes, etc.)
     - SelfSubjectAccessReview (for RBAC pre-checks)
   - `chart/templates/bff-clusterrolebinding.yaml` — binds ClusterRole to BFF ServiceAccount
   - Toggle via `bff.rbac.create` value (default: true)

3. **Helm chart values**
   - Add registry URL configuration (`bff.registryUrl`, `bff.registryBranch`, `bff.registryFile`)
   - Add cache TTL (`bff.cacheTtl`)
   - Map values to BFF environment variables in `bff-deployment.yaml`

4. **Plugin manifest** (`plugin.yaml`)
   - Update `rbac` section to declare required cluster roles
   - Update description to reflect actual functionality

5. **CI/CD workflows**
   - Ensure CI runs BFF tests
   - Verify both container images build successfully
   - Update build-push workflow if needed

6. **Documentation**
   - Update `docs/deployment/OPENSHIFT_DEPLOY.md` with RBAC prerequisites
   - Document registry configuration options

**Dependencies**: Phase 4 (lifecycle operations define RBAC needs)
**Estimated effort**: 2–3 days

---

### Phase 8: Testing, Polish & Documentation

**Goal**: Comprehensive testing, UX polish, and documentation updates.

**Deliverables**:

1. **Integration testing**
   - End-to-end flow: select namespace → browse catalog → open detail → install → verify status → view Routes → upgrade → remove
   - Test RBAC-denied scenarios (install button disabled, tooltips explaining missing permissions)
   - Test with real quickstart repos from `rh-ai-quickstart` org

2. **UX polish**
   - Loading states and skeleton screens on catalog and status views
   - Error boundaries with meaningful messages
   - Empty states: catalog unavailable, registry unreachable, no quickstarts match filters
   - Responsive layout for catalog card grid
   - Keyboard navigation and accessibility (a11y)

3. **Edge cases and error handling**
   - Registry repo unreachable (serve stale cache, show warning)
   - Quickstart repo unreachable or missing `quickstart.yaml`
   - Helm install timeout or failure (cleanup partial resources)
   - Namespace already has a deployed quickstart (enforce one-per-namespace)
   - Protected namespace selected (block install, show explanation)
   - SSE connection drops during long operation (reconnect or show final state on refresh)

4. **Documentation updates**
   - Update `AGENTS.md` / `CLAUDE.md` with final architecture
   - Update `docs/architecture/` with catalog and lifecycle docs
   - Update `docs/development/` with BFF development guide
   - Update `README.md` with final feature set
   - Finalize `docs/quickstart-spec.md` based on implementation experience

**Dependencies**: All previous phases
**Estimated effort**: 3–5 days

---

## Summary

| Phase | Description | Effort | Dependencies |
|---|---|---|---|
| 1 | Foundation & Project Restructure | 2–3 days | — |
| 2 | BFF — Quickstart Catalog & Metadata | 3–4 days | — |
| 3 | BFF — Helm Service & Status | 4–5 days | — |
| 4 | BFF — Lifecycle Operations | 5–7 days | Phases 2, 3 |
| 5 | Catalog View | 4–5 days | Phases 1, 2 |
| 6 | Status View & Lifecycle UI | 5–7 days | Phases 4, 5 |
| 7 | Helm Chart & Deployment Updates | 2–3 days | Phase 4 |
| 8 | Testing, Polish & Documentation | 3–5 days | All |
| **Total** | | **28–39 days** | |

### Parallelization Opportunities

Phases 1, 2, and 3 can all run in parallel (frontend cleanup, catalog BFF, Helm BFF).
Phases 5 and 7 can run in parallel once their dependencies are met.
Phase 8 is incremental and can start during Phase 6.

### Critical Path

Phase 3 → Phase 4 → Phase 6 → Phase 8

---

## Open Questions & Future Considerations

### Resolved

1. **In-repo chart fetching** (issue #13): For quickstarts using `chart.type: repo`, the BFF fetches only the chart subdirectory via the **GitHub Git Trees + Blobs API** (`bff/src/utils/githubChart.ts`) rather than downloading a full repo tarball. The recursive tree is listed once, blob paths under `chart.path` are filtered, and each blob is fetched and written to a temp directory (cleaned up after the Helm operation). Includes rate-limit detection (`X-RateLimit-Remaining`/`-Reset`), optional `GITHUB_TOKEN` auth, and GitHub Enterprise support via `GITHUB_API_BASE` (or derived from the repo host).

### Open

1. **Version detection for upgrades**: Should the BFF compare the installed Helm release version against the `version` field in the quickstart's `quickstart.yaml`? Or against the Helm chart's `Chart.yaml` version? These may differ.

2. **GPU/prerequisite validation**: Prerequisites in `quickstart.yaml` are currently informational (displayed to user). Should the BFF attempt to validate any of them automatically (e.g., check for GPU nodes via K8s API)?

3. **Namespace cleanup on remove**: When removing a quickstart, should we offer to delete the namespace too? This is destructive if the user has other resources in the same namespace.

4. **Offline / air-gapped clusters**: The BFF fetches metadata from GitHub. How should the plugin behave in disconnected environments? A local/mirrored registry could be configured via the env vars.

5. **Rate limiting**: With many quickstarts, concurrent metadata fetches may hit GitHub's unauthenticated rate limit (60/hour). Should we support an optional GitHub token for higher limits?

6. **Helm values customization**: Should the install dialog expose all Helm values for editing, or only the `defaultValues` declared in `quickstart.yaml`? Full exposure is more flexible but harder to UX.

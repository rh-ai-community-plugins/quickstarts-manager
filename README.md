# Quickstarts Manager

A community plugin for the **Red Hat OpenShift AI (RHOAI) Dashboard** that lets users browse, deploy, and manage AI Quickstarts from the [rh-ai-quickstart](https://github.com/rh-ai-quickstart) organization — directly from the dashboard UI.

## What It Does

Each AI Quickstart is a standalone application (chatbot, RAG pipeline, model serving stack, etc.) living in its own GitHub repository, deployable via a Helm chart. This plugin provides:

- **Catalog** — Browse a curated list of available quickstarts with descriptions, prerequisites, and tags
- **One-click deploy** — Install a quickstart into any namespace the user has access to via Helm
- **Status tracking** — View Helm release status and auto-discovered Routes for deployed quickstarts
- **Lifecycle management** — Upgrade or remove deployed quickstarts

The plugin enforces **one quickstart per namespace** to avoid resource name collisions. When a namespace is selected:

- If nothing is deployed → the **Catalog view** is shown
- If a quickstart is deployed → the **Status view** is shown (with upgrade/remove actions and Route shortcuts)

### How It Works

The plugin consists of a frontend (Module Federation remote loaded by the dashboard) and a BFF backend service (Express.js). The dashboard proxies `/quickstarts-manager/api/*` requests to the BFF, forwarding the user's Bearer token. The BFF:

1. Fetches the curated quickstart list from a configurable GitHub repository (`quickstarts.yaml`)
2. Fetches individual quickstart metadata (`quickstart.yaml`) from each quickstart's repo
3. Runs Helm CLI operations (install/upgrade/uninstall) using a temporary kubeconfig built from the forwarded token
4. Discovers OpenShift Routes in the target namespace to provide application shortcuts

This is the same pattern used by [community-plugins-admin](https://github.com/rh-ai-community-plugins/community-plugins-admin), minus the dashboard `MODULE_FEDERATION_CONFIG` patching (quickstarts are standalone apps, not dashboard plugins).

## For Quickstart Authors

To have your quickstart featured in this plugin, add a `quickstart.yaml` metadata file to the root of your repository. See [`quickstart.yaml.template`](quickstart.yaml.template) for the full spec and an annotated example.

The file declares:

- Identity (name, description, version)
- Helm chart location (OCI registry reference or path within the repo)
- Deployment scope (project or cluster)
- Required RBAC permissions
- Prerequisites (GPU, storage, etc.)

Then request inclusion by submitting a PR to add your quickstart to the curated registry.

## Deploy This Plugin

### On an Existing RHOAI Dashboard

**Prerequisites:** Helm, `oc` CLI access to the cluster, and access to the `redhat-ods-applications` namespace (typically requires cluster-admin).

#### 1. Install the plugin

Install directly from the OCI registry:

```bash
helm install quickstarts-manager oci://quay.io/rh-ai-community-plugins/quickstarts-manager-chart \
  --version 0.1.0 \
  --namespace cp-quickstarts-manager \
  --create-namespace
```

Or from a local checkout:

```bash
helm install quickstarts-manager chart/ \
  --namespace cp-quickstarts-manager \
  --create-namespace
```

This creates Deployments and Services for both the frontend (Nginx serving `remoteEntry.js`) and the BFF (Node.js with Helm CLI). To deploy the frontend only, add `--set bff.enabled=false`.

#### 2. Register with the RHOAI Dashboard

Retrieve the current Module Federation configuration, append the plugin entry, and apply it:

```bash
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config.append({
  'name': 'quickstartsManager',
  'backend': {
    'remoteEntry': '/remoteEntry.js',
    'authorize': False,
    'tls': False,
    'service': {
      'name': 'quickstarts-manager',
      'namespace': 'cp-quickstarts-manager',
      'port': 8080
    }
  },
  'proxyService': [{
    'path': '/quickstarts-manager/api',
    'pathRewrite': '/api',
    'authorize': True,
    'tls': False,
    'service': {
      'name': 'quickstarts-manager-bff',
      'namespace': 'cp-quickstarts-manager',
      'port': 3000
    }
  }]
})
print(json.dumps(config))
" > /tmp/mf-config-extended.json

oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-extended.json)"
```

New dashboard pods roll out automatically. After roughly two minutes, reload the dashboard to see the plugin.

#### 3. Verify

```bash
oc set env deployment/rhods-dashboard -n redhat-ods-applications --list \
  | grep '^MODULE_FEDERATION_CONFIG=' \
  | head -n1 \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read().split('=',1)[1].strip()); print('\n'.join(e['name'] for e in d))"
```

You should see `quickstartsManager` in the list.

## Development

### Local Setup

Developing the plugin requires a running RHOAI dashboard connected to a real OpenShift cluster. See the full [Local Setup Guide](docs/development/LOCAL_SETUP.md) for details.

```bash
npm install              # Install frontend dependencies
npm run start:dev        # Start plugin dev server on port 9500
```

Start the BFF in a separate terminal:

```bash
cd bff
npm install
K8S_API_BASE=$(oc whoami --show-server) npm run start:dev   # BFF on port 3000
```

> **Tip:** Add `K8S_TLS_INSECURE=true` if your cluster uses a self-signed certificate.

### Build & Test

```bash
npm run build           # Production build to dist/
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Tests with coverage report
npm run lint            # ESLint + markdownlint
```

A `Makefile` is also available for unified operations across frontend and BFF — run `make help` for the full list.

## Documentation

See the [docs/](docs/) directory for detailed guides:

- **[Architecture](docs/architecture/)** — Plugin system internals, BFF pattern, extension contract
- **[Development](docs/development/)** — Local environment setup, customization, API reference
- **[Deployment](docs/deployment/)** — Deploying the plugin on OpenShift with Helm

## License

Apache-2.0

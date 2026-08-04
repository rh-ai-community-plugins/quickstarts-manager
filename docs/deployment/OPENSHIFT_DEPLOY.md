# Deploying the Plugin on OpenShift

This guide walks through deploying the plugin on an OpenShift cluster that already has the Red Hat OpenShift AI (RHOAI) Dashboard running.

## Prerequisites

- **Helm** — to install the plugin chart
- **`oc` CLI** — logged in to the target OpenShift cluster
- **Access to `redhat-ods-applications`** — typically requires cluster-admin, since you need to modify the dashboard's Deployment
- **Cluster-admin permissions** — the Helm chart creates a ClusterRole and ClusterRoleBinding for the BFF service (see [RBAC](#rbac) below)

> **ODH vs RHOAI:** This guide uses the RHOAI dashboard namespace `redhat-ods-applications` and deployment name `rhods-dashboard`. If you are running the Open Data Hub (ODH) upstream distribution instead, substitute `opendatahub` for the namespace and `odh-dashboard` for the deployment name throughout.

---

## 1. Install the Plugin

Install directly from the OCI registry — no need to clone the repo:

```bash
helm install quickstarts-manager oci://quay.io/rh-ai-community-plugins/quickstarts-manager-chart \
  --version 0.1.0 \
  --namespace cp-quickstarts-manager \
  --create-namespace
```

Or, from a local checkout of the repository:

```bash
helm install quickstarts-manager chart/ \
  --namespace cp-quickstarts-manager \
  --create-namespace
```

This creates:

- A **Deployment** and **Service** (`quickstarts-manager`) serving the plugin's static assets (including `remoteEntry.js`) via Nginx on port 8080
- A **BFF Deployment** and **Service** (`quickstarts-manager-bff`) running the plugin's backend service on port 3000 (enabled by default)
- A **ServiceAccount** (`quickstarts-manager-bff`) for the BFF pod
- A **ClusterRole** and **ClusterRoleBinding** granting the BFF permissions to manage quickstart resources across namespaces (see [RBAC](#rbac))

### Overriding Defaults

Pass `--set` flags to customize the installation:

```bash
helm install quickstarts-manager oci://quay.io/rh-ai-community-plugins/quickstarts-manager-chart \
  --version 0.1.0 \
  --namespace cp-quickstarts-manager \
  --create-namespace \
  --set replicaCount=2
```

To deploy the frontend only (no BFF):

```bash
helm install quickstarts-manager oci://quay.io/rh-ai-community-plugins/quickstarts-manager-chart \
  --version 0.1.0 \
  --namespace cp-quickstarts-manager \
  --create-namespace \
  --set bff.enabled=false
```

### Quickstart Registry Configuration

The BFF fetches the list of available quickstarts from a curated registry file hosted on GitHub. By default it uses this repository's own `quickstarts.yaml`, but you can point it to a different registry:

```bash
helm install quickstarts-manager oci://quay.io/rh-ai-community-plugins/quickstarts-manager-chart \
  --version 0.1.0 \
  --namespace cp-quickstarts-manager \
  --create-namespace \
  --set bff.registryRepo=https://github.com/my-org/my-quickstarts \
  --set bff.registryBranch=main \
  --set bff.registryFile=quickstarts.yaml \
  --set bff.cacheTtl=600
```

See [Helm Chart Reference](#helm-chart-reference) for the full list of configurable values.

---

## 2. Register with the RHOAI Dashboard

The dashboard discovers plugins through the `MODULE_FEDERATION_CONFIG` environment variable on its Deployment. You need to append this plugin's entry to that configuration.

### Frontend Only

If you deployed without the BFF (or want to register the frontend first), use this configuration:

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
  }
})
print(json.dumps(config))
" > /tmp/mf-config-extended.json

oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-extended.json)"
```

### Frontend + BFF

If you deployed with the BFF enabled, add a `proxyService` entry so the dashboard proxies API requests to the BFF service:

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

The `proxyService` entry tells the dashboard to forward requests from `/quickstarts-manager/api/*` to the BFF service, rewriting the path to `/api/*` and forwarding the user's Bearer token (`authorize: true`).

### Why `MODULE_FEDERATION_CONFIG` Instead of the ConfigMap?

The RHOAI operator reconciles the `federation-config` ConfigMap, which means direct edits to it may be reverted. Setting the environment variable on the Deployment overrides the ConfigMap value and survives operator reconciliation.

New dashboard pods roll out automatically after the environment variable is set. After roughly two minutes, reload the RHOAI Dashboard in your browser to see the plugin's sidebar entries.

---

## 3. Verify

### Check registration

Confirm the plugin appears in the dashboard's federation config:

```bash
oc set env deployment/rhods-dashboard -n redhat-ods-applications --list \
  | grep MODULE_FEDERATION_CONFIG \
  | python3 -c "
import json, sys
data = json.loads(sys.stdin.read().split('=', 1)[1])
for entry in data:
    name = entry['name']
    has_proxy = bool(entry.get('proxyService'))
    print(f'  {name}' + (' (+ BFF proxy)' if has_proxy else ''))
"
```

### Check pods

Verify the plugin pods are running:

```bash
oc get pods -n cp-quickstarts-manager
```

You should see pods for `quickstarts-manager` (and `quickstarts-manager-bff` if BFF is enabled), all in `Running` status.

### Check the dashboard

Open the RHOAI Dashboard in your browser. You should see the plugin's pages in the sidebar.

---

## Uninstalling

### 1. Remove from the dashboard federation config

Retrieve the current config, remove the `quickstartsManager` entry, and re-apply:

```bash
oc get configmap federation-config \
  -n redhat-ods-applications \
  -o jsonpath='{.data.module-federation-config\.json}' \
| python3 -c "
import json, sys
config = json.load(sys.stdin)
config = [e for e in config if e.get('name') != 'quickstartsManager']
print(json.dumps(config))
" > /tmp/mf-config-reduced.json

oc set env deployment/rhods-dashboard \
  -n redhat-ods-applications \
  "MODULE_FEDERATION_CONFIG=$(cat /tmp/mf-config-reduced.json)"
```

### 2. Uninstall the Helm release

```bash
helm uninstall quickstarts-manager -n cp-quickstarts-manager
oc delete namespace cp-quickstarts-manager   # optional: remove the namespace entirely
```

---

## RBAC

The BFF service manages quickstart lifecycle operations (install, upgrade, remove) by running Helm commands and querying the Kubernetes API. The Helm chart creates the following RBAC resources:

- **ServiceAccount** (`quickstarts-manager-bff`) — dedicated identity for the BFF pod
- **ClusterRole** (`quickstarts-manager-bff`) — permissions to manage resources across namespaces
- **ClusterRoleBinding** — binds the ClusterRole to the BFF ServiceAccount

The ClusterRole grants permissions for:

| API Group | Resources | Verbs |
|---|---|---|
| `""` (core) | namespaces | get, list, create, update, patch |
| `""` (core) | services, configmaps, secrets, serviceaccounts, persistentvolumeclaims | get, list, watch, create, update, patch, delete |
| `apps` | deployments, statefulsets, daemonsets, replicasets | get, list, create, update, patch, delete |
| `rbac.authorization.k8s.io` | roles, rolebindings | get, list, create, update, patch, delete |
| `networking.k8s.io` | ingresses, networkpolicies | get, list, create, update, patch, delete |
| `route.openshift.io` | routes | get, list, create, update, patch, delete |
| `authorization.k8s.io` | selfsubjectaccessreviews | create |

To disable RBAC resource creation (e.g., if you manage RBAC externally):

```bash
helm install quickstarts-manager chart/ \
  --set bff.rbac.create=false \
  --set bff.serviceAccount.name=my-existing-sa
```

---

## Helm Chart Reference

Key values in `chart/values.yaml`:

| Parameter | Default | Description |
|---|---|---|
| `namespace` | `cp-quickstarts-manager` | Target namespace for all namespaced resources |
| `image.repository` | `quay.io/rh-ai-community-plugins/quickstarts-manager` | Frontend container image |
| `image.tag` | `""` (defaults to appVersion) | Frontend image tag |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `replicaCount` | `1` | Frontend replicas |
| `service.type` | `ClusterIP` | Frontend Service type |
| `service.port` | `8080` | Frontend Service port |
| `resources.requests.cpu` | `50m` | Frontend CPU request |
| `resources.requests.memory` | `64Mi` | Frontend memory request |
| `resources.limits.cpu` | `100m` | Frontend CPU limit |
| `resources.limits.memory` | `128Mi` | Frontend memory limit |
| `bff.enabled` | `true` | Deploy the BFF service |
| `bff.image.repository` | `quay.io/rh-ai-community-plugins/quickstarts-manager-bff` | BFF container image |
| `bff.image.tag` | `""` (defaults to appVersion) | BFF image tag |
| `bff.service.port` | `3000` | BFF Service port |
| `bff.resources.requests.cpu` | `100m` | BFF CPU request |
| `bff.resources.requests.memory` | `128Mi` | BFF memory request |
| `bff.resources.limits.cpu` | `200m` | BFF CPU limit |
| `bff.resources.limits.memory` | `256Mi` | BFF memory limit |
| `bff.serviceAccount.create` | `true` | Create a ServiceAccount for the BFF |
| `bff.serviceAccount.name` | `""` | Override ServiceAccount name |
| `bff.rbac.create` | `true` | Create ClusterRole and ClusterRoleBinding |
| `bff.registryRepo` | `https://github.com/rh-ai-community-plugins/quickstarts-manager` | GitHub repo hosting the quickstart registry |
| `bff.registryBranch` | `main` | Branch to fetch the registry file from |
| `bff.registryFile` | `quickstarts.yaml` | Registry filename within the repo |
| `bff.cacheTtl` | `300` | Cache duration in seconds for catalog data |

For the complete list, see [`chart/values.yaml`](../../chart/values.yaml).

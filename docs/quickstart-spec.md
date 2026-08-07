# Quickstart Metadata Specification

This document defines the `quickstart.yaml` file format that AI Quickstart repositories must include to be featured in the Quickstarts Manager plugin.

## Overview

The `quickstart.yaml` file lives at the root of a quickstart repository. It provides the Quickstarts Manager plugin with everything it needs to display, validate, install, and manage the quickstart.

See [`quickstart.yaml.template`](/quickstart.yaml.template) for an annotated example.

## Fields

### Identity

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | Yes | string | Machine-readable name. Lowercase, hyphens only, max 63 chars. Must match the entry in the curated `quickstarts.yaml` registry. |
| `displayName` | Yes | string | Human-readable name shown in the catalog UI. |
| `description` | Yes | string | Short description (1-2 sentences) shown on catalog cards. |
| `version` | Yes | string | Semver version of the quickstart. Used to detect available upgrades. |
| `icon` | No | string (URL) | URL to an icon image (SVG or PNG). Falls back to a default icon. |
| `image` | No | string (URL) | URL to a preview image (PNG or JPG) shown in the catalog detail modal. |

### Maintainer

| Field | Required | Type | Description |
|---|---|---|---|
| `maintainer.name` | Yes | string | Display name of the maintainer or team. |
| `maintainer.github` | No | string | GitHub username or organization. |

### Source

| Field | Required | Type | Description |
|---|---|---|---|
| `repository` | Yes | string (URL) | URL to the quickstart's GitHub repository. |

### Deployment

| Field | Required | Type | Description |
|---|---|---|---|
| `deployment.scope` | Yes | `project` \| `cluster` | `project` = namespace-scoped only. `cluster` = requires cluster-scoped resources (CRDs, ClusterRoles). |
| `deployment.chart.type` | Yes | `oci` \| `repo` | How to locate the Helm chart. |
| `deployment.chart.ref` | If type=oci | string | OCI registry reference (e.g., `oci://quay.io/org/chart`). |
| `deployment.chart.path` | If type=repo | string | Path to the chart directory within the repository (e.g., `chart/`, `deploy/helm/`). |
| `deployment.chart.branch` | No | string | Branch to use for in-repo charts. Defaults to `main`. |
| `deployment.defaultValues` | No | object | Base Helm values silently applied on every install and upgrade. Not shown in the UI; use `configurableValues` for anything the user should be able to see or change. |
| `deployment.configurableValues` | No | array | User-editable Helm values, rendered as a form behind "Show advanced options" in the install dialog and pre-filled from the live release in the upgrade dialog. See [Configurable values](#configurable-values) below. |

#### Configurable values

`deployment.configurableValues` declares which Helm values a user can see and edit before installing or upgrading. Each entry renders as one form field:

| Field | Required | Type | Description |
|---|---|---|---|
| `key` | Yes | string | Helm dot-path key (e.g. `replicaCount`, `model.name`), sent as `--set <key>=<value>`. |
| `label` | No | string | Field label shown in the form. Falls back to `key`. |
| `description` | No | string | Helper text shown below the field. |
| `type` | Yes | `string` \| `number` \| `boolean` | Determines the input rendered (text/number field, or switch). |
| `default` | No | string \| number \| boolean | Pre-filled value in the install dialog. |
| `required` | No | boolean | Whether the field must have a value before install/upgrade proceeds. Defaults to `false`. |
| `options` | No | array of strings | `string` type only. Renders the field as a dropdown restricted to these values instead of free text. |

```yaml
deployment:
  configurableValues:
    - key: replicaCount
      label: Replica count
      description: Backend replicas to run.
      type: number
      default: 1
      required: false
    - key: model.name
      label: Model
      type: string
      default: llama-3
      options: [llama-3, mistral-7b]
  defaultValues: {} # silent base values, merged underneath configurableValues
```

On submit, the plugin sends all `configurableValues` field values as a flat dot-path map; the BFF merges them over `defaultValues` before running Helm. The upgrade dialog pre-fills each field from the values actually installed in the release (via `helm get values`), falling back to the field's `default` when a key isn't set. Values are constrained to flat scalars (string/number/boolean, no nested objects or arrays) — see the BFF's Helm value validation for the exact character and count limits.

### RBAC

| Field | Required | Type | Description |
|---|---|---|---|
| `rbac.requiredPermissions` | No | array | List of permissions the user must have in the target namespace. Each entry has `apiGroup`, `resource`, and `verbs`. The plugin checks these via SelfSubjectAccessReview before allowing install. |

### Prerequisites

| Field | Required | Type | Description |
|---|---|---|---|
| `prerequisites` | No | array of strings | Free-text requirements shown in the catalog detail panel (GPU, storage, external services). These are informational — the plugin does not validate them automatically. |

### Tags

| Field | Required | Type | Description |
|---|---|---|---|
| `tags` | No | array of strings | Lowercase tags for catalog filtering (e.g., `chatbot`, `rag`, `llm`). |

## Helm Chart Modes

Quickstart repositories vary in how they organize their Helm charts. The `deployment.chart` section supports two modes:

### OCI Registry (recommended)

The chart is published to an OCI-compatible registry. The plugin runs `helm install <name> <ref> --version <version>`.

```yaml
deployment:
  chart:
    type: oci
    ref: oci://quay.io/rh-ai-quickstart/my-quickstart-chart
```

### In-Repo Path

The chart lives inside the quickstart's Git repository. The plugin fetches only the chart subdirectory (via the GitHub Trees + Blobs API) to a temp directory and installs from that local path — no full clone or archive download. The repository must be on public github.com.

```yaml
deployment:
  chart:
    type: repo
    path: chart/
    branch: main  # optional, defaults to main
```

OCI is preferred because it avoids fetching chart files from GitHub at install time and supports proper versioning. In-repo is provided for quickstarts that haven't published to a registry yet.

## Version Detection

The plugin compares the `version` field in the quickstart's `quickstart.yaml` (fetched from the source repo, bypassing cache on refresh) against the version of the installed Helm release. If they differ, an upgrade is offered in the Status view.

## Adding Your Quickstart to the Registry

1. Add a `quickstart.yaml` to the root of your repository following this spec.
2. Submit a pull request to the [quickstarts-manager registry](https://github.com/rh-ai-community-plugins/quickstarts-manager) adding your quickstart to `quickstarts.yaml`:

```yaml
quickstarts:
  # ... existing entries ...
  - name: your-quickstart-name
    repository: https://github.com/rh-ai-quickstart/your-quickstart
```

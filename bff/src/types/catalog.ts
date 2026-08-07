// --- Registry types (quickstarts.yaml) ---

export interface RegistryQuickstart {
  name: string;
  repository: string;
  branch?: string;
}

export interface RegistryFile {
  quickstarts: RegistryQuickstart[];
}

// --- Quickstart metadata types (per-repo quickstart.yaml) ---

export interface QuickstartMaintainer {
  name: string;
  github?: string;
}

export interface QuickstartChartOci {
  type: 'oci';
  ref: string;
}

export interface QuickstartChartRepo {
  type: 'repo';
  path: string;
  branch?: string;
}

export type QuickstartChart = QuickstartChartOci | QuickstartChartRepo;

export interface QuickstartConfigurableValue {
  key: string;
  label?: string;
  description?: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  required?: boolean;
  options?: string[]; // enum for string type → dropdown
}

export interface QuickstartDeployment {
  scope: 'project' | 'cluster';
  chart: QuickstartChart;
  defaultValues?: Record<string, unknown>;
  configurableValues?: QuickstartConfigurableValue[];
}

export interface QuickstartPermission {
  apiGroup: string;
  resource: string;
  verbs: string[];
}

export interface QuickstartRbac {
  requiredPermissions?: QuickstartPermission[];
}

export interface QuickstartMetadata {
  name: string;
  displayName: string;
  description: string;
  version: string;
  icon?: string;
  image?: string;
  maintainer: QuickstartMaintainer;
  repository: string;
  deployment: QuickstartDeployment;
  rbac?: QuickstartRbac;
  prerequisites?: string[];
  tags?: string[];
}

// --- Catalog response types (merged registry + metadata) ---

export interface CatalogQuickstart {
  name: string;
  repository: string;
  metadataAvailable: boolean;
  displayName?: string;
  description?: string;
  version?: string;
  icon?: string;
  image?: string;
  maintainer?: QuickstartMaintainer;
  deployment?: QuickstartDeployment;
  rbac?: QuickstartRbac;
  prerequisites?: string[];
  tags?: string[];
}

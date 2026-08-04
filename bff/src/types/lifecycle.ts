export interface LifecycleStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface InstallRequest {
  namespace: string;
  values?: Record<string, unknown>;
}

export interface UpgradeRequest {
  namespace: string;
  values?: Record<string, unknown>;
}

export interface LifecycleResponse {
  success: boolean;
  message: string;
  steps: LifecycleStep[];
  routes?: Array<{ name: string; url: string }>;
}

export type LifecycleProgressCallback = (steps: LifecycleStep[]) => void;

export interface RbacCheckResult {
  allowed: boolean;
  granted: Array<{ apiGroup: string; resource: string; verbs: string[] }>;
  denied: Array<{ apiGroup: string; resource: string; verb: string }>;
}

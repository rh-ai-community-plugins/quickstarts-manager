export type LifecycleOperation = 'install' | 'upgrade' | 'remove';

export interface LifecycleStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface LifecycleResponse {
  success: boolean;
  message: string;
  steps: LifecycleStep[];
  routes?: Array<{ name: string; url: string }>;
}

export interface LifecycleProgressEvent {
  steps: LifecycleStep[];
}

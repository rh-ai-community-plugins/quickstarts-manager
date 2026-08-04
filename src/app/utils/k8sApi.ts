export type K8sResource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    uid: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
};

export async function createK8sResource(
  apiPath: string,
  resource: Record<string, unknown>,
): Promise<K8sResource> {
  const response = await fetch(`/api/k8s${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resource),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.message || `Failed to create resource: ${response.status}`,
    );
  }
  return response.json();
}

export async function deleteK8sResource(apiPath: string): Promise<void> {
  const response = await fetch(`/api/k8s${apiPath}`, { method: 'DELETE' });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.message || `Failed to delete resource: ${response.status}`,
    );
  }
}

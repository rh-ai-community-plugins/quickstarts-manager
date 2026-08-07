import { checkRbacPermissions } from '../src/services/rbacChecker';
import * as k8sApiClient from '../src/services/k8sApiClient';
import { QuickstartPermission } from '../src/types/catalog';

jest.mock('../src/services/k8sApiClient');

const mockedK8sApiRequest = jest.mocked(k8sApiClient.k8sApiRequest);

describe('rbacChecker', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns allowed=true when all permissions are granted', async () => {
    mockedK8sApiRequest.mockResolvedValue({ status: { allowed: true } });

    const permissions: QuickstartPermission[] = [
      { apiGroup: '', resource: 'pods', verbs: ['get', 'list'] },
      { apiGroup: 'apps', resource: 'deployments', verbs: ['create'] },
    ];

    const result = await checkRbacPermissions('test-token', 'test-ns', permissions);

    expect(result.allowed).toBe(true);
    expect(result.denied).toHaveLength(0);
    expect(result.granted).toHaveLength(2);
    expect(result.granted[0]).toEqual({ apiGroup: '', resource: 'pods', verbs: ['get', 'list'] });
    expect(result.granted[1]).toEqual({ apiGroup: 'apps', resource: 'deployments', verbs: ['create'] });
  });

  it('returns allowed=false when some permissions are denied', async () => {
    mockedK8sApiRequest
      .mockResolvedValueOnce({ status: { allowed: true } })
      .mockResolvedValueOnce({ status: { allowed: false } })
      .mockResolvedValueOnce({ status: { allowed: true } });

    const permissions: QuickstartPermission[] = [
      { apiGroup: '', resource: 'pods', verbs: ['get', 'delete'] },
      { apiGroup: 'apps', resource: 'deployments', verbs: ['create'] },
    ];

    const result = await checkRbacPermissions('test-token', 'test-ns', permissions);

    expect(result.allowed).toBe(false);
    expect(result.denied).toHaveLength(1);
    expect(result.denied[0]).toEqual({ apiGroup: '', resource: 'pods', verb: 'delete' });
    expect(result.granted).toHaveLength(2);
  });

  it('returns allowed=false when all permissions are denied', async () => {
    mockedK8sApiRequest.mockResolvedValue({ status: { allowed: false } });

    const permissions: QuickstartPermission[] = [
      { apiGroup: '', resource: 'secrets', verbs: ['get', 'create'] },
    ];

    const result = await checkRbacPermissions('test-token', 'test-ns', permissions);

    expect(result.allowed).toBe(false);
    expect(result.denied).toHaveLength(2);
    expect(result.granted).toHaveLength(0);
  });

  it('sends correct SelfSubjectAccessReview request body', async () => {
    mockedK8sApiRequest.mockResolvedValue({ status: { allowed: true } });

    const permissions: QuickstartPermission[] = [
      { apiGroup: 'route.openshift.io', resource: 'routes', verbs: ['get'] },
    ];

    await checkRbacPermissions('my-token', 'my-ns', permissions);

    expect(mockedK8sApiRequest).toHaveBeenCalledWith(
      'my-token',
      '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
      'POST',
      {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: {
          resourceAttributes: {
            namespace: 'my-ns',
            verb: 'get',
            group: 'route.openshift.io',
            resource: 'routes',
          },
        },
      },
    );
  });

  it('handles empty permissions list', async () => {
    const result = await checkRbacPermissions('token', 'ns', []);

    expect(result.allowed).toBe(true);
    expect(result.granted).toHaveLength(0);
    expect(result.denied).toHaveLength(0);
    expect(mockedK8sApiRequest).not.toHaveBeenCalled();
  });

  it('propagates K8s API errors', async () => {
    mockedK8sApiRequest.mockRejectedValue(new Error('K8s API timeout'));

    const permissions: QuickstartPermission[] = [
      { apiGroup: '', resource: 'pods', verbs: ['get'] },
    ];

    await expect(checkRbacPermissions('token', 'ns', permissions)).rejects.toThrow(
      'K8s API timeout',
    );
  });

  it('checks verbs concurrently within a single permission', async () => {
    let resolveFirst: () => void;
    let resolveSecond: () => void;
    const firstCall = new Promise<void>((r) => { resolveFirst = r; });
    const secondCall = new Promise<void>((r) => { resolveSecond = r; });

    let callCount = 0;
    mockedK8sApiRequest.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        resolveFirst!();
        return new Promise((resolve) => {
          setTimeout(() => resolve({ status: { allowed: true } }), 10);
        });
      }
      resolveSecond!();
      return Promise.resolve({ status: { allowed: true } });
    });

    const permissions: QuickstartPermission[] = [
      { apiGroup: '', resource: 'pods', verbs: ['get', 'list'] },
    ];

    const promise = checkRbacPermissions('token', 'ns', permissions);
    await firstCall;
    await secondCall;
    const result = await promise;

    expect(result.allowed).toBe(true);
    expect(mockedK8sApiRequest).toHaveBeenCalledTimes(2);
  });
});

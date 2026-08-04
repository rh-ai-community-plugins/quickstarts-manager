import { k8sApiRequest } from './k8sApiClient';
import { QuickstartPermission } from '../types/catalog';
import { RbacCheckResult } from '../types/lifecycle';

interface SelfSubjectAccessReviewSpec {
  resourceAttributes: {
    namespace: string;
    verb: string;
    group: string;
    resource: string;
  };
}

interface SelfSubjectAccessReviewResponse {
  status: {
    allowed: boolean;
    reason?: string;
  };
}

async function checkSinglePermission(
  token: string,
  namespace: string,
  apiGroup: string,
  resource: string,
  verb: string,
): Promise<boolean> {
  const body = {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        namespace,
        verb,
        group: apiGroup,
        resource,
      },
    } satisfies SelfSubjectAccessReviewSpec,
  };

  const response = await k8sApiRequest<SelfSubjectAccessReviewResponse>(
    token,
    '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
    'POST',
    body,
  );

  return response.status.allowed;
}

export async function checkRbacPermissions(
  token: string,
  namespace: string,
  permissions: QuickstartPermission[],
): Promise<RbacCheckResult> {
  const granted: RbacCheckResult['granted'] = [];
  const denied: RbacCheckResult['denied'] = [];

  for (const perm of permissions) {
    const verbResults = await Promise.all(
      perm.verbs.map(async (verb) => ({
        verb,
        allowed: await checkSinglePermission(token, namespace, perm.apiGroup, perm.resource, verb),
      })),
    );

    const grantedVerbs = verbResults.filter((r) => r.allowed).map((r) => r.verb);
    const deniedVerbs = verbResults.filter((r) => !r.allowed);

    if (grantedVerbs.length > 0) {
      granted.push({ apiGroup: perm.apiGroup, resource: perm.resource, verbs: grantedVerbs });
    }
    for (const d of deniedVerbs) {
      denied.push({ apiGroup: perm.apiGroup, resource: perm.resource, verb: d.verb });
    }
  }

  return {
    allowed: denied.length === 0,
    granted,
    denied,
  };
}

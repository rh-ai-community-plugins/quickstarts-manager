import { isProtectedNamespace } from '../namespace';

describe('isProtectedNamespace', () => {
  it.each([
    'kube-system',
    'kube-public',
    'openshift-config',
    'openshift-monitoring',
    'redhat-ods-applications',
    'default',
    'opendatahub',
  ])('should return true for protected namespace "%s"', (ns) => {
    expect(isProtectedNamespace(ns)).toBe(true);
  });

  it.each([
    'my-project',
    'test-namespace',
    'quickstart-demo',
    'kubelet-app',
    'defaults',
  ])('should return false for non-protected namespace "%s"', (ns) => {
    expect(isProtectedNamespace(ns)).toBe(false);
  });
});

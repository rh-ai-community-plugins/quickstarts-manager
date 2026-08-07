const PROTECTED_NAMESPACE_PATTERNS = [
  /^kube-/,
  /^openshift-/,
  /^redhat-ods-/,
  /^default$/,
  /^opendatahub$/,
];

export function isProtectedNamespace(namespace: string): boolean {
  return PROTECTED_NAMESPACE_PATTERNS.some((pattern) => pattern.test(namespace));
}

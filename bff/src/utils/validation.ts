import { Request } from 'express';

export const QUICKSTART_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
export const K8S_NAMESPACE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

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

export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export function validateQuickstartName(name: string): string | null {
  if (!QUICKSTART_NAME_PATTERN.test(name)) {
    return 'Invalid quickstart name: must be lowercase alphanumeric with hyphens, 2-64 characters';
  }
  return null;
}

export function validateNamespace(namespace: unknown): string | null {
  if (typeof namespace !== 'string' || !K8S_NAMESPACE_PATTERN.test(namespace)) {
    return 'Invalid namespace: must be lowercase alphanumeric with hyphens, 2-64 characters';
  }
  if (isProtectedNamespace(namespace)) {
    return `Cannot operate on protected namespace "${namespace}"`;
  }
  return null;
}

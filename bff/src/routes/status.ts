import { Router, Request, Response } from 'express';
import { helmList } from '../services/helmService';
import { discoverRoutes } from '../services/k8sApiClient';
import { QuickstartStatusResponse } from '../types/status';

const router = Router();

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
const PROTECTED_NAMESPACE_PATTERNS = [
  /^kube-/,
  /^openshift-/,
  /^redhat-ods-/,
  /^default$/,
  /^opendatahub$/,
];

function isProtectedNamespace(namespace: string): boolean {
  return PROTECTED_NAMESPACE_PATTERNS.some((pattern) => pattern.test(namespace));
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

router.get('/', async (req: Request, res: Response) => {
  const namespace = req.query.namespace;

  if (!namespace || typeof namespace !== 'string') {
    res.status(400).json({ error: 'Missing required query parameter: namespace' });
    return;
  }

  if (!NAMESPACE_PATTERN.test(namespace)) {
    res.status(400).json({ error: 'Invalid namespace format' });
    return;
  }

  if (isProtectedNamespace(namespace)) {
    res.status(403).json({ error: 'Operations on protected namespaces are not allowed' });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const releases = await helmList(namespace, token);

    if (releases.length === 0) {
      res.status(404).json({ error: 'No quickstart deployed in this namespace' });
      return;
    }

    const release = releases[0];
    const routes = await discoverRoutes(namespace, token);

    const response: QuickstartStatusResponse = {
      release: {
        name: release.name,
        namespace: release.namespace,
        status: release.status,
        chart: release.chart,
        appVersion: release.app_version,
      },
      routes: routes.map((r) => ({ name: r.name, url: r.url })),
    };

    res.json(response);
  } catch (err) {
    console.error('Failed to check quickstart status:', (err as Error).message);
    res.status(502).json({ error: 'Failed to check quickstart status' });
  }
});

export default router;

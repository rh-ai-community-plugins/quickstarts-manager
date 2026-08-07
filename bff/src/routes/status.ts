import { Router, Request, Response } from 'express';
import { helmList } from '../services/helmService';
import { discoverRoutes } from '../services/k8sApiClient';
import { extractToken, validateNamespace } from '../utils/validation';
import { QuickstartStatusResponse } from '../types/status';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const namespace = req.query.namespace;

  if (!namespace || typeof namespace !== 'string') {
    res.status(400).json({ error: 'Missing required query parameter: namespace' });
    return;
  }

  const nsError = validateNamespace(namespace);
  if (nsError) {
    res.status(400).json({ error: nsError });
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

import { Router, Request, Response } from 'express';
import { extractToken } from '../utils/validation';
import { getSettings, refreshSettings, updateSettings } from '../services/settingsService';
import { k8sApiRequest } from '../services/k8sApiClient';

const router = Router();
const POD_NAMESPACE = process.env.POD_NAMESPACE ?? 'cp-quickstarts-manager';

async function checkAdminAccess(token: string): Promise<boolean> {
  const body = {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        namespace: POD_NAMESPACE,
        verb: 'update',
        group: '',
        resource: 'secrets',
      },
    },
  };
  const response = await k8sApiRequest<{ status: { allowed: boolean } }>(
    token,
    '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
    'POST',
    body,
  );
  return response.status.allowed;
}

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 4) return '****';
  return '****' + token.slice(-4);
}

function isValidProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const allowed = await checkAdminAccess(token);
    if (!allowed) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const settings = getSettings();
    res.json({
      githubToken: maskToken(settings.githubToken),
      proxyUrl: settings.proxyUrl,
      source: settings.source,
    });
  } catch (err) {
    console.error('Failed to get settings:', (err as Error).message);
    res.status(502).json({ error: 'Failed to retrieve settings' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const allowed = await checkAdminAccess(token);
    if (!allowed) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { githubToken, proxyUrl } = req.body;

    if (githubToken !== undefined && typeof githubToken !== 'string') {
      res.status(400).json({ error: 'githubToken must be a string' });
      return;
    }
    if (proxyUrl !== undefined && typeof proxyUrl !== 'string') {
      res.status(400).json({ error: 'proxyUrl must be a string' });
      return;
    }
    if (proxyUrl && !isValidProxyUrl(proxyUrl)) {
      res.status(400).json({ error: 'proxyUrl must be a valid http:// or https:// URL' });
      return;
    }

    await updateSettings(token, POD_NAMESPACE, { githubToken, proxyUrl });
    refreshSettings();

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update settings:', (err as Error).message);
    res.status(502).json({ error: 'Failed to update settings' });
  }
});

router.delete('/', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const allowed = await checkAdminAccess(token);
    if (!allowed) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    await updateSettings(token, POD_NAMESPACE, { githubToken: null, proxyUrl: null });
    refreshSettings();

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to clear settings:', (err as Error).message);
    res.status(502).json({ error: 'Failed to clear settings' });
  }
});

export default router;

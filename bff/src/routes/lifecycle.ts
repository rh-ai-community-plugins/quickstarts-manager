import { Router, Request, Response } from 'express';
import { installQuickstart, upgradeQuickstart, removeQuickstart } from '../services/lifecycleService';
import { validateHelmValues } from '../services/helmService';
import { LifecycleResponse, LifecycleProgressCallback } from '../types/lifecycle';

const router = Router();

const QUICKSTART_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
const K8S_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;

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
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function validateQuickstartName(name: string): string | null {
  if (!QUICKSTART_NAME_PATTERN.test(name)) {
    return 'Invalid quickstart name: must be lowercase alphanumeric with hyphens, 2-64 characters';
  }
  return null;
}

function validateNamespace(namespace: unknown): string | null {
  if (typeof namespace !== 'string' || !K8S_NAMESPACE_PATTERN.test(namespace)) {
    return 'Invalid namespace: must be lowercase alphanumeric with hyphens, 2-64 characters';
  }
  if (isProtectedNamespace(namespace)) {
    return `Cannot operate on protected namespace "${namespace}"`;
  }
  return null;
}

function sendSSE(
  req: Request,
  res: Response,
  serviceFn: (onProgress?: LifecycleProgressCallback) => Promise<LifecycleResponse>,
): void {
  const wantsSSE = req.headers.accept?.includes('text/event-stream');

  if (!wantsSSE) {
    serviceFn().then((result) => {
      res.status(result.success ? 200 : 500).json(result);
    }).catch(() => {
      res.status(500).json({ success: false, message: 'Operation failed', steps: [] });
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15_000);

  const onProgress: LifecycleProgressCallback = (steps) => {
    const data = JSON.stringify({ steps: steps.map((s) => ({ ...s })) });
    res.write(`event: progress\ndata: ${data}\n\n`);
  };

  serviceFn(onProgress)
    .then((result) => {
      clearInterval(heartbeat);
      res.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    })
    .catch(() => {
      clearInterval(heartbeat);
      const fallback: LifecycleResponse = {
        success: false,
        message: 'Operation failed',
        steps: [],
      };
      res.write(`event: complete\ndata: ${JSON.stringify(fallback)}\n\n`);
      res.end();
    });
}

router.post('/:name/install', (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const nameError = validateQuickstartName(req.params.name);
  if (nameError) {
    res.status(400).json({ error: nameError });
    return;
  }

  const { namespace, values } = req.body ?? {};

  if (namespace === undefined) {
    res.status(400).json({ error: 'Missing required field: namespace' });
    return;
  }

  const nsError = validateNamespace(namespace);
  if (nsError) {
    res.status(400).json({ error: nsError });
    return;
  }

  if (values !== undefined) {
    try {
      validateHelmValues(values);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid values' });
      return;
    }
  }

  sendSSE(req, res, (onProgress) =>
    installQuickstart(req.params.name, namespace, token, values, onProgress),
  );
});

router.post('/:name/upgrade', (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const nameError = validateQuickstartName(req.params.name);
  if (nameError) {
    res.status(400).json({ error: nameError });
    return;
  }

  const { namespace, values } = req.body ?? {};

  if (namespace === undefined) {
    res.status(400).json({ error: 'Missing required field: namespace' });
    return;
  }

  const nsError = validateNamespace(namespace);
  if (nsError) {
    res.status(400).json({ error: nsError });
    return;
  }

  if (values !== undefined) {
    try {
      validateHelmValues(values);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid values' });
      return;
    }
  }

  sendSSE(req, res, (onProgress) =>
    upgradeQuickstart(req.params.name, namespace, token, values, onProgress),
  );
});

router.delete('/:name', (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const nameError = validateQuickstartName(req.params.name);
  if (nameError) {
    res.status(400).json({ error: nameError });
    return;
  }

  const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined;

  if (namespace === undefined) {
    res.status(400).json({ error: 'Missing required query parameter: namespace' });
    return;
  }

  const nsError = validateNamespace(namespace);
  if (nsError) {
    res.status(400).json({ error: nsError });
    return;
  }

  sendSSE(req, res, (onProgress) =>
    removeQuickstart(req.params.name, namespace, token, onProgress),
  );
});

export default router;

import { Router, Request, Response } from 'express';
import { installQuickstart, upgradeQuickstart, removeQuickstart } from '../services/lifecycleService';
import { validateHelmValues, helmGetValues } from '../services/helmService';
import { extractToken, validateQuickstartName, validateNamespace } from '../utils/validation';
import { LifecycleResponse, LifecycleProgressCallback } from '../types/lifecycle';

const router = Router();

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

  req.on('close', () => clearInterval(heartbeat));

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
    .catch((err) => {
      clearInterval(heartbeat);
      console.error('Lifecycle SSE operation failed:', (err as Error).message);
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

router.get('/:name/values', (req: Request, res: Response) => {
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

  helmGetValues(req.params.name, namespace, token)
    .then((values) => {
      res.json({ values });
    })
    .catch((err) => {
      console.error('Failed to read release values:', (err as Error).message);
      res.status(502).json({ error: 'Failed to read release values' });
    });
});

export default router;

import http from 'http';
import express from 'express';
import lifecycleRouter from '../src/routes/lifecycle';
import * as lifecycleService from '../src/services/lifecycleService';
import * as helmService from '../src/services/helmService';

jest.mock('../src/services/lifecycleService');
jest.mock('../src/services/helmService');

const mockedInstallQuickstart = jest.mocked(lifecycleService.installQuickstart);
const mockedUpgradeQuickstart = jest.mocked(lifecycleService.upgradeQuickstart);
const mockedRemoveQuickstart = jest.mocked(lifecycleService.removeQuickstart);
const mockedHelmGetValues = jest.mocked(helmService.helmGetValues);

function jsonRequest(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${port}`);
    const postData = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function sseRequest(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; events: Array<{ event: string; data: string }> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${port}`);
    const postData = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        const events: Array<{ event: string; data: string }> = [];

        res.on('data', (chunk) => {
          raw += chunk;
          const blocks = raw.split('\n\n');
          raw = blocks.pop()!;
          for (const block of blocks) {
            if (block.startsWith(':')) continue;
            const lines = block.split('\n');
            let event = '';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7);
              if (line.startsWith('data: ')) data = line.slice(6);
            }
            if (event) events.push({ event, data });
          }
        });

        res.on('end', () => resolve({ statusCode: res.statusCode!, events }));
      },
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

describe('lifecycle routes', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/quickstarts', lifecycleRouter);
    server = app.listen(0, () => {
      port = (server.address() as { port: number }).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockedInstallQuickstart.mockResolvedValue({
      success: true,
      message: 'Installed',
      steps: [{ id: 'helm-install', label: 'Install', status: 'completed' }],
      routes: [],
    });
    mockedUpgradeQuickstart.mockResolvedValue({
      success: true,
      message: 'Upgraded',
      steps: [{ id: 'helm-upgrade', label: 'Upgrade', status: 'completed' }],
    });
    mockedRemoveQuickstart.mockResolvedValue({
      success: true,
      message: 'Removed',
      steps: [{ id: 'helm-uninstall', label: 'Uninstall', status: 'completed' }],
    });
  });

  describe('POST /:name/install', () => {
    it('returns 401 when no Authorization header', async () => {
      const res = await jsonRequest(port, 'POST', '/api/quickstarts/lemonade/install', {
        namespace: 'test-ns',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid quickstart name', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/INVALID!/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Invalid quickstart name');
    });

    it('returns 400 when namespace is missing', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        {},
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('namespace');
    });

    it('returns 400 for invalid namespace format', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'BAD!' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Invalid namespace');
    });

    it('returns 400 for protected namespace', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'kube-system' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('protected namespace');
    });

    it('returns 400 for invalid Helm values', async () => {
      jest.mocked(helmService.validateHelmValues).mockImplementation(() => {
        throw new Error('Invalid Helm value key');
      });

      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'test-ns', values: { 'bad key!': 'val' } },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Invalid Helm value key');
    });

    it('returns 200 with JSON result for non-SSE request', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer my-token' },
      );
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Installed');
    });

    it('passes correct arguments to installQuickstart', async () => {
      await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'test-ns', values: { replicas: 3 } },
        { Authorization: 'Bearer my-token' },
      );

      expect(mockedInstallQuickstart).toHaveBeenCalledWith(
        'lemonade',
        'test-ns',
        'my-token',
        { replicas: 3 },
        undefined,
      );
    });

    it('returns SSE events when Accept: text/event-stream', async () => {
      mockedInstallQuickstart.mockImplementation(
        async (_name, _ns, _token, _values, onProgress) => {
          onProgress?.([{ id: 'resolve', label: 'Resolving', status: 'running' }]);
          onProgress?.([{ id: 'resolve', label: 'Resolving', status: 'completed' }]);
          return {
            success: true,
            message: 'Done',
            steps: [{ id: 'resolve', label: 'Resolving', status: 'completed' }],
          };
        },
      );

      const res = await sseRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );

      expect(res.statusCode).toBe(200);
      const progressEvents = res.events.filter((e) => e.event === 'progress');
      const completeEvent = res.events.find((e) => e.event === 'complete');
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      expect(completeEvent).toBeDefined();
      expect(JSON.parse(completeEvent!.data).success).toBe(true);
    });

    it('returns 500 when service returns failure for non-SSE', async () => {
      mockedInstallQuickstart.mockResolvedValue({
        success: false,
        message: 'Failed',
        steps: [{ id: 'helm-install', label: 'Install', status: 'failed', error: 'boom' }],
      });

      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).success).toBe(false);
    });
  });

  describe('POST /:name/upgrade', () => {
    it('returns 401 when no Authorization header', async () => {
      const res = await jsonRequest(port, 'POST', '/api/quickstarts/lemonade/upgrade', {
        namespace: 'test-ns',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when namespace is missing', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/upgrade',
        {},
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for protected namespace', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/upgrade',
        { namespace: 'openshift-operators' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('protected namespace');
    });

    it('returns 200 with JSON result', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/upgrade',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).success).toBe(true);
    });

    it('passes correct arguments to upgradeQuickstart', async () => {
      await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/upgrade',
        { namespace: 'test-ns', values: { replicas: 5 } },
        { Authorization: 'Bearer my-token' },
      );

      expect(mockedUpgradeQuickstart).toHaveBeenCalledWith(
        'lemonade',
        'test-ns',
        'my-token',
        { replicas: 5 },
        undefined,
      );
    });
  });

  describe('DELETE /:name', () => {
    it('returns 401 when no Authorization header', async () => {
      const res = await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade?namespace=test-ns',
      );
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid quickstart name', async () => {
      const res = await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/INVALID!?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when namespace query param is missing', async () => {
      const res = await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('namespace');
    });

    it('returns 400 for protected namespace', async () => {
      const res = await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade?namespace=redhat-ods-applications',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('protected namespace');
    });

    it('returns 200 with JSON result', async () => {
      const res = await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).success).toBe(true);
    });

    it('passes correct arguments to removeQuickstart', async () => {
      await jsonRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer my-token' },
      );

      expect(mockedRemoveQuickstart).toHaveBeenCalledWith(
        'lemonade',
        'test-ns',
        'my-token',
        undefined,
      );
    });

    it('returns SSE events for delete operation', async () => {
      mockedRemoveQuickstart.mockImplementation(async (_name, _ns, _token, onProgress) => {
        onProgress?.([{ id: 'helm-uninstall', label: 'Uninstalling', status: 'running' }]);
        return {
          success: true,
          message: 'Removed',
          steps: [{ id: 'helm-uninstall', label: 'Uninstalling', status: 'completed' }],
        };
      });

      const res = await sseRequest(
        port,
        'DELETE',
        '/api/quickstarts/lemonade?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer token' },
      );

      expect(res.statusCode).toBe(200);
      expect(res.events.find((e) => e.event === 'complete')).toBeDefined();
    });
  });

  describe('GET /:name/values', () => {
    it('returns 401 when no Authorization header', async () => {
      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/lemonade/values?namespace=test-ns',
      );
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid quickstart name', async () => {
      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/INVALID!/values?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when namespace query param is missing', async () => {
      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/lemonade/values',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('namespace');
    });

    it('returns 400 for invalid namespace format', async () => {
      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/lemonade/values?namespace=BAD!',
        undefined,
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Invalid namespace');
    });

    it('returns 200 with values shape on success', async () => {
      mockedHelmGetValues.mockResolvedValue({ replicaCount: 2 });

      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/lemonade/values?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer my-token' },
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ values: { replicaCount: 2 } });
      expect(mockedHelmGetValues).toHaveBeenCalledWith('lemonade', 'test-ns', 'my-token');
    });

    it('returns 502 when helmGetValues throws', async () => {
      mockedHelmGetValues.mockRejectedValue(new Error('boom'));

      const res = await jsonRequest(
        port,
        'GET',
        '/api/quickstarts/lemonade/values?namespace=test-ns',
        undefined,
        { Authorization: 'Bearer token' },
      );

      expect(res.statusCode).toBe(502);
      expect(JSON.parse(res.body).error).toBe('Failed to read release values');
    });
  });

  describe('input validation', () => {
    it('accepts valid two-character quickstart name', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/ab/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).not.toBe(400);
    });

    it('rejects single-character quickstart name', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/a/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects quickstart name starting with number', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/1bad-name/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects quickstart name ending with hyphen', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/bad-name-/install',
        { namespace: 'test-ns' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('blocks default namespace', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'default' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });

    it('blocks opendatahub namespace', async () => {
      const res = await jsonRequest(
        port,
        'POST',
        '/api/quickstarts/lemonade/install',
        { namespace: 'opendatahub' },
        { Authorization: 'Bearer token' },
      );
      expect(res.statusCode).toBe(400);
    });
  });
});

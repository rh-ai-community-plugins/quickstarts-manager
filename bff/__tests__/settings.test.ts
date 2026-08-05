import http from 'http';
import express from 'express';
import settingsRouter from '../src/routes/settings';
import * as settingsService from '../src/services/settingsService';
import * as k8sApiClient from '../src/services/k8sApiClient';

jest.mock('../src/services/settingsService');
jest.mock('../src/services/k8sApiClient', () => {
  const actual = jest.requireActual('../src/services/k8sApiClient');
  return {
    ...actual,
    k8sApiRequest: jest.fn(),
  };
});

const mockedGetSettings = jest.mocked(settingsService.getSettings);
const mockedRefreshSettings = jest.mocked(settingsService.refreshSettings);
const mockedUpdateSettings = jest.mocked(settingsService.updateSettings);
const mockedK8sApiRequest = jest.mocked(k8sApiClient.k8sApiRequest);

function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: object,
  token?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://127.0.0.1:${port}${path}`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode!, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function mockAdminCheck(allowed: boolean) {
  mockedK8sApiRequest.mockResolvedValue({ status: { allowed } });
}

describe('settings routes', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRouter);
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
  });

  describe('GET /api/settings', () => {
    it('returns 401 without auth token', async () => {
      const res = await makeRequest(port, 'GET', '/api/settings');
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when RBAC check fails', async () => {
      mockAdminCheck(false);
      const res = await makeRequest(port, 'GET', '/api/settings', undefined, 'user-token');
      expect(res.statusCode).toBe(403);
    });

    it('returns masked github token', async () => {
      mockAdminCheck(true);
      mockedGetSettings.mockReturnValue({
        githubToken: 'ghp_abc123',
        proxyUrl: null,
        source: 'env',
      });

      const res = await makeRequest(port, 'GET', '/api/settings', undefined, 'admin-token');
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.githubToken).toBe('****c123');
      expect(body.proxyUrl).toBeNull();
      expect(body.source).toBe('env');
    });

    it('returns null token when none configured', async () => {
      mockAdminCheck(true);
      mockedGetSettings.mockReturnValue({
        githubToken: null,
        proxyUrl: null,
        source: 'default',
      });

      const res = await makeRequest(port, 'GET', '/api/settings', undefined, 'admin-token');
      const body = JSON.parse(res.body);
      expect(body.githubToken).toBeNull();
      expect(body.source).toBe('default');
    });
  });

  describe('PUT /api/settings', () => {
    it('returns 401 without auth token', async () => {
      const res = await makeRequest(port, 'PUT', '/api/settings', { githubToken: 'x' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-admin', async () => {
      mockAdminCheck(false);
      const res = await makeRequest(port, 'PUT', '/api/settings', { githubToken: 'x' }, 'user-token');
      expect(res.statusCode).toBe(403);
    });

    it('updates settings successfully', async () => {
      mockAdminCheck(true);
      mockedUpdateSettings.mockResolvedValue(undefined);

      const res = await makeRequest(port, 'PUT', '/api/settings', {
        githubToken: 'ghp_new',
        proxyUrl: 'http://proxy:3128',
      }, 'admin-token');

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(mockedUpdateSettings).toHaveBeenCalledWith(
        'admin-token',
        expect.any(String),
        { githubToken: 'ghp_new', proxyUrl: 'http://proxy:3128' },
      );
      expect(mockedRefreshSettings).toHaveBeenCalled();
    });

    it('validates proxyUrl format', async () => {
      mockAdminCheck(true);

      const res = await makeRequest(port, 'PUT', '/api/settings', {
        proxyUrl: 'not-a-url',
      }, 'admin-token');

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('valid http');
    });

    it('rejects non-string githubToken', async () => {
      mockAdminCheck(true);

      const res = await makeRequest(port, 'PUT', '/api/settings', {
        githubToken: 123,
      }, 'admin-token');

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/settings', () => {
    it('returns 401 without auth token', async () => {
      const res = await makeRequest(port, 'DELETE', '/api/settings');
      expect(res.statusCode).toBe(401);
    });

    it('clears settings successfully', async () => {
      mockAdminCheck(true);
      mockedUpdateSettings.mockResolvedValue(undefined);

      const res = await makeRequest(port, 'DELETE', '/api/settings', undefined, 'admin-token');

      expect(res.statusCode).toBe(200);
      expect(mockedUpdateSettings).toHaveBeenCalledWith(
        'admin-token',
        expect.any(String),
        { githubToken: null, proxyUrl: null },
      );
      expect(mockedRefreshSettings).toHaveBeenCalled();
    });
  });
});

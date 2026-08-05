import http from 'http';
import express from 'express';
import statusRouter from '../src/routes/status';
import * as helmService from '../src/services/helmService';
import * as k8sApiClient from '../src/services/k8sApiClient';

jest.mock('../src/services/helmService');
jest.mock('../src/services/k8sApiClient');

const mockedHelmList = jest.mocked(helmService.helmList);
const mockedDiscoverRoutes = jest.mocked(k8sApiClient.discoverRoutes);

function request(
  port: number,
  path: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, { headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
      })
      .on('error', reject);
  });
}

describe('status route', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    app.use('/api/quickstarts/status', statusRouter);
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

  it('returns 400 when namespace query param is missing', async () => {
    const res = await request(port, '/api/quickstarts/status', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('namespace');
  });

  it('returns 400 for invalid namespace format', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=INVALID!', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Invalid namespace');
  });

  it('returns 403 for kube-system namespace', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=kube-system', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toContain('protected');
  });

  it('returns 403 for openshift-* namespaces', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=openshift-operators', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for redhat-ods-* namespaces', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=redhat-ods-monitoring', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for default namespace', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=default', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for opendatahub namespace', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=opendatahub', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(port, '/api/quickstarts/status?namespace=test-ns');
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toContain('Authorization');
  });

  it('returns 404 when no releases exist in namespace', async () => {
    mockedHelmList.mockResolvedValue([]);

    const res = await request(port, '/api/quickstarts/status?namespace=test-ns', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain('No quickstart');
  });

  it('returns release info and routes when a quickstart is deployed', async () => {
    mockedHelmList.mockResolvedValue([
      {
        name: 'lemonade',
        namespace: 'test-ns',
        status: 'deployed',
        chart: 'lemonade-1.0.0',
        app_version: '1.0.0',
      },
    ]);
    mockedDiscoverRoutes.mockResolvedValue([
      {
        name: 'frontend',
        host: 'frontend.apps.example.com',
        path: '/',
        url: 'https://frontend.apps.example.com/',
        tlsEnabled: true,
      },
    ]);

    const res = await request(port, '/api/quickstarts/status?namespace=test-ns', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.release.name).toBe('lemonade');
    expect(body.release.namespace).toBe('test-ns');
    expect(body.release.status).toBe('deployed');
    expect(body.release.chart).toBe('lemonade-1.0.0');
    expect(body.release.appVersion).toBe('1.0.0');
    expect(body.routes).toHaveLength(1);
    expect(body.routes[0].name).toBe('frontend');
    expect(body.routes[0].url).toBe('https://frontend.apps.example.com/');
  });

  it('passes the Bearer token to helm and k8s services', async () => {
    mockedHelmList.mockResolvedValue([
      {
        name: 'qs',
        namespace: 'ns',
        status: 'deployed',
        chart: 'chart-1.0',
        app_version: '1.0',
      },
    ]);
    mockedDiscoverRoutes.mockResolvedValue([]);

    await request(port, '/api/quickstarts/status?namespace=test-ns', {
      Authorization: 'Bearer my-secret-token',
    });

    expect(mockedHelmList).toHaveBeenCalledWith('test-ns', 'my-secret-token');
    expect(mockedDiscoverRoutes).toHaveBeenCalledWith('test-ns', 'my-secret-token');
  });

  it('returns 502 when helm list fails', async () => {
    mockedHelmList.mockRejectedValue(new Error('helm not found'));

    const res = await request(port, '/api/quickstarts/status?namespace=test-ns', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toContain('Failed to check');
  });

  it('returns release with empty routes when route discovery fails gracefully', async () => {
    mockedHelmList.mockResolvedValue([
      {
        name: 'qs',
        namespace: 'ns',
        status: 'deployed',
        chart: 'chart-1.0',
        app_version: '1.0',
      },
    ]);
    mockedDiscoverRoutes.mockResolvedValue([]);

    const res = await request(port, '/api/quickstarts/status?namespace=test-ns', {
      Authorization: 'Bearer test-token',
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.routes).toEqual([]);
  });
});

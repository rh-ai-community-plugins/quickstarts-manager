import https from 'https';
import { EventEmitter } from 'events';
import { k8sApiRequest, discoverRoutes, K8sApiError } from '../src/services/k8sApiClient';

jest.mock('https');
jest.mock('../src/utils/k8sClient', () => ({
  getK8sBaseUrl: () => 'https://my-cluster:6443',
}));

const mockedHttps = jest.mocked(https);

function createMockResponse(statusCode: number, body: string) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  process.nextTick(() => {
    res.emit('data', body);
    res.emit('end');
  });
  return res;
}

describe('k8sApiRequest', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.K8S_API_BASE = 'https://my-cluster:6443';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('makes a GET request by default', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(200, '{"items":[]}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const result = await k8sApiRequest<{ items: unknown[] }>('token', '/api/v1/pods');

    const opts = mockedHttps.request.mock.calls[0][0] as unknown as { method: string };
    expect(opts.method).toBe('GET');
    expect(result.items).toEqual([]);
  });

  it('makes a POST request with body', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(200, '{"allowed":true}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const body = { spec: { resourceAttributes: { namespace: 'test', verb: 'create' } } };
    await k8sApiRequest('token', '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', 'POST', body);

    const opts = mockedHttps.request.mock.calls[0][0] as unknown as {
      method: string;
      headers: Record<string, string>;
    };
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it('sends Authorization header', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(200, '{}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await k8sApiRequest('my-bearer-token', '/api/v1/pods');

    const opts = mockedHttps.request.mock.calls[0][0] as unknown as {
      headers: Record<string, string>;
    };
    expect(opts.headers.Authorization).toBe('Bearer my-bearer-token');
  });

  it('rejects on non-2xx responses', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(403, '{"message":"forbidden"}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const err = await k8sApiRequest('bad-token', '/api/v1/pods').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(K8sApiError);
    expect((err as K8sApiError).statusCode).toBe(403);
    expect((err as K8sApiError).message).toContain('K8s API returned 403');
  });

  it('rejects on request error', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation(() => {
      process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await expect(k8sApiRequest('token', '/api/v1/pods')).rejects.toThrow('ECONNREFUSED');
  });

  it('sets timeout on the request', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(200, '{}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await k8sApiRequest('token', '/api/v1/pods');

    expect(mockReq.setTimeout).toHaveBeenCalledWith(30_000, expect.any(Function));
  });

  it('rejects on invalid JSON response', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(200, 'not-json'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await expect(k8sApiRequest('token', '/test')).rejects.toThrow('Failed to parse');
  });
});

describe('discoverRoutes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.K8S_API_BASE = 'https://my-cluster:6443';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setupMock(statusCode: number, body: string) {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(statusCode, body));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });
  }

  it('returns route info for discovered routes', async () => {
    const routeList = {
      items: [
        {
          metadata: { name: 'frontend', namespace: 'test-ns' },
          spec: {
            host: 'frontend.apps.cluster.example.com',
            path: '/',
            to: { kind: 'Service', name: 'frontend' },
            tls: { termination: 'edge' },
          },
        },
        {
          metadata: { name: 'api', namespace: 'test-ns' },
          spec: {
            host: 'api.apps.cluster.example.com',
            to: { kind: 'Service', name: 'api-service' },
          },
        },
      ],
    };
    setupMock(200, JSON.stringify(routeList));

    const routes = await discoverRoutes('test-ns', 'token');

    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual({
      name: 'frontend',
      host: 'frontend.apps.cluster.example.com',
      path: '/',
      url: 'https://frontend.apps.cluster.example.com/',
      tlsEnabled: true,
    });
    expect(routes[1]).toEqual({
      name: 'api',
      host: 'api.apps.cluster.example.com',
      path: '/',
      url: 'http://api.apps.cluster.example.com/',
      tlsEnabled: false,
    });
  });

  it('returns empty array when Routes API returns 404', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(
        createMockResponse(404, '{"message":"the server could not find the requested resource"}'),
      );
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const routes = await discoverRoutes('test-ns', 'token');
    expect(routes).toEqual([]);
  });

  it('handles routes with custom paths', async () => {
    const routeList = {
      items: [
        {
          metadata: { name: 'api', namespace: 'ns' },
          spec: {
            host: 'api.example.com',
            path: '/v2',
            to: { kind: 'Service', name: 'api' },
            tls: { termination: 'edge' },
          },
        },
      ],
    };
    setupMock(200, JSON.stringify(routeList));

    const routes = await discoverRoutes('ns', 'token');
    expect(routes[0].url).toBe('https://api.example.com/v2');
    expect(routes[0].path).toBe('/v2');
  });

  it('propagates non-404 errors', async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      write: jest.Mock;
      setTimeout: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.write = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    mockedHttps.request.mockImplementation((_opts: unknown, callback: unknown) => {
      (callback as (res: EventEmitter) => void)(createMockResponse(500, '{"message":"internal error"}'));
      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    await expect(discoverRoutes('ns', 'token')).rejects.toThrow('K8s API returned 500');
  });
});

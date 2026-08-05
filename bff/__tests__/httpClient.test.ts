import https from 'https';
import http from 'http';
import { EventEmitter } from 'events';
import { fetchUrl } from '../src/utils/httpClient';

jest.mock('https');
jest.mock('http');

const mockedHttps = jest.mocked(https);
const mockedHttp = jest.mocked(http);

function createMockResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.headers = headers;
  res.resume = jest.fn();
  res.destroy = jest.fn();
  process.nextTick(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  });
  return res;
}

function createMockRequest() {
  const req = new EventEmitter() as any;
  req.destroy = jest.fn();
  return req;
}

describe('fetchUrl', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches HTTPS URLs successfully', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(200, 'hello world'));
      return mockReq;
    });

    const result = await fetchUrl('https://example.com/file.yaml');
    expect(result).toBe('hello world');
    expect(mockedHttps.get).toHaveBeenCalled();
  });

  it('fetches HTTP URLs using http module', async () => {
    const mockReq = createMockRequest();
    mockedHttp.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(200, 'http content'));
      return mockReq;
    });

    const result = await fetchUrl('http://example.com/file.yaml');
    expect(result).toBe('http content');
    expect(mockedHttp.get).toHaveBeenCalled();
  });

  it('follows redirects', async () => {
    const mockReq = createMockRequest();
    let callCount = 0;
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      if (callCount++ === 0) {
        callback(createMockResponse(302, '', { location: 'https://example.com/redirected' }));
      } else {
        callback(createMockResponse(200, 'redirected content'));
      }
      return mockReq;
    });

    const result = await fetchUrl('https://example.com/original');
    expect(result).toBe('redirected content');
  });

  it('rejects non-HTTPS redirects', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(302, '', { location: 'http://internal.service/secret' }));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/redirect')).rejects.toThrow('Refusing non-HTTPS redirect');
  });

  it('rejects after too many redirects', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(302, '', { location: 'https://example.com/loop' }));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/loop', { redirectsRemaining: 0 })).rejects.toThrow('Too many redirects');
  });

  it('supports numeric second argument for backward compatibility', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(302, '', { location: 'https://example.com/loop' }));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/loop', 0)).rejects.toThrow('Too many redirects');
  });

  it('rejects on non-2xx status codes', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(404, 'not found'));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('rejects on request errors', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation(() => {
      process.nextTick(() => mockReq.emit('error', new Error('ECONNREFUSED')));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/fail')).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects on timeout', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation(() => {
      process.nextTick(() => mockReq.emit('timeout'));
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/slow')).rejects.toThrow('timed out');
    expect(mockReq.destroy).toHaveBeenCalled();
  });

  it('rejects when response body exceeds size limit', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      const res = new EventEmitter() as any;
      res.statusCode = 200;
      res.headers = {};
      res.resume = jest.fn();
      res.destroy = jest.fn();
      process.nextTick(() => {
        const largeChunk = Buffer.alloc(6 * 1024 * 1024);
        res.emit('data', largeChunk);
      });
      callback(res);
      return mockReq;
    });

    await expect(fetchUrl('https://example.com/huge')).rejects.toThrow('exceeds');
  });

  it('passes custom headers to the request', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(200, 'ok'));
      return mockReq;
    });

    await fetchUrl('https://example.com/auth', {
      headers: { Authorization: 'Bearer test-token' },
    });

    const callOpts = mockedHttps.get.mock.calls[0][1] as any;
    expect(callOpts.headers.Authorization).toBe('Bearer test-token');
    expect(callOpts.headers['Cache-Control']).toBe('no-cache');
  });

  it('forwards custom headers through redirects', async () => {
    const mockReq = createMockRequest();
    let callCount = 0;
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      if (callCount++ === 0) {
        callback(createMockResponse(302, '', { location: 'https://example.com/final' }));
      } else {
        callback(createMockResponse(200, 'done'));
      }
      return mockReq;
    });

    await fetchUrl('https://example.com/start', {
      headers: { Authorization: 'Bearer forwarded' },
    });

    const secondCallOpts = mockedHttps.get.mock.calls[1][1] as any;
    expect(secondCallOpts.headers.Authorization).toBe('Bearer forwarded');
  });

  it('passes agent option to the request', async () => {
    const mockReq = createMockRequest();
    mockedHttps.get.mockImplementation((_url: any, _opts: any, callback: any) => {
      callback(createMockResponse(200, 'ok'));
      return mockReq;
    });

    const mockAgent = new https.Agent();
    await fetchUrl('https://example.com/proxy', { agent: mockAgent });

    const callOpts = mockedHttps.get.mock.calls[0][1] as any;
    expect(callOpts.agent).toBe(mockAgent);
  });
});

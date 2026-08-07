import { renderHook, act } from '@testing-library/react';
import { useQuickstartLifecycle } from '../useQuickstartLifecycle';

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).TextDecoderStream = class {
    readable = {};
    writable = {};
  };
});

function createMockSSEResponse(events: Array<{ event: string; data: unknown }>) {
  const encoded = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');

  let resolved = false;
  const reader = {
    read: jest.fn().mockImplementation(() => {
      if (!resolved) {
        resolved = true;
        return Promise.resolve({ done: false, value: encoded });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
  };

  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: {
      pipeThrough: () => ({ getReader: () => reader }),
    },
  };
}

const progressSteps = [
  { id: 'resolve', label: 'Resolving quickstart', status: 'completed' as const },
  { id: 'helm-install', label: 'Running helm install', status: 'running' as const },
];

const completeResult = {
  success: true,
  message: 'Quickstart installed successfully',
  steps: [
    { id: 'resolve', label: 'Resolving quickstart', status: 'completed' as const },
    { id: 'helm-install', label: 'Running helm install', status: 'completed' as const },
  ],
  routes: [{ name: 'my-route', url: 'https://my-app.example.com' }],
};

describe('useQuickstartLifecycle', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should start in idle state', () => {
    const { result } = renderHook(() => useQuickstartLifecycle());

    expect(result.current.loading).toBe(false);
    expect(result.current.operation).toBeNull();
    expect(result.current.steps).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should handle install with SSE streaming', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      createMockSSEResponse([
        { event: 'progress', data: { steps: progressSteps } },
        { event: 'complete', data: completeResult },
      ]),
    );

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my-app/install',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
        body: JSON.stringify({ namespace: 'test-ns' }),
      }),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.operation).toBe('install');
    expect(result.current.result).toEqual(completeResult);
    expect(result.current.error).toBeNull();
  });

  it('should handle install with JSON response fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(completeResult),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.result).toEqual(completeResult);
    expect(result.current.error).toBeNull();
  });

  it('should handle install with values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(completeResult),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns', { replicas: 2 });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ namespace: 'test-ns', values: { replicas: 2 } }),
      }),
    );
  });

  it('should handle upgrade', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({ ...completeResult, message: 'Upgraded' }),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.upgrade('my-app', 'test-ns');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my-app/upgrade',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.operation).toBe('upgrade');
  });

  it('should handle remove', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({ ...completeResult, message: 'Removed' }),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.remove('my-app', 'test-ns');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my-app?namespace=test-ns',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.current.operation).toBe('remove');
  });

  it('should set error on failed result', async () => {
    const failedResult = {
      success: false,
      message: 'RBAC check failed',
      steps: [],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(failedResult),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.error).toBe('RBAC check failed');
    expect(result.current.result?.success).toBe(false);
  });

  it('should set error on HTTP error response with JSON error body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ error: 'Invalid namespace' })),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'kube-system');
    });

    expect(result.current.error).toBe('Invalid namespace');
    expect(result.current.result?.success).toBe(false);
  });

  it('should set error on HTTP error response with plain text body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: () => Promise.resolve('Internal Server Error'),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.error).toBe('Internal Server Error');
    expect(result.current.result?.success).toBe(false);
  });

  it('should set error on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.result?.success).toBe(false);
  });

  it('should reset state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(completeResult),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.operation).toBeNull();
    expect(result.current.steps).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should preserve steps and show friendly message when SSE stream drops', async () => {
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: `event: progress\ndata: ${JSON.stringify({ steps: progressSteps })}\n\n`,
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        pipeThrough: () => ({ getReader: () => reader }),
      },
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my-app', 'test-ns');
    });

    expect(result.current.error).toContain('Connection lost');
    expect(result.current.result?.success).toBe(false);
    expect(result.current.steps).toEqual(progressSteps);
  });

  it('should fetch installed values with getValues', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: { replicaCount: 3 } }),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    const values = await result.current.getValues('my-app', 'test-ns');

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my-app/values?namespace=test-ns',
    );
    expect(values).toEqual({ replicaCount: 3 });
  });

  it('should return an empty object from getValues when there are no values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    const values = await result.current.getValues('my-app', 'test-ns');
    expect(values).toEqual({});
  });

  it('should throw on a failed getValues request with a JSON error body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: 'Not found' })),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await expect(
      result.current.getValues('my-app', 'test-ns'),
    ).rejects.toThrow('Not found');
  });

  it('should throw on a failed getValues request with a plain text body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await expect(
      result.current.getValues('my-app', 'test-ns'),
    ).rejects.toThrow('Internal Server Error');
  });

  it('should encode special characters in getValues arguments', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ values: {} }),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());
    await result.current.getValues('my app', 'test ns');

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my%20app/values?namespace=test%20ns',
    );
  });

  it('should encode special characters in quickstart name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(completeResult),
    });

    const { result } = renderHook(() => useQuickstartLifecycle());

    await act(async () => {
      await result.current.install('my app', 'test-ns');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/my%20app/install',
      expect.any(Object),
    );
  });
});

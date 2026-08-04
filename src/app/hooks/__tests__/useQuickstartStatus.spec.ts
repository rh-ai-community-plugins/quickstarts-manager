import { renderHook, waitFor, act } from '@testing-library/react';
import { useQuickstartStatus } from '../useQuickstartStatus';

const mockStatus = {
  release: {
    name: 'lemonade-stand',
    namespace: 'my-namespace',
    status: 'deployed',
    chart: 'lemonade-stand-1.0.0',
    appVersion: '1.0.0',
  },
  routes: [
    { name: 'lemonade-route', url: 'https://lemonade.example.com' },
  ],
};

describe('useQuickstartStatus', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return null when no namespace is provided', async () => {
    const { result } = renderHook(() => useQuickstartStatus(null));

    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch status for a namespace with a deployed quickstart', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const { result } = renderHook(() => useQuickstartStatus('my-namespace'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toEqual(mockStatus);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/quickstarts/status?namespace=my-namespace',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should return null status when namespace has no deployed quickstart', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useQuickstartStatus('empty-ns'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return error on non-404 failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useQuickstartStatus('test-ns'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBeNull();
    expect(result.current.error).toBe(
      'Failed to fetch quickstart status: 500',
    );
  });

  it('should re-fetch when namespace changes', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { result, rerender } = renderHook(
      ({ ns }) => useQuickstartStatus(ns),
      { initialProps: { ns: 'ns-a' as string | null } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender({ ns: 'ns-b' });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/quickstarts-manager/api/quickstarts/status?namespace=ns-b',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should reset status when namespace changes to null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const { result, rerender } = renderHook(
      ({ ns }) => useQuickstartStatus(ns),
      { initialProps: { ns: 'my-namespace' as string | null } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual(mockStatus);

    rerender({ ns: null });

    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should support refresh', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const { result } = renderHook(() => useQuickstartStatus('my-namespace'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '../useSettings';

const mockSettings = {
  githubToken: '****c123',
  proxyUrl: 'http://proxy:3128',
  source: 'secret' as const,
};

describe('useSettings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch settings on mount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSettings),
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/settings',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should return permission error on 403', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBe('You do not have permission to view settings.');
  });

  it('should return error on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to fetch settings: 502');
  });

  it('should save settings with PUT', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSettings),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSettings),
      });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ githubToken: 'new-token' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/settings',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: 'new-token' }),
      }),
    );
  });

  it('should clear settings with DELETE', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSettings),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ githubToken: null, proxyUrl: null, source: 'default' }),
      });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/settings',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should handle save error', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSettings),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid proxy URL' }),
      });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ proxyUrl: 'not-a-url' });
    });

    expect(result.current.error).toBe('Invalid proxy URL');
  });
});

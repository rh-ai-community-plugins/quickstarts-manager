import { renderHook, waitFor, act } from '@testing-library/react';
import { useQuickstartCatalog } from '../useQuickstartCatalog';

const mockCatalog = [
  {
    name: 'lemonade-stand',
    repository: 'https://github.com/example/lemonade',
    metadataAvailable: true,
    displayName: 'Lemonade Stand',
    description: 'A demo chatbot',
    version: '1.0.0',
    tags: ['chatbot'],
  },
  {
    name: 'rag-pipeline',
    repository: 'https://github.com/example/rag',
    metadataAvailable: true,
    displayName: 'RAG Pipeline',
    description: 'Retrieval augmented generation',
    version: '2.0.0',
    tags: ['rag', 'llm'],
  },
];

describe('useQuickstartCatalog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch catalog on mount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCatalog),
    });

    const { result } = renderHook(() => useQuickstartCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quickstarts).toEqual(mockCatalog);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      '/quickstarts-manager/api/catalog',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should return error on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });

    const { result } = renderHook(() => useQuickstartCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quickstarts).toEqual([]);
    expect(result.current.error).toBe('Failed to fetch catalog: 502');
  });

  it('should return error on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useQuickstartCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quickstarts).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('should support refresh', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCatalog),
    });

    const { result } = renderHook(() => useQuickstartCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should use cache bypass URL when refresh(true) is called', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCatalog),
    });

    const { result } = renderHook(() => useQuickstartCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.refresh(true);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/quickstarts-manager/api/catalog?refresh=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

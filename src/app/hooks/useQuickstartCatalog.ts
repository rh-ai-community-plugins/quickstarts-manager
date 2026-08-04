import { useState, useEffect, useCallback, useRef } from 'react';
import { CatalogQuickstart } from '~/app/types/catalog';

export function useQuickstartCatalog() {
  const [quickstarts, setQuickstarts] = useState<CatalogQuickstart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCatalog = useCallback((bypassCache = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    const url = bypassCache
      ? '/quickstarts-manager/api/catalog?refresh=true'
      : '/quickstarts-manager/api/catalog';

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status}`);
        return res.json();
      })
      .then((data: CatalogQuickstart[]) => {
        setQuickstarts(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const refresh = useCallback((bypassCache = false) => {
    fetchCatalog(bypassCache);
  }, [fetchCatalog]);

  useEffect(() => {
    fetchCatalog();
    return () => controllerRef.current?.abort();
  }, [fetchCatalog]);

  return { quickstarts, loading, error, refresh };
}

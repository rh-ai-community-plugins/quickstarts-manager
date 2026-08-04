import { useState, useEffect, useCallback, useRef } from 'react';
import { QuickstartStatusResponse } from '~/app/types/status';

export function useQuickstartStatus(namespace: string | null) {
  const [status, setStatus] = useState<QuickstartStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback((ns: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    fetch(
      `/quickstarts-manager/api/quickstarts/status?namespace=${encodeURIComponent(ns)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok)
          throw new Error(`Failed to fetch quickstart status: ${res.status}`);
        return res.json();
      })
      .then((data: QuickstartStatusResponse | null) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const refresh = useCallback(() => {
    if (namespace) {
      fetchStatus(namespace);
    }
  }, [namespace, fetchStatus]);

  useEffect(() => {
    if (!namespace) {
      setStatus(null);
      setLoading(false);
      setError(null);
      return;
    }
    fetchStatus(namespace);
    return () => controllerRef.current?.abort();
  }, [namespace, fetchStatus]);

  return { status, loading, error, refresh };
}

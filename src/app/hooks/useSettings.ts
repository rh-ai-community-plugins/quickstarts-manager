import { useState, useEffect, useCallback, useRef } from 'react';
import { PluginSettings } from '~/app/types/settings';

export function useSettings() {
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSettings = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    fetch('/quickstarts-manager/api/settings', { signal: controller.signal })
      .then((res) => {
        if (res.status === 403) {
          throw new Error('You do not have permission to view settings.');
        }
        if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
        return res.json();
      })
      .then((data: PluginSettings) => {
        setSettings(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchSettings();
    return () => controllerRef.current?.abort();
  }, [fetchSettings]);

  const save = useCallback(
    async (values: { githubToken?: string; proxyUrl?: string }) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/quickstarts-manager/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to save settings: ${res.status}`);
        }
        fetchSettings();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [fetchSettings],
  );

  const remove = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/quickstarts-manager/api/settings', {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`Failed to clear settings: ${res.status}`);
      }
      fetchSettings();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [fetchSettings]);

  return { settings, loading, error, saving, save, remove };
}

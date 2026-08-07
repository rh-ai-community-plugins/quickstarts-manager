import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'rhoai.project-favorites';

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

// Module-level store so every useFavoriteProjects() consumer shares one
// favorites list. localStorage remains the source of truth; the cache mirrors
// it and is reconciled on mount and on cross-tab storage events. This keeps the
// page selector and the catalog-modal selector in sync when either toggles a
// favorite.
let cache: string[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string[] {
  return cache;
}

function syncFromStorage(): void {
  const next = readFavorites();
  // Only replace (and re-render) when the contents actually changed, so the
  // snapshot reference stays stable for useSyncExternalStore.
  if (next.length !== cache.length || next.some((v, i) => v !== cache[i])) {
    cache = next;
    emit();
  }
}

function setFavorites(next: string[]): void {
  cache = next;
  writeFavorites(next);
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      syncFromStorage();
    }
  });
}

export function useFavoriteProjects() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot);

  // Reconcile with localStorage on mount (authoritative source), covering
  // values written before this store was first loaded.
  useEffect(() => {
    syncFromStorage();
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    const next = cache.includes(name)
      ? cache.filter((f) => f !== name)
      : [...cache, name];
    setFavorites(next);
  }, []);

  const isFavorite = useCallback(
    (name: string) => favorites.includes(name),
    [favorites],
  );

  return { favorites, toggleFavorite, isFavorite };
}

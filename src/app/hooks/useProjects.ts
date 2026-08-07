import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Project = {
  metadata: {
    name: string;
    uid: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: {
    phase: string;
  };
};

type ProjectsState = {
  projects: Project[];
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: ProjectsState = {
  projects: [],
  loading: true,
  error: null,
};

// Module-level store so every useProjects() consumer shares one project list,
// one loading/error state, and a single in-flight fetch. This keeps the page
// selector and the catalog-modal selector in sync (created projects appear in
// both) and avoids a duplicate /projects request per mounted selector.
let state: ProjectsState = INITIAL_STATE;
let controller: AbortController | null = null;
let refCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<ProjectsState>): void {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ProjectsState {
  return state;
}

function refreshProjects(): Promise<Project[]> {
  controller?.abort();
  const activeController = new AbortController();
  controller = activeController;

  setState({ loading: true, error: null });
  return fetch('/api/k8s/apis/project.openshift.io/v1/projects', {
    signal: activeController.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const items: Project[] = data.items ?? [];
      setState({ projects: items, loading: false });
      return items;
    })
    .catch((e) => {
      if (e.name === 'AbortError') return [];
      setState({ error: e.message, loading: false });
      return [];
    });
}

function addProjectToStore(project: Project): void {
  if (state.projects.some((p) => p.metadata.name === project.metadata.name)) {
    return;
  }
  setState({ projects: [...state.projects, project] });
}

/** Reset the shared store to its initial state. Test-only. */
export function resetProjectsStore(): void {
  controller?.abort();
  controller = null;
  refCount = 0;
  state = INITIAL_STATE;
}

export function useProjects() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    refCount += 1;
    // Fetch once when the first consumer mounts; later consumers reuse the
    // shared result instead of triggering their own request.
    if (refCount === 1) {
      refreshProjects();
    }
    return () => {
      refCount -= 1;
      if (refCount === 0) {
        controller?.abort();
      }
    };
  }, []);

  const refresh = useCallback(() => refreshProjects(), []);
  const addProject = useCallback(
    (project: Project) => addProjectToStore(project),
    [],
  );

  return {
    projects: snapshot.projects,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh,
    addProject,
  };
}

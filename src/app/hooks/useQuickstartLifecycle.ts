import { useState, useCallback } from 'react';
import type {
  LifecycleOperation,
  LifecycleStep,
  LifecycleResponse,
  LifecycleProgressEvent,
} from '~/app/types/lifecycle';

const API_BASE = '/quickstarts-manager/api/quickstarts';

class StreamInterruptedError extends Error {
  constructor() {
    super(
      'Connection lost during operation. The operation may still be running. ' +
        'Close this dialog and refresh to check the current status.',
    );
    this.name = 'StreamInterruptedError';
  }
}

export interface QuickstartLifecycleState {
  loading: boolean;
  operation: LifecycleOperation | null;
  steps: LifecycleStep[];
  result: LifecycleResponse | null;
  error: string | null;
}

export type QuickstartLifecycle = QuickstartLifecycleState &
  QuickstartLifecycleActions;

export interface QuickstartLifecycleActions {
  install: (
    name: string,
    namespace: string,
    values?: Record<string, unknown>,
  ) => Promise<LifecycleResponse>;
  upgrade: (
    name: string,
    namespace: string,
    values?: Record<string, unknown>,
  ) => Promise<LifecycleResponse>;
  remove: (name: string, namespace: string) => Promise<LifecycleResponse>;
  getValues: (
    name: string,
    namespace: string,
  ) => Promise<Record<string, unknown>>;
  reset: () => void;
}

async function lifecycleStreamRequest(
  url: string,
  method: 'POST' | 'DELETE',
  onProgress: (steps: LifecycleStep[]) => void,
  body?: unknown,
): Promise<LifecycleResponse> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error ?? parsed.message ?? `Request failed: ${res.status}`;
    } catch {
      message = text || `Request failed: ${res.status}`;
    }
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return (await res.json()) as LifecycleResponse;
  }

  if (!res.body) {
    throw new Error('Response body is not readable');
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finalResult: LifecycleResponse | null = null;

  for (;;) {
    let done: boolean;
    let value: string | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch {
      throw new StreamInterruptedError();
    }
    if (done) break;

    buffer += value;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType = 'message';
      let data = '';

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          data = line.slice(6);
        }
      }

      if (!data) continue;

      if (eventType === 'progress') {
        const parsed: LifecycleProgressEvent = JSON.parse(data);
        onProgress(parsed.steps);
      } else if (eventType === 'complete') {
        finalResult = JSON.parse(data) as LifecycleResponse;
      }
    }
  }

  if (!finalResult) {
    throw new StreamInterruptedError();
  }

  return finalResult;
}

export function useQuickstartLifecycle(): QuickstartLifecycle {
  const [state, setState] = useState<QuickstartLifecycleState>({
    loading: false,
    operation: null,
    steps: [],
    result: null,
    error: null,
  });

  const execute = useCallback(
    async (
      operation: LifecycleOperation,
      requestFn: (
        onProgress: (steps: LifecycleStep[]) => void,
      ) => Promise<LifecycleResponse>,
    ): Promise<LifecycleResponse> => {
      setState({
        loading: true,
        operation,
        steps: [],
        result: null,
        error: null,
      });
      try {
        const result = await requestFn((steps) => {
          setState((prev) => ({ ...prev, steps: [...steps] }));
        });
        setState({
          loading: false,
          operation,
          steps: result.steps,
          result,
          error: result.success ? null : result.message,
        });
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        const failedResult: LifecycleResponse = {
          success: false,
          message,
          steps: [],
        };
        setState((prev) => ({
          loading: false,
          operation,
          steps: err instanceof StreamInterruptedError ? prev.steps : [],
          result: {
            ...failedResult,
            steps: err instanceof StreamInterruptedError ? prev.steps : [],
          },
          error: message,
        }));
        return failedResult;
      }
    },
    [],
  );

  const install = useCallback(
    (
      name: string,
      namespace: string,
      values?: Record<string, unknown>,
    ) =>
      execute('install', (onProgress) =>
        lifecycleStreamRequest(
          `${API_BASE}/${encodeURIComponent(name)}/install`,
          'POST',
          onProgress,
          { namespace, values },
        ),
      ),
    [execute],
  );

  const upgrade = useCallback(
    (
      name: string,
      namespace: string,
      values?: Record<string, unknown>,
    ) =>
      execute('upgrade', (onProgress) =>
        lifecycleStreamRequest(
          `${API_BASE}/${encodeURIComponent(name)}/upgrade`,
          'POST',
          onProgress,
          { namespace, values },
        ),
      ),
    [execute],
  );

  const remove = useCallback(
    (name: string, namespace: string) =>
      execute('remove', (onProgress) =>
        lifecycleStreamRequest(
          `${API_BASE}/${encodeURIComponent(name)}?namespace=${encodeURIComponent(namespace)}`,
          'DELETE',
          onProgress,
        ),
      ),
    [execute],
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      operation: null,
      steps: [],
      result: null,
      error: null,
    });
  }, []);

  const getValues = useCallback(
    async (
      name: string,
      namespace: string,
    ): Promise<Record<string, unknown>> => {
      const res = await fetch(
        `${API_BASE}/${encodeURIComponent(name)}/values?namespace=${encodeURIComponent(namespace)}`,
      );
      if (!res.ok) {
        const text = await res.text();
        let message: string;
        try {
          const parsed = JSON.parse(text);
          message = parsed.error ?? parsed.message ?? `Request failed: ${res.status}`;
        } catch {
          message = text || `Request failed: ${res.status}`;
        }
        throw new Error(message);
      }
      const data = await res.json();
      return data.values ?? {};
    },
    [],
  );

  return { ...state, install, upgrade, remove, getValues, reset };
}

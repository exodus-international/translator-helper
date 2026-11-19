'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Loads what a server action returns for `key` and reloads when the key
 * changes. Loading is derived from whether the data held belongs to the
 * current key, so a stale answer is never shown as the current one.
 */
export function useActionData<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ key, data });
      },
      () => {
        if (!cancelled) setState({ key, error: 'Could not load this. Try again.' });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure on every render; the key says when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = state && state.key === key ? state : null;

  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && current === null,
    reload,
  };
}

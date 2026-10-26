import * as React from 'react';

/** Long enough that typing a word is one save, short enough to feel automatic. */
export const AUTOSAVE_MS = 1500;

export type AutosaveStatus = 'saved' | 'pending' | 'saving' | 'invalid' | 'failed';

/**
 * Saves `value` a moment after it stops changing, and says where that stands.
 *
 * `validate` runs first and returns a sentence when the value cannot be saved
 * yet (a half-typed rate, an empty required field). Nothing is sent then; the
 * form shows the sentence and saves as soon as the value is valid again, so a
 * field mid-edit never produces an error toast.
 *
 * The value is compared by its JSON, so a new object with the same fields is
 * not a change, and the value the page loaded with is never saved back.
 */
export function useAutosave<T>({
  value,
  save,
  validate,
  delay = AUTOSAVE_MS,
}: {
  value: T;
  save: (value: T) => Promise<void>;
  validate?: (value: T) => string | null;
  delay?: number;
}): { status: AutosaveStatus; problem: string | null } {
  const json = JSON.stringify(value);
  const lastSaved = React.useRef(json);
  const timer = React.useRef(0);
  const [status, setStatus] = React.useState<AutosaveStatus>('saved');
  const [problem, setProblem] = React.useState<string | null>(null);

  // Read through refs so a re-render with new callbacks does not restart the wait.
  const saveRef = React.useRef(save);
  const validateRef = React.useRef(validate);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    saveRef.current = save;
    validateRef.current = validate;
    valueRef.current = value;
  });

  React.useEffect(() => {
    window.clearTimeout(timer.current);
    if (json === lastSaved.current) {
      setStatus('saved');
      setProblem(null);
      return;
    }

    const invalid = validateRef.current?.(valueRef.current) ?? null;
    if (invalid) {
      setStatus('invalid');
      setProblem(invalid);
      return;
    }

    setStatus('pending');
    setProblem(null);
    timer.current = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await saveRef.current(valueRef.current);
        lastSaved.current = json;
        // A change made while this save was in flight has its own timer and
        // status already; only the save of the latest value may say "saved".
        if (JSON.stringify(valueRef.current) === json) setStatus('saved');
      } catch (error) {
        setStatus('failed');
        setProblem(error instanceof Error ? error.message : 'The save failed');
      }
    }, delay);

    return () => window.clearTimeout(timer.current);
  }, [json, delay]);

  // Leaving the page inside the wait would drop the last edit. Send it on the
  // way out instead; nobody is left to show the result to.
  React.useEffect(
    () => () => {
      const current = valueRef.current;
      if (JSON.stringify(current) === lastSaved.current) return;
      if (validateRef.current?.(current)) return;
      void saveRef.current(current).catch(() => undefined);
    },
    [],
  );

  return { status, problem };
}

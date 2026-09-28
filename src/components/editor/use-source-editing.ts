'use client';

import { useEffect, useMemo, useState } from 'react';
import { lintDocument, type LintDiagnostic } from '@/lib/lint';

/**
 * Editing the English source in place: the draft, the save, the cancel, and
 * the lint findings the source pane shows in each of its views.
 */
export function useSourceEditing({
  canEditSource,
  sourceContent,
  sourceEditContent,
  onSourceChange,
  onSourceSave,
  /** The source pane shows the preview: findings then come from the text, not an editor. */
  inPreview,
  onEnter,
}: {
  canEditSource: boolean;
  sourceContent: string;
  sourceEditContent?: string;
  onSourceChange?: (value: string) => void;
  onSourceSave?: () => void | Promise<void>;
  inPreview: boolean;
  /** Runs when editing starts; the viewer switches the pane to its editor. */
  onEnter: () => void;
}) {
  const [isSourceEditing, setIsSourceEditing] = useState(false);
  const [sourceEditValue, setSourceEditValue] = useState(sourceEditContent ?? sourceContent);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<LintDiagnostic[]>([]);

  // The draft follows the host's copy of it.
  useEffect(() => {
    if (sourceEditContent !== undefined) {
      setSourceEditValue(sourceEditContent);
    }
  }, [sourceEditContent]);

  const handleSourceEditChange = (value: string) => {
    setSourceEditValue(value);
    onSourceChange?.(value);
  };

  const handleSourceSave = async () => {
    if (!onSourceSave) return;
    setSourceSaving(true);
    try {
      await onSourceSave();
      setIsSourceEditing(false);
    } catch (error) {
      console.error('Error saving source:', error);
    } finally {
      setSourceSaving(false);
    }
  };

  const handleSourceCancel = () => {
    setSourceEditValue(sourceEditContent ?? sourceContent);
    setIsSourceEditing(false);
  };

  const enterSourceEditMode = () => {
    if (!canEditSource) return;
    setSourceEditValue(sourceEditContent ?? sourceContent);
    setIsSourceEditing(true);
    onEnter();
  };

  // The source pane is linted like the translation, as the source: the style
  // rules adopt whatever it already does, and the rules that compare a
  // translation with its source stay out of it. In Preview there is no editor
  // to report them, so they are computed from the text.
  const inSourcePreview = inPreview && !isSourceEditing;
  const sourcePreviewDiagnostics = useMemo(
    () => (inSourcePreview ? lintDocument({ text: sourceContent, isSource: true }) : []),
    [inSourcePreview, sourceContent],
  );
  // Whichever view is up owns the bar. Falling back to the editor's last
  // report whenever Preview came back empty could not tell "Preview found
  // nothing" from "Preview has not run", and carried a finding from the editor
  // into Preview, where the text it was about is no longer on screen.
  const sourcePaneDiagnostics = inSourcePreview ? sourcePreviewDiagnostics : sourceDiagnostics;

  return {
    isSourceEditing,
    sourceEditValue,
    sourceSaving,
    sourcePaneDiagnostics,
    setSourceDiagnostics,
    handleSourceEditChange,
    handleSourceSave,
    handleSourceCancel,
    enterSourceEditMode,
  };
}

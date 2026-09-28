'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { extractTextAtRange } from '@/lib/text-range';
import type { CodeEditorHandle } from './code-editor';
import { selectionBox, type SelectionBox } from './toolbar-placement';

export interface SelectionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

type SuggestionKind = 'COMMENT' | 'CHANGE';

/**
 * Leaving a suggestion form or the Audio text tab with unsaved work asks
 * first. Both go through one dialog; `kind` picks its wording.
 */
export interface DiscardPrompt {
  open: boolean;
  kind: 'suggestion' | 'audioText';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Writing feedback on a selection: the toolbar that appears over selected
 * text, the form it opens, and the guard that asks before unsaved work in
 * that form, or in the Audio text tab, is thrown away.
 */
export function useSuggestionAuthoring({
  translationContent,
  editorRef,
  externalEditorRef,
  /** The suggestion toolbar owns the selection in these views. */
  showSelectionToolbar,
  /** The formatting toolbar owns it here; the selection is still tracked for it. */
  formattingEnabled,
  documentVersion,
  onCreateSuggestion,
  /** Anything the selection came from is unmounted when one of these changes. */
  viewKey,
}: {
  translationContent: string;
  editorRef: RefObject<CodeEditorHandle | null>;
  externalEditorRef?: RefObject<CodeEditorHandle | null>;
  showSelectionToolbar: boolean;
  formattingEnabled: boolean;
  documentVersion: number;
  onCreateSuggestion?: (data: {
    comment: string;
    proposedText?: string;
    type: SuggestionKind;
    range: SelectionRange;
    version: number;
  }) => void;
  viewKey: string;
}) {
  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [suggestionFormType, setSuggestionFormType] = useState<SuggestionKind>('COMMENT');
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [toolbarPosition, setToolbarPosition] = useState<SelectionBox | null>(null);
  const suggestionFormDirtyRef = useRef(false);
  // The Audio text tab is unmounted the moment another tab is chosen, taking
  // an unsaved draft with it. Same guard the suggestion form gets.
  const audioDraftDirtyRef = useRef(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [discardKind, setDiscardKind] = useState<'suggestion' | 'audioText'>('suggestion');
  const pendingDiscardActionRef = useRef<(() => void) | null>(null);

  const closeSuggestionForm = useCallback(() => {
    setShowSuggestionForm(false);
    setSelectedRange(null);
    setSelectedText('');
    suggestionFormDirtyRef.current = false;
  }, []);

  // Everything here is read off a selection, and the editor that reported it
  // is unmounted when the view changes. A freshly mounted one says nothing
  // until someone moves the cursor, so this state used to outlive the pane it
  // came from: the toolbar reappeared at its old coordinates with nothing
  // highlighted, and a form filed against a range out of a tab the reviewer
  // had already left. The form goes too: it remounts empty while its dirty
  // flag stayed set, so cancelling a form nobody had touched asked whether to
  // discard the work in it.
  useEffect(() => {
    setToolbarPosition(null);
    closeSuggestionForm();
  }, [viewKey, closeSuggestionForm]);

  const requestCloseSuggestionForm = useCallback(
    (onConfirmed?: () => void) => {
      if (!suggestionFormDirtyRef.current) {
        closeSuggestionForm();
        onConfirmed?.();
        return;
      }
      pendingDiscardActionRef.current = onConfirmed ?? null;
      setDiscardKind('suggestion');
      setShowDiscardDialog(true);
    },
    [closeSuggestionForm],
  );

  /** Leaving the Audio text tab, once whoever is in it has agreed to lose the draft. */
  const requestLeaveAudioText = useCallback((proceed: () => void) => {
    if (!audioDraftDirtyRef.current) {
      proceed();
      return;
    }
    pendingDiscardActionRef.current = () => {
      audioDraftDirtyRef.current = false;
      proceed();
    };
    setDiscardKind('audioText');
    setShowDiscardDialog(true);
  }, []);

  const discard: DiscardPrompt = {
    open: showDiscardDialog,
    kind: discardKind,
    onConfirm: () => {
      if (discardKind === 'suggestion') closeSuggestionForm();
      setShowDiscardDialog(false);
      pendingDiscardActionRef.current?.();
      pendingDiscardActionRef.current = null;
    },
    onCancel: () => {
      setShowDiscardDialog(false);
      pendingDiscardActionRef.current = null;
    },
  };

  const activeEditor = () => (editorRef.current || externalEditorRef?.current) ?? null;

  const handleSelectionChange = (range: SelectionRange | null) => {
    // A new selection while the form is open is a request to leave the form.
    if (showSuggestionForm) {
      requestCloseSuggestionForm();
      return;
    }

    setSelectedRange(range);
    if (range) {
      const editor = activeEditor()?.editor;
      let text = '';
      try {
        text = editor ? editor.getTextInRange(range) : extractTextAtRange(translationContent, range);
      } catch (error) {
        console.error('Error getting selected text from the editor:', error);
        try {
          text = extractTextAtRange(translationContent, range);
        } catch {
          text = '';
        }
      }
      setSelectedText(text);
    } else {
      setSelectedText('');
    }

    const showToolbar = !!range && (showSelectionToolbar || formattingEnabled);
    const view = showToolbar ? activeEditor()?.view : null;
    setToolbarPosition(view ? selectionBox(view) : null);
  };

  const openSuggestionForm = (type: SuggestionKind) => {
    if (!selectedRange) return;
    setSuggestionFormType(type);
    setShowSuggestionForm(true);
    setToolbarPosition(null);
  };

  const submitSuggestionForm = (data: { comment: string; proposedText?: string }) => {
    if (!selectedRange || !onCreateSuggestion) return;
    onCreateSuggestion({ ...data, type: suggestionFormType, range: selectedRange, version: documentVersion });
    closeSuggestionForm();
  };

  return {
    showSuggestionForm,
    suggestionFormType,
    selectedRange,
    selectedText,
    toolbarPosition,
    setToolbarPosition,
    suggestionFormDirtyRef,
    audioDraftDirtyRef,
    discard,
    requestLeaveAudioText,
    requestCloseSuggestionForm,
    handleSelectionChange,
    openSuggestionForm,
    submitSuggestionForm,
  };
}

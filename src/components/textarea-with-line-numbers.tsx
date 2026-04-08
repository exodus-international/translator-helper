'use client';

import { cn } from '@/lib/utils';
import Editor from '@monaco-editor/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SuggestionWithUser, useMonacoSuggestions } from './monaco-suggestion-decorations';

interface TextareaWithLineNumbersProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (lineNumber: number) => void;
  readOnly?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  currentLine?: number;
  highlightLine?: number; // Line to highlight from external source
  suggestions?: SuggestionWithUser[];
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onSelectionChange?: (
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null,
  ) => void;
}

export const TextareaWithLineNumbers = forwardRef<any, TextareaWithLineNumbersProps>(function TextareaWithLineNumbers(
  {
    value,
    onChange,
    onCursorChange,
    readOnly = false,
    className,
    currentLine,
    highlightLine,
    suggestions = [],
    onSuggestionClick,
    onSelectionChange,
  },
  forwardedRef,
) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Expose editor and monaco refs to parent
  useImperativeHandle(
    forwardedRef,
    () => ({
      editor: editorRef.current,
      monaco: monacoRef.current,
    }),
    [editorMounted],
  );

  // Highlight the synced line from the other pane using deltaDecorations.
  // This works regardless of focus state (no cursor move, no focus steal).
  const highlightDecorationsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    if (!highlightLine) {
      // Clear decorations when there's no highlight line
      highlightDecorationsRef.current = editor.deltaDecorations(highlightDecorationsRef.current, []);
      return;
    }

    // Apply a line-wide background decoration on the target line
    highlightDecorationsRef.current = editor.deltaDecorations(highlightDecorationsRef.current, [
      {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: 'synced-line-highlight',
        },
      },
    ]);

    // Scroll the line into view (does NOT steal focus)
    editor.revealLineInCenterIfOutsideViewport(highlightLine);
  }, [highlightLine]);

  const handleEditorChange = (value: string | undefined) => {
    if (!readOnly && onChange) {
      onChange(value || '');
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom theme matching your app's design
    monaco.editor.defineTheme('translation-theme', {
      base: 'vs',
      inherit: true,
      rules: [{ token: '', foreground: '0a0a0a' }],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#0a0a0a',
        'editor.lineHighlightBackground': '#dbeafe', // Light blue-100
        'editor.lineHighlightBorder': '#00000000', // Transparent (no border)
        'editorLineNumber.foreground': '#9ca3af', // Gray-400
        'editorLineNumber.activeForeground': '#3b82f6', // Blue-500
        'editor.selectionBackground': '#bfdbfe', // Blue-200
        'editor.inactiveSelectionBackground': '#bfdbfe', // Blue-200 (same as active)
        'editorCursor.foreground': '#3b82f6', // Blue-500
      },
    });

    monaco.editor.setTheme('translation-theme');

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition((e: any) => {
      if (e?.source === 'api') {
        return;
      }
      if (onCursorChange && e.position) {
        onCursorChange(e.position.lineNumber);
      }
    });

    // Scroll to current line if provided
    if (currentLine) {
      editor.revealLineInCenter(currentLine);
    }

    // Signal that editor is ready so useImperativeHandle re-evaluates
    setEditorMounted(true);

    // Listen for selection changes (use ref to always call latest callback)
    editor.onDidChangeCursorSelection((e: any) => {
      if (!onSelectionChangeRef.current) return;
      const selection = e.selection;
      if (selection && !selection.isEmpty()) {
        onSelectionChangeRef.current({
          startLine: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLine: selection.endLineNumber,
          endColumn: selection.endColumn,
        });
      } else {
        onSelectionChangeRef.current(null);
      }
    });
  };

  // Apply suggestion decorations
  useMonacoSuggestions({
    editor: editorRef.current,
    monaco: monacoRef.current,
    suggestions,
    onSuggestionClick,
  });

  return (
    <div className={cn('border-t overflow-hidden h-full', className)}>
      <Editor
        height="100%"
        defaultLanguage="markdown"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          glyphMargin: suggestions.length > 0, // Enable glyph margin when there are suggestions
          folding: false,
          lineDecorationsWidth: 10,
          lineNumbers: 'on',
          lineNumbersMinChars: 4,
          occurrencesHighlight: 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          lineHeight: 22,
          padding: {
            top: 22,
            bottom: 22,
          },

          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          overviewRulerLanes: suggestions.length > 0 ? 2 : 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          renderLineHighlight: 'all',
          renderLineHighlightOnlyWhenFocus: true,
          automaticLayout: true,
          quickSuggestions: false,
          suggest: { showWords: false },
          acceptSuggestionOnCommitCharacter: false,
          acceptSuggestionOnEnter: 'off',
          contextmenu: false,
          selectionHighlight: false,
          selectOnLineNumbers: true,
        }}
        theme="translation-theme"
      />
    </div>
  );
});

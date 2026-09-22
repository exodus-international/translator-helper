import { cn } from '@/lib/utils';
import { forwardRef, type ReactNode } from 'react';
import { CodeEditor, type CodeEditorHandle } from './editor/code-editor';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import type { LintDiagnostic } from '@/lib/lint';

interface RawEditorPaneProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number, toLine: boolean) => void;
  readOnly?: boolean;
  placeholder?: string;
  currentLine?: number;
  highlightLine?: number;
  language?: string;
  fullHeight?: boolean;
  className?: string;
  editorContainerClassName?: string;
  suggestions?: SuggestionWithUser[];
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onSelectionChange?: (
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null,
  ) => void;
  /** The source-language text, which switches on the parity lint rules. */
  sourceContent?: string;
  /** This pane holds the English source itself, and is linted as one. */
  isSource?: boolean;
  onDiagnosticsChange?: (diagnostics: LintDiagnostic[]) => void;
  /** Turn linting off entirely — for panes showing content the reader can't edit. */
  lint?: boolean;
  /** Opens the Markdown guide from a lint finding, when the host offers one. */
  onOpenGuide?: () => void;
  /** Rendered under the editor, inside the pane — the lint status bar goes here. */
  footer?: ReactNode;
  /** Accessible name for the editing surface — see CodeEditor. */
  ariaLabel?: string;
}

export const RawEditorPane = forwardRef<CodeEditorHandle, RawEditorPaneProps>(function RawEditorPane(
  {
    value,
    onChange,
    onCursorChange,
    readOnly,
    placeholder,
    currentLine,
    highlightLine,
    language,
    fullHeight = false,
    className,
    editorContainerClassName,
    suggestions,
    onSuggestionClick,
    onSelectionChange,
    sourceContent,
    isSource,
    onDiagnosticsChange,
    lint,
    onOpenGuide,
    footer,
    ariaLabel,
  },
  ref,
) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/*
        min-h-0 is load-bearing: a column flex item defaults to min-height:auto,
        which is the editor's full document height. Without it the container
        grows past the pane instead of shrinking, and CodeMirror's scroller —
        sized to that container — has nothing left to scroll.
      */}
      <div className={cn(fullHeight ? 'min-h-0 flex-1' : 'flex min-h-0 flex-1 flex-col', editorContainerClassName)}>
        <CodeEditor
          ref={ref}
          value={value}
          onChange={onChange}
          onCursorChange={onCursorChange}
          readOnly={readOnly}
          placeholder={placeholder}
          currentLine={currentLine}
          highlightLine={highlightLine}
          language={language}
          suggestions={suggestions}
          onSuggestionClick={onSuggestionClick}
          onSelectionChange={onSelectionChange}
          sourceContent={sourceContent}
          isSource={isSource}
          onDiagnosticsChange={onDiagnosticsChange}
          lint={lint}
          onOpenGuide={onOpenGuide}
          ariaLabel={ariaLabel}
        />
      </div>
      {footer}
    </div>
  );
});

import { cn } from '@/lib/utils';
import { forwardRef, type ReactNode } from 'react';
import { CodeEditor, type CodeEditorHandle } from './editor/code-editor';
import { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import type { LintDiagnostic } from '@/lib/lint';

interface LineInfo {
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel?: string;
  secondaryValue?: number;
  direction?: 'to' | 'from';
}

interface RawEditorPaneProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number) => void;
  readOnly?: boolean;
  placeholder?: string;
  currentLine?: number;
  highlightLine?: number;
  language?: string;
  lineInfo?: LineInfo;
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
  onDiagnosticsChange?: (diagnostics: LintDiagnostic[]) => void;
  /** Turn linting off entirely — for panes showing content the reader can't edit. */
  lint?: boolean;
  /** Rendered under the editor, inside the pane — the lint status bar goes here. */
  footer?: ReactNode;
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
    lineInfo,
    fullHeight = false,
    className,
    editorContainerClassName,
    suggestions,
    onSuggestionClick,
    onSelectionChange,
    sourceContent,
    onDiagnosticsChange,
    lint,
    footer,
  },
  ref,
) {
  return (
    <div className={cn(fullHeight ? 'flex h-full flex-col space-y-2 ' : 'flex h-full flex-col space-y-2', className)}>
      {lineInfo && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-0.5">
          <span className="font-semibold">L{lineInfo.primaryValue}</span>
          {lineInfo.secondaryLabel !== undefined && lineInfo.secondaryValue !== undefined && (
            <>
              <span>{lineInfo.direction === 'from' ? '←' : '→'}</span>
              <span>L{lineInfo.secondaryValue}</span>
            </>
          )}
        </div>
      )}
      {/*
        min-h-0 is load-bearing: a column flex item defaults to min-height:auto,
        which is the editor's full document height. Without it the container
        grows past the pane instead of shrinking, and CodeMirror's scroller —
        sized to that container — has nothing left to scroll.
      */}
      <div className={cn(fullHeight ? 'min-h-0 flex-1' : 'flex h-full min-h-0 flex-col', editorContainerClassName)}>
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
          onDiagnosticsChange={onDiagnosticsChange}
          lint={lint}
        />
      </div>
      {footer}
    </div>
  );
});

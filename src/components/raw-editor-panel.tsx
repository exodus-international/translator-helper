import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import { TextareaWithLineNumbers } from './textarea-with-line-numbers';
import { SuggestionWithUser } from './monaco-suggestion-decorations';

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
  lineInfo?: LineInfo;
  fullHeight?: boolean;
  className?: string;
  editorContainerClassName?: string;
  suggestions?: SuggestionWithUser[];
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  onSelectionChange?: (range: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null) => void;
}

export const RawEditorPane = forwardRef<any, RawEditorPaneProps>(function RawEditorPane(
  {
    value,
    onChange,
    onCursorChange,
    readOnly,
    placeholder,
    currentLine,
    highlightLine,
    lineInfo,
    fullHeight = false,
    className,
    editorContainerClassName,
    suggestions,
    onSuggestionClick,
    onSelectionChange,
  },
  ref,
) {
  return (
    <div className={cn(fullHeight ? 'flex h-full flex-col space-y-2' : 'space-y-2', className)}>
      {lineInfo && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-3">
          <span className="font-semibold">
            {lineInfo.primaryLabel}: {lineInfo.primaryValue}
          </span>
          {lineInfo.secondaryLabel !== undefined && lineInfo.secondaryValue !== undefined && (
            <>
              <span className="text-gray-400">{lineInfo.direction === 'from' ? '←' : '→'}</span>
              <span>
                {lineInfo.secondaryLabel}: {lineInfo.secondaryValue}
              </span>
            </>
          )}
        </div>
      )}
      <div className={cn(fullHeight ? 'flex-1' : 'h-120', editorContainerClassName)}>
        <TextareaWithLineNumbers
          ref={ref}
          value={value}
          onChange={onChange}
          onCursorChange={onCursorChange}
          readOnly={readOnly}
          placeholder={placeholder}
          currentLine={currentLine}
          highlightLine={highlightLine}
          suggestions={suggestions}
          onSuggestionClick={onSuggestionClick}
          onSelectionChange={onSelectionChange}
        />
      </div>
    </div>
  );
});

'use client';

import { cn } from '@/lib/utils';
import { DiffEditor } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { SuggestionWithUser } from './monaco-suggestion-decorations';

interface SuggestionDiffViewerProps {
  originalContent: string;
  suggestions: SuggestionWithUser[];
  selectedUserId?: string | null; // Filter by user ID - show only changes from this user
  className?: string;
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
}

export function SuggestionDiffViewer({
  originalContent,
  suggestions,
  selectedUserId,
  className,
  onSuggestionClick,
}: SuggestionDiffViewerProps) {
  const diffEditorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Filter suggestions by user if selectedUserId is provided
  const filteredSuggestions = selectedUserId
    ? suggestions.filter((s) => s.user.id === selectedUserId && (s.status === 'APPLIED' || s.status === 'OPEN'))
    : suggestions.filter((s) => s.status === 'APPLIED' || s.status === 'OPEN');

  // Apply all filtered suggestions to create the modified content
  const [modifiedContent, setModifiedContent] = useState<string>(originalContent);

  useEffect(() => {
    if (filteredSuggestions.length === 0) {
      setModifiedContent(originalContent);
      return;
    }

    // Sort suggestions by line number (top to bottom)
    const sortedSuggestions = [...filteredSuggestions].sort((a, b) => {
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      return a.startColumn - b.startColumn;
    });

    // Apply suggestions in reverse order (bottom to top) to maintain line numbers
    let content = originalContent;
    const lines = content.split('\n');

    // Apply each suggestion
    sortedSuggestions.forEach((suggestion) => {
      if (suggestion.type === 'CHANGE' && suggestion.proposedText) {
        const startLine = suggestion.startLine - 1; // Convert to 0-based
        const endLine = suggestion.endLine - 1;
        const startColumn = suggestion.startColumn - 1;
        const endColumn = suggestion.endColumn - 1;

        if (startLine >= 0 && endLine < lines.length) {
          if (startLine === endLine) {
            // Single line replacement
            const line = lines[startLine];
            const before = line.substring(0, startColumn);
            const after = line.substring(endColumn);
            lines[startLine] = before + suggestion.proposedText + after;
          } else {
            // Multi-line replacement
            const firstLine = lines[startLine];
            const lastLine = lines[endLine];
            const before = firstLine.substring(0, startColumn);
            const after = lastLine.substring(endColumn);
            const newLines = [before + suggestion.proposedText + after];
            lines.splice(startLine, endLine - startLine + 1, ...newLines);
          }
        }
      }
    });

    setModifiedContent(lines.join('\n'));
  }, [originalContent, filteredSuggestions]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    diffEditorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom theme
    monaco.editor.defineTheme('translation-theme', {
      base: 'vs',
      inherit: true,
      rules: [{ token: '', foreground: '0a0a0a' }],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#0a0a0a',
        'diffEditor.insertedTextBackground': '#e6ffed',
        'diffEditor.insertedTextBorder': '#81c784',
        'diffEditor.removedTextBackground': '#ffebee',
        'diffEditor.removedTextBorder': '#e57373',
        'diffEditor.unchangedCodeBackground': '#f5f5f5',
        'diffEditor.unchangedRegionBackground': '#f5f5f5',
        'diffEditor.unchangedRegionForeground': '#9e9e9e',
      },
    });

    monaco.editor.setTheme('translation-theme');
  };

  return (
    <div className={cn('border rounded-md overflow-hidden h-full', className)}>
      <DiffEditor
        height="100%"
        language="markdown"
        original={originalContent}
        modified={modifiedContent}
        onMount={handleEditorDidMount}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          lineHeight: 22,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          automaticLayout: true,
        }}
        theme="translation-theme"
      />
    </div>
  );
}

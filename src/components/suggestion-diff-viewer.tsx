'use client';

import { cn } from '@/lib/utils';
import { applyTextEditAtRange, isRangeWithinBounds } from '@/lib/text-range';
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

    // Apply CHANGE suggestions bottom-up so earlier line indices stay valid
    // even when a multi-line replacement collapses or extends rows.
    const sortedSuggestions = filteredSuggestions
      .filter((s) => s.startLine != null && s.startColumn != null && s.endLine != null && s.endColumn != null)
      .sort((a, b) => {
        if (a.startLine! !== b.startLine!) return b.startLine! - a.startLine!;
        return b.startColumn! - a.startColumn!;
      });

    let content = originalContent;
    for (const s of sortedSuggestions) {
      if (s.type !== 'CHANGE' || !s.proposedText) continue;
      const range = {
        startLine: s.startLine!,
        startColumn: s.startColumn!,
        endLine: s.endLine!,
        endColumn: s.endColumn!,
      };
      if (!isRangeWithinBounds(range, content.split('\n').length)) continue;
      content = applyTextEditAtRange(content, range, s.proposedText);
    }

    setModifiedContent(content);
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

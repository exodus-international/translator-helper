'use client';

import { SuggestionStatus, SuggestionType } from '@prisma/client';
import { useEffect, useRef } from 'react';

export interface SuggestionWithUser {
  id: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  type: SuggestionType;
  status: SuggestionStatus;
  comment: string;
  proposedText: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  createdAt: string;
  version: number;
}

interface UseMonacoSuggestionsProps {
  editor: any; // Monaco editor instance
  monaco: any; // Monaco namespace
  suggestions: SuggestionWithUser[];
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
}

export function useMonacoSuggestions({ editor, monaco, suggestions, onSuggestionClick }: UseMonacoSuggestionsProps) {
  const decorationsRef = useRef<string[]>([]);
  const gutterDecorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editor || !monaco) return;

    // Clear existing decorations
    if (decorationsRef.current.length > 0) {
      editor.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }
    if (gutterDecorationsRef.current.length > 0) {
      editor.deltaDecorations(gutterDecorationsRef.current, []);
      gutterDecorationsRef.current = [];
    }

    if (suggestions.length === 0) return;

    const decorations: any[] = [];
    const gutterDecorations: any[] = [];

    suggestions.forEach((suggestion) => {
      // Determine color based on status
      let className = '';
      let glyphMarginClassName = '';
      let glyphMarginHoverMessage = '';

      if (suggestion.status === SuggestionStatus.OPEN) {
        if (suggestion.type === SuggestionType.COMMENT) {
          className = 'suggestion-comment-open';
          glyphMarginClassName = 'suggestion-gutter-comment';
          glyphMarginHoverMessage = '💬 Comment';
        } else {
          className = 'suggestion-change-open';
          glyphMarginClassName = 'suggestion-gutter-change';
          glyphMarginHoverMessage = '✎ Suggested change';
        }
      } else if (suggestion.status === SuggestionStatus.APPLIED) {
        className = 'suggestion-applied';
        glyphMarginClassName = 'suggestion-gutter-applied';
        glyphMarginHoverMessage = '✓ Applied';
      } else {
        className = 'suggestion-dismissed';
        glyphMarginClassName = 'suggestion-gutter-dismissed';
        glyphMarginHoverMessage = '✗ Dismissed';
      }

      // Create range decoration
      const range = new monaco.Range(
        suggestion.startLine,
        suggestion.startColumn,
        suggestion.endLine,
        suggestion.endColumn,
      );

      decorations.push({
        range,
        options: {
          className,
          hoverMessage: {
            value: suggestion.comment,
          },
          minimap: {
            color: suggestion.status === SuggestionStatus.OPEN ? '#fbbf24' : '#9ca3af',
            position: 1,
          },
          overviewRuler: {
            color: suggestion.status === SuggestionStatus.OPEN ? '#fbbf24' : '#9ca3af',
            position: 1,
          },
        },
      });

      // Create gutter decoration (icon on the line number)
      if (suggestion.status === SuggestionStatus.OPEN) {
        gutterDecorations.push({
          range: new monaco.Range(suggestion.startLine, 1, suggestion.startLine, 1),
          options: {
            glyphMarginClassName,
            glyphMarginHoverMessage: {
              value: glyphMarginHoverMessage,
            },
            minimap: {
              color: '#fbbf24',
              position: 2,
            },
          },
        });
      }
    });

    // Apply decorations
    if (decorations.length > 0) {
      const decorationIds = editor.deltaDecorations([], decorations);
      decorationsRef.current = decorationIds;
    }

    if (gutterDecorations.length > 0) {
      const gutterIds = editor.deltaDecorations([], gutterDecorations);
      gutterDecorationsRef.current = gutterIds;
    }

    // Add click handler for gutter
    if (onSuggestionClick && gutterDecorations.length > 0) {
      const disposable = editor.onMouseDown((e: any) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const lineNumber = e.target.position.lineNumber;
          const suggestion = suggestions.find((s) => s.startLine === lineNumber && s.status === SuggestionStatus.OPEN);
          if (suggestion) {
            onSuggestionClick(suggestion);
            // Scroll to the suggestion
            editor.revealLineInCenter(suggestion.startLine);
            editor.setPosition({ lineNumber: suggestion.startLine, column: suggestion.startColumn });
          }
        }
      });

      return () => {
        disposable.dispose();
      };
    }
  }, [editor, monaco, suggestions, onSuggestionClick]);

  return { decorationsRef, gutterDecorationsRef };
}

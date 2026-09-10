'use client';

/**
 * Inline highlights for
 * suggestion ranges plus a clickable gutter marker on lines that carry an open
 * one. Colours come from the suggestion classes in globals.css.
 */

import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { positionToOffset } from './editor-api';

export const setSuggestions = StateEffect.define<SuggestionWithUser[]>();

export const suggestionsField = StateField.define<SuggestionWithUser[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSuggestions)) return effect.value;
    }
    return value;
  },
});

const isAnchored = (s: SuggestionWithUser) =>
  s.startLine != null && s.startColumn != null && s.endLine != null && s.endColumn != null;

function markClass(suggestion: SuggestionWithUser): string {
  if (suggestion.status === SuggestionStatus.APPLIED) return 'suggestion-applied';
  if (suggestion.status !== SuggestionStatus.OPEN) return 'suggestion-dismissed';
  return suggestion.type === SuggestionType.COMMENT ? 'suggestion-comment-open' : 'suggestion-change-open';
}

function gutterClass(suggestion: SuggestionWithUser): string {
  if (suggestion.status === SuggestionStatus.APPLIED) return 'suggestion-gutter-applied';
  if (suggestion.status !== SuggestionStatus.OPEN) return 'suggestion-gutter-dismissed';
  return suggestion.type === SuggestionType.COMMENT ? 'suggestion-gutter-comment' : 'suggestion-gutter-change';
}

/**
 * An APPLIED change no longer spans its original range — the replacement text
 * has a different length — so the end is recomputed from `proposedText`, the
 * same way the gutter icons do.
 */
function endOf(suggestion: SuggestionWithUser): { line: number; column: number } {
  if (
    suggestion.status === SuggestionStatus.APPLIED &&
    suggestion.type === SuggestionType.CHANGE &&
    suggestion.proposedText != null
  ) {
    const lines = suggestion.proposedText.split('\n');
    return lines.length === 1
      ? { line: suggestion.startLine!, column: suggestion.startColumn! + lines[0].length }
      : { line: suggestion.startLine! + lines.length - 1, column: lines[lines.length - 1].length + 1 };
  }
  return { line: suggestion.endLine!, column: suggestion.endColumn! };
}

function buildDecorations(view: EditorView, suggestions: SuggestionWithUser[]): DecorationSet {
  const ranges = suggestions
    .filter(isAnchored)
    .map((suggestion) => {
      const from = positionToOffset(view, suggestion.startLine!, suggestion.startColumn!);
      const end = endOf(suggestion);
      const to = positionToOffset(view, end.line, end.column);
      return { suggestion, from, to };
    })
    .filter(({ from, to }) => to > from)
    .sort((a, b) => a.from - b.from)
    .map(({ suggestion, from, to }) =>
      Decoration.mark({ class: markClass(suggestion), attributes: { title: suggestion.comment } }).range(from, to),
    );

  return Decoration.set(ranges, true);
}

const suggestionDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, view.state.field(suggestionsField));
    }

    update(update: ViewUpdate) {
      const suggestionsChanged = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setSuggestions)),
      );
      if (update.docChanged || suggestionsChanged) {
        this.decorations = buildDecorations(update.view, update.state.field(suggestionsField));
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

class SuggestionGutterMarker extends GutterMarker {
  constructor(private readonly suggestion: SuggestionWithUser) {
    super();
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = gutterClass(this.suggestion);
    span.title = this.suggestion.comment;
    return span;
  }
}

const openSuggestionAt = (view: EditorView, position: number) => {
  const line = view.state.doc.lineAt(position).number;
  return view.state
    .field(suggestionsField)
    .find((s) => isAnchored(s) && s.startLine === line && s.status === SuggestionStatus.OPEN);
};

export function suggestionExtension(onSuggestionClick?: (suggestion: SuggestionWithUser) => void): Extension {
  return [
    suggestionsField,
    suggestionDecorations,
    gutter({
      class: 'cm-suggestion-gutter',
      lineMarker: (view, block) => {
        const suggestion = openSuggestionAt(view, block.from);
        return suggestion ? new SuggestionGutterMarker(suggestion) : null;
      },
      domEventHandlers: {
        mousedown(view, block) {
          const suggestion = openSuggestionAt(view, block.from);
          if (!suggestion || !onSuggestionClick) return false;
          onSuggestionClick(suggestion);
          view.dispatch({
            selection: { anchor: positionToOffset(view, suggestion.startLine!, suggestion.startColumn!) },
            scrollIntoView: true,
          });
          return true;
        },
      },
    }),
  ];
}

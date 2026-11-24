'use client';

import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  closeHoverTooltips,
  hoverTooltip,
  keymap,
  showTooltip,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from '@codemirror/view';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { findCitations, type Citation } from '@/domain/scripture/citations';
import { isResolved, NOT_A_REFERENCE, type Edit } from '@/domain/scripture/scripture-check';
import type { ScriptureHost } from './scripture-context';
import { ScriptureCard } from './scripture-card';
import {
  checkReference,
  isPassageSettled,
  isReferenceCheckSettled,
  peekPassage,
  peekReferenceCheck,
  resolvePassage,
} from './scripture-client';

/**
 * Scripture citations in the translation editor: underlined once the Bible
 * says they are references, with a card on hover or click that shows the
 * official citation and text and offers to write them in.
 *
 * Typing must not wait on any of it. The scan runs after a pause in typing,
 * over the lines on screen only, and asks the Bible once per citation per
 * page; until it answers, a citation is simply not underlined. Between scans
 * the underlines move with the text.
 */

const SCAN_DELAY_MS = 400;
const SCROLL_SCAN_DELAY_MS = 120;
const FLASH_MS = 1600;

export interface ScriptureExtensionConfig {
  /** Read at use, so the card sees the host as it is now. */
  host: () => ScriptureHost | null;
}

/** Asks the scanner to look again: the Bible loaded, a check came back. */
export const rescanScripture = StateEffect.define<null>();

interface Found extends Citation {
  warn: boolean;
}

const refMark = Decoration.mark({ class: 'cm-scripture-ref' });
const warnMark = Decoration.mark({ class: 'cm-scripture-ref cm-scripture-ref-warn' });

class Scanner {
  decorations: DecorationSet = Decoration.none;
  found: Found[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly config: ScriptureExtensionConfig,
  ) {
    this.schedule(0);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = this.decorations.map(update.changes);
      this.found = this.found.flatMap((c) => {
        const from = update.changes.mapPos(c.from, 1);
        const to = update.changes.mapPos(c.to, -1);
        return to > from && update.state.sliceDoc(from, to) === c.raw ? [{ ...c, from, to }] : [];
      });
      this.schedule(SCAN_DELAY_MS);
    } else if (update.viewportChanged) {
      this.schedule(SCROLL_SCAN_DELAY_MS);
    }
    if (update.transactions.some((tr) => tr.effects.some((e) => e.is(rescanScripture)))) this.scan();
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.destroyed) this.view.dispatch({ effects: rescanScripture.of(null) });
    }, delay);
  }

  /** Runs inside an update, so the decorations it sets are drawn with it. */
  private scan() {
    const host = this.config.host();
    if (!host || host.bible === null) {
      this.decorations = Decoration.none;
      this.found = [];
      return;
    }
    const { state } = this.view;
    const candidates = new Map<number, Citation>();
    for (const { from, to } of this.view.visibleRanges) {
      const start = state.doc.lineAt(from).from;
      const end = state.doc.lineAt(to).to;
      for (const c of findCitations(state.sliceDoc(start, end))) {
        candidates.set(start + c.from, { ...c, from: start + c.from, to: start + c.to });
      }
    }

    // RSV-CE says whether it is a reference at all; the document's Bible says
    // whether it can supply it (a psalm whose numbering is not mapped cannot).
    const translation = host.bible ? host.translation : null;
    const found: Found[] = [];
    const unknown: string[] = [];
    const unresolved: string[] = [];
    for (const c of [...candidates.values()].sort((a, b) => a.from - b.from)) {
      const check = peekReferenceCheck(c.text);
      if (!check) {
        if (!isReferenceCheckSettled(c.text)) unknown.push(c.text);
        continue;
      }
      if (NOT_A_REFERENCE.has(check.status)) continue;
      const passage = translation ? peekPassage(c.text, translation) : undefined;
      if (translation && !passage && !isPassageSettled(c.text, translation)) unresolved.push(c.text);
      const supplied = passage ? isResolved(passage) : check.status === 'ok' || check.status === 'partial';
      found.push({ ...c, warn: !supplied });
    }
    this.found = found;
    const ranges: Range<Decoration>[] = found.map((c) => (c.warn ? warnMark : refMark).range(c.from, c.to));
    this.decorations = Decoration.set(ranges, true);

    const rescan = () => {
      if (!this.destroyed) this.view.dispatch({ effects: rescanScripture.of(null) });
    };
    if (unknown.length) Promise.all([...new Set(unknown)].map((ref) => checkReference(ref))).then(rescan);
    if (translation && unresolved.length) {
      Promise.all([...new Set(unresolved)].map((ref) => resolvePassage(ref, translation))).then(rescan);
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}

function citationAt(scanner: Scanner | null, pos: number, side: -1 | 1 = 1): Found | null {
  return scanner?.found.find((c) => (side < 0 ? c.from < pos && pos <= c.to : c.from <= pos && pos < c.to)) ?? null;
}

// ─── The card ─────────────────────────────────────────────

/** A card that stays open after a click, until Escape, a click elsewhere or an edit. */
const pinCard = StateEffect.define<Found | null>();

function cardTooltip(citation: Found, config: ScriptureExtensionConfig, pinned: boolean): Tooltip {
  return {
    pos: citation.from,
    end: citation.to,
    above: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'cm-scripture-card';
      const root = createRoot(dom);
      const close = () => view.dispatch({ effects: [pinCard.of(null), closeHoverTooltips] });
      root.render(
        createElement(ScriptureCard, {
          citation,
          doc: view.state.doc.toString(),
          host: config.host(),
          readOnly: view.state.readOnly,
          pinned,
          onEdit: (edit: Edit) => {
            applyEdits(view, [edit]);
            close();
            view.focus();
          },
          onClose: close,
        }),
      );
      // The card is a React tree of its own: unmounted after CodeMirror has
      // finished with the dom, never in the middle of an update.
      return { dom, destroy: () => setTimeout(() => root.unmount(), 0) };
    },
  };
}

function pinnedField(config: ScriptureExtensionConfig) {
  return StateField.define<{ citation: Found; tooltip: Tooltip } | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(pinCard)) return e.value ? { citation: e.value, tooltip: cardTooltip(e.value, config, true) } : null;
      }
      if (!value) return value;
      if (tr.docChanged) return null;
      if (tr.selection) {
        const head = tr.state.selection.main.head;
        if (head < value.citation.from || head > value.citation.to) return null;
      }
      return value;
    },
    provide: (field) => showTooltip.from(field, (value) => value?.tooltip ?? null),
  });
}

// ─── Changes ──────────────────────────────────────────────

function nearest(doc: string, needle: string, around: number): number {
  let best = -1;
  for (let i = doc.indexOf(needle); i !== -1; i = doc.indexOf(needle, i + 1)) {
    if (best === -1 || Math.abs(i - around) < Math.abs(best - around)) best = i;
  }
  return best;
}

/**
 * Applies edits as one transaction, so one undo takes them all back, and the
 * editor reports the change the way it reports typing. An edit whose text has
 * moved is applied where the text now is; one whose text is gone is skipped.
 * Returns how many were applied.
 */
export function applyEdits(view: EditorView, edits: Edit[]): number {
  const doc = view.state.doc.toString();
  const changes = edits
    .map((edit) => {
      if (doc.slice(edit.from, edit.to) === edit.expected) return edit;
      const at = nearest(doc, edit.expected, edit.from);
      return at === -1 ? null : { ...edit, from: at, to: at + edit.expected.length };
    })
    .filter((edit): edit is Edit => edit !== null)
    .sort((a, b) => a.from - b.from)
    .filter((edit, i, all) => i === 0 || edit.from >= all[i - 1].to)
    .map(({ from, to, insert }) => ({ from, to, insert }));
  if (changes.length === 0) return 0;
  const first = changes[0];
  view.dispatch({
    changes,
    userEvent: 'input.scripture',
    effects: changes.length === 1 ? flashRange(view, first.from, first.from + first.insert.length) : [],
  });
  return changes.length;
}

// ─── Pointing at a citation ───────────────────────────────

const setFlash = StateEffect.define<{ from: number; to: number } | null>();

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFlash)) {
        next =
          e.value && e.value.to > e.value.from
            ? Decoration.set([Decoration.mark({ class: 'cm-scripture-flash' }).range(e.value.from, e.value.to)])
            : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const flashTimers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();

/** Marks a range for a moment: where a change landed, or the citation the check pointed at. */
function flashRange(view: EditorView, from: number, to: number) {
  clearTimeout(flashTimers.get(view));
  flashTimers.set(
    view,
    setTimeout(() => view.dispatch({ effects: setFlash.of(null) }), FLASH_MS),
  );
  return setFlash.of({ from, to });
}

/**
 * Scrolls a range into the middle of the editor, selects it and marks it for a
 * moment. Given the text it should hold, it finds that text nearby when the
 * document has moved since the range was taken.
 */
export function revealRange(view: EditorView, from: number, to: number, expected?: string) {
  if (expected && view.state.sliceDoc(from, to) !== expected) {
    const at = nearest(view.state.doc.toString(), expected, from);
    if (at !== -1) {
      from = at;
      to = at + expected.length;
    }
  }
  const max = view.state.doc.length;
  const a = Math.min(from, max);
  const b = Math.min(to, max);
  view.dispatch({
    selection: { anchor: a, head: b },
    effects: [EditorView.scrollIntoView(a, { y: 'center' }), flashRange(view, a, b)],
  });
}

// ─── The extension ────────────────────────────────────────

const scriptureTheme = EditorView.baseTheme({
  '.cm-scripture-ref': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'color-mix(in oklch, var(--info) 75%, transparent)',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '3px',
  },
  '.cm-scripture-ref-warn': {
    textDecorationColor: 'var(--warning)',
  },
  '.cm-scripture-flash': {
    backgroundColor: 'color-mix(in oklch, var(--info) 18%, transparent)',
    borderRadius: '2px',
    transition: 'background-color 300ms ease-out',
  },
  '.cm-tooltip:has(> .cm-scripture-card)': {
    padding: '0',
    overflow: 'hidden',
  },
});

export function scriptureExtension(config: ScriptureExtensionConfig): Extension {
  const scannerPlugin = ViewPlugin.define((view) => new Scanner(view, config), {
    decorations: (scanner) => scanner.decorations,
  });
  const pinned = pinnedField(config);
  return [
    scannerPlugin,
    pinned,
    flashField,
    scriptureTheme,
    hoverTooltip(
      (view, pos, side) => {
        const citation = citationAt(view.plugin(scannerPlugin), pos, side);
        if (!citation) return null;
        if (view.state.field(pinned)?.citation.from === citation.from) return null;
        return cardTooltip(citation, config, false);
      },
      { hoverTime: 350 },
    ),
    EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const citation = pos === null ? null : citationAt(view.plugin(scannerPlugin), pos);
        if (citation && view.state.selection.main.empty) {
          view.dispatch({ effects: [closeHoverTooltips, pinCard.of(citation)] });
        }
        return false;
      },
    }),
    keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          if (!view.state.field(pinned)) return false;
          view.dispatch({ effects: pinCard.of(null) });
          return true;
        },
      },
    ]),
  ];
}

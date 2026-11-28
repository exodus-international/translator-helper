'use client';

import { StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
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
import type { Edit } from '@/domain/scripture/scripture-check';
import { buildStandardCheck } from '@/domain/standard-translation/standard-translation.check';
import { applyEdits } from './cm-scripture';
import { StandardCard, type StandardItem } from './standard-card';
import type { StandardHost } from './standard-host';
import { wordingSpans, type Span } from './standard-lines';

/**
 * Standard translations in the translation editor: the team's wording marked
 * where the translation has it (a violet tint, or a dotted violet underline
 * for a term the grammar may inflect) and where it has a variant of it
 * (amber), with a card on hover or click that shows the difference and
 * writes the standard text in.
 *
 * Typing must not wait on it. The check reads the whole document, so it runs
 * after a pause in typing, once per version of the document; scrolling only
 * decorates the lines that came on screen. Between scans the marks move with
 * the text. What the translation lacks has nothing to mark here: the
 * document panel lists it.
 */

const SCAN_DELAY_MS = 400;
const SCROLL_SCAN_DELAY_MS = 120;

export interface StandardExtensionConfig {
  /** Read at use, so the card sees the host as it is now. */
  host: () => StandardHost | null;
}

/** Asks the scanner to look again: the entries or the source changed. */
export const rescanStandard = StateEffect.define<null>();

interface Found {
  item: StandardItem;
  from: number;
  to: number;
  /** The translation's text over the range when found: an edit that changes it drops the mark. */
  text: string;
  /** What is marked: the wording on each line. */
  spans: Span[];
}

const standardMark = Decoration.mark({ class: 'cm-std' });
const termMark = Decoration.mark({ class: 'cm-std-term' });
const changedMark = Decoration.mark({ class: 'cm-std-changed' });

const markOf = (item: StandardItem) =>
  item.state === 'changed' ? changedMark : item.kind === 'term' ? termMark : standardMark;

/** The check of one version of the document, against the entries and source it was run with. */
interface Checked {
  doc: Text;
  text: string;
  entries: StandardHost['entries'];
  source: string;
  items: StandardItem[];
}

class Scanner {
  decorations: DecorationSet = Decoration.none;
  found: Found[] = [];
  private checked: Checked | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly config: StandardExtensionConfig,
  ) {
    this.schedule(0);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = this.decorations.map(update.changes);
      this.found = this.found.flatMap((f) => {
        const from = update.changes.mapPos(f.from, 1);
        const to = update.changes.mapPos(f.to, -1);
        if (to <= from || update.state.sliceDoc(from, to) !== f.text) return [];
        const spans = f.spans.map((s) => ({
          from: update.changes.mapPos(s.from, 1),
          to: update.changes.mapPos(s.to, -1),
        }));
        return [{ ...f, from, to, spans }];
      });
      this.schedule(SCAN_DELAY_MS);
    } else if (update.viewportChanged) {
      this.schedule(SCROLL_SCAN_DELAY_MS);
    }
    if (update.transactions.some((tr) => tr.effects.some((e) => e.is(rescanStandard)))) this.scan();
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.destroyed) this.view.dispatch({ effects: rescanStandard.of(null) });
    }, delay);
  }

  /** The check of the document as it is now, run again only when the document, entries or source moved on. */
  private check(host: StandardHost): Checked {
    const { doc } = this.view.state;
    const last = this.checked;
    if (last && last.doc === doc && last.entries === host.entries && last.source === host.sourceContent) return last;
    const text = doc.toString();
    const items = buildStandardCheck({ source: host.sourceContent, translation: text, entries: host.entries });
    this.checked = { doc, text, entries: host.entries, source: host.sourceContent, items };
    return this.checked;
  }

  /** Runs inside an update, so the decorations it sets are drawn with it. */
  private scan() {
    const host = this.config.host();
    if (!host || host.entries.length === 0 || !host.sourceContent) {
      this.decorations = Decoration.none;
      this.found = [];
      this.checked = null;
      return;
    }
    const { text, items } = this.check(host);
    const visible = this.view.visibleRanges;
    const found: Found[] = [];
    const ranges: Range<Decoration>[] = [];
    for (const item of items) {
      const range = item.range;
      if (!range || !visible.some((v) => range.from < v.to && range.to > v.from)) continue;
      const spans = wordingSpans(text, range.from, range.to);
      found.push({ item, from: range.from, to: range.to, text: text.slice(range.from, range.to), spans });
      const mark = markOf(item);
      for (const span of spans) ranges.push(mark.range(span.from, span.to));
    }
    this.found = found;
    this.decorations = Decoration.set(ranges, true);
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}

/** The standard text marked at `pos`: on its wording, not on the layout between its lines. */
function foundAt(scanner: Scanner | null, pos: number, side: -1 | 1 = 1): Found | null {
  const on = (s: Span) => (side < 0 ? s.from < pos && pos <= s.to : s.from <= pos && pos < s.to);
  return scanner?.found.find((f) => f.spans.some(on)) ?? null;
}

// ─── The card ─────────────────────────────────────────────

/** A card that stays open after a click, until Escape, a click elsewhere or an edit. */
const pinCard = StateEffect.define<Found | null>();

function cardTooltip(found: Found, config: StandardExtensionConfig, pinned: boolean): Tooltip {
  return {
    pos: found.from,
    end: found.to,
    above: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'cm-std-card';
      const root = createRoot(dom);
      const close = () => view.dispatch({ effects: [pinCard.of(null), closeHoverTooltips] });
      const host = config.host();
      root.render(
        createElement(StandardCard, {
          item: found.item,
          host,
          readOnly: view.state.readOnly || !host?.editable,
          pinned,
          onUse: (edit: Edit) => {
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

function pinnedField(config: StandardExtensionConfig) {
  return StateField.define<{ found: Found; tooltip: Tooltip } | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(pinCard)) return e.value ? { found: e.value, tooltip: cardTooltip(e.value, config, true) } : null;
      }
      if (!value) return value;
      if (tr.docChanged) return null;
      if (tr.selection) {
        const head = tr.state.selection.main.head;
        if (head < value.found.from || head > value.found.to) return null;
      }
      return value;
    },
    provide: (field) => showTooltip.from(field, (value) => value?.tooltip ?? null),
  });
}

// ─── The extension ────────────────────────────────────────

const standardTheme = EditorView.baseTheme({
  // The tokens are set for light and dark in globals.css, so one rule serves both.
  '.cm-std': {
    backgroundColor: 'color-mix(in oklch, var(--hue-violet) 10%, transparent)',
    borderBottom: '1.5px solid color-mix(in oklch, var(--hue-violet) 70%, transparent)',
    borderRadius: '2px',
  },
  '.cm-std-term': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'color-mix(in oklch, var(--hue-violet) 80%, transparent)',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '3px',
  },
  '.cm-std-changed': {
    backgroundColor: 'color-mix(in oklch, var(--warning) 10%, transparent)',
    borderBottom: '1.5px solid var(--warning)',
    borderRadius: '2px',
  },
  '.cm-tooltip:has(> .cm-std-card)': {
    padding: '0',
    overflow: 'hidden',
  },
});

export function standardExtension(config: StandardExtensionConfig): Extension {
  const scannerPlugin = ViewPlugin.define((view) => new Scanner(view, config), {
    decorations: (scanner) => scanner.decorations,
  });
  const pinned = pinnedField(config);
  return [
    scannerPlugin,
    pinned,
    standardTheme,
    hoverTooltip(
      (view, pos, side) => {
        const found = foundAt(view.plugin(scannerPlugin), pos, side);
        if (!found) return null;
        if (view.state.field(pinned)?.found.from === found.from) return null;
        return cardTooltip(found, config, false);
      },
      { hoverTime: 350 },
    ),
    EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const found = pos === null ? null : foundAt(view.plugin(scannerPlugin), pos);
        if (found && view.state.selection.main.empty) {
          view.dispatch({ effects: [closeHoverTooltips, pinCard.of(found)] });
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

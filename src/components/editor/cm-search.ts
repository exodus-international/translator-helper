'use client';

/**
 * Find and replace, which the editor before this one had built in and this one
 * lost.
 *
 * It keeps that editor's two keys and what each of them showed. Mod-f opens
 * find alone. Mod-Alt-f (Ctrl-h off macOS) opens the same panel with the
 * replace row under it and the cursor in the replace field. CodeMirror's panel
 * always draws both rows, so the replace row is hidden until it is asked for,
 * by key or by the chevron at the start of the panel.
 *
 * Mod-g and F3 step through the matches, Mod-Alt-g goes to a line, Escape
 * closes the panel. A read-only pane has no replace row at all, and both keys
 * open plain find there.
 *
 * Two of the package's bindings are left out. Select-next-occurrence and
 * select-all-matches add a selection range per match, and this editor keeps a
 * single selection, so they would collapse to one range and do nothing a
 * translator could see.
 */

import {
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
  selectNextOccurrence,
  selectSelectionMatches,
} from '@codemirror/search';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, type KeyBinding } from '@codemirror/view';

const setReplaceOpen = StateEffect.define<boolean>();

/** Whether the replace row is showing. The class on the editor is what the theme reads. */
const replaceOpen = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setReplaceOpen)) value = effect.value;
    }
    return value;
  },
  provide: (field) =>
    EditorView.editorAttributes.from(field, (open): Record<string, string> => (open ? { class: 'cm-replace-open' } : {})),
});

function replaceField(view: EditorView): HTMLInputElement | null {
  return view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]');
}

function openFindPanel(view: EditorView): boolean {
  // A panel opened for finding starts without the replace row. One that is
  // already open keeps whatever it shows: the key then only moves the cursor.
  if (!searchPanelOpen(view.state)) view.dispatch({ effects: setReplaceOpen.of(false) });
  return openSearchPanel(view);
}

function openReplacePanel(view: EditorView): boolean {
  openSearchPanel(view);
  if (view.state.readOnly) return true;
  view.dispatch({ effects: setReplaceOpen.of(true) });
  const field = replaceField(view);
  field?.focus();
  field?.select();
  return true;
}

/**
 * The chevron that shows and hides the replace row, for anyone who does not
 * know the key. The panel's markup is CodeMirror's, so the button is added to
 * it once the panel exists rather than declared with it.
 */
const replaceToggle = ViewPlugin.fromClass(
  class {
    constructor(private readonly view: EditorView) {
      this.schedule();
    }

    update() {
      this.sync();
      this.schedule();
    }

    // The panel is drawn by another plugin, which may run after this one in
    // the same update. The second pass catches a panel that appeared late.
    private schedule() {
      this.view.requestMeasure({ read: () => null, write: () => this.sync() });
    }

    private sync() {
      const panel = this.view.dom.querySelector('.cm-search');
      if (!panel || !replaceField(this.view)) return;
      const open = this.view.state.field(replaceOpen);
      let button = panel.querySelector<HTMLButtonElement>('button[name=toggleReplace]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.name = 'toggleReplace';
        button.className = 'cm-replace-toggle';
        button.textContent = '›';
        button.setAttribute('aria-label', 'Toggle replace');
        button.onclick = () => {
          const next = !this.view.state.field(replaceOpen);
          this.view.dispatch({ effects: setReplaceOpen.of(next) });
          if (next) replaceField(this.view)?.focus();
        };
        panel.prepend(button);
      }
      if (button.getAttribute('aria-expanded') !== String(open)) button.setAttribute('aria-expanded', String(open));
    }
  },
);

/**
 * The replace key, matched by the physical key as well as by the keymap.
 *
 * On macOS Option turns F into "ƒ", and the keymap then has to recover the
 * letter from the legacy key code. A browser or a keyboard layout that
 * reports another code leaves the binding unmatched, and the key falls
 * through to whatever the browser does with it. `code` names the key itself,
 * whatever it types. Listening on the editor's root covers the panel's own
 * fields too.
 */
const replaceKeyByPosition = ViewPlugin.fromClass(
  class {
    private readonly onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.code !== 'KeyF' || !event.altKey || event.shiftKey) return;
      // One of the two, not both: Cmd on macOS, Ctrl elsewhere.
      if (event.metaKey === event.ctrlKey) return;
      event.preventDefault();
      openReplacePanel(this.view);
    };

    constructor(private readonly view: EditorView) {
      view.dom.addEventListener('keydown', this.onKeyDown);
    }

    destroy() {
      this.view.dom.removeEventListener('keydown', this.onKeyDown);
    }
  },
);

const findKeymap: KeyBinding[] = [
  { key: 'Mod-f', run: openFindPanel, scope: 'editor search-panel' },
  { key: 'Mod-Alt-f', run: openReplacePanel, scope: 'editor search-panel', preventDefault: true },
  // Not on macOS, where Ctrl-h deletes backwards.
  { win: 'Ctrl-h', linux: 'Ctrl-h', run: openReplacePanel, scope: 'editor search-panel', preventDefault: true },
  ...searchKeymap.filter(
    (binding) =>
      binding.run !== openSearchPanel && binding.run !== selectNextOccurrence && binding.run !== selectSelectionMatches,
  ),
];

/** The search extension, and the keys that go ahead of the editor's own keymap. */
export const findAndReplace: Extension = [
  search({ top: true }),
  replaceOpen,
  replaceToggle,
  replaceKeyByPosition,
  keymap.of(findKeymap),
];

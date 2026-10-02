'use client';

/**
 * Find and replace, which the editor before this one had built in and this one
 * lost.
 *
 * It keeps that editor's two keys and what each of them showed. Mod-f opens
 * find alone. Mod-Alt-f (Ctrl-h off macOS) opens the same panel with the
 * replace row under it and the cursor in the replace field. Mod-Shift-f does
 * the same, for anyone who finds the Option combination awkward. CodeMirror's panel
 * always draws both rows, so the replace row is hidden until it is asked for,
 * by key or by the chevron at the start of the panel.
 *
 * Mod-g and F3 step through the matches, Mod-Alt-g goes to a line, Escape
 * closes the panel. A read-only pane has no replace row at all. The replace
 * keys open find there and say why, in a line under it: opening find without
 * a word looks like the key did the wrong thing.
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
  // Read-only too: there the open state shows the note instead of the row.
  view.dispatch({ effects: setReplaceOpen.of(true) });
  if (view.state.readOnly) return true;
  const field = replaceField(view);
  field?.focus();
  field?.select();
  return true;
}

/**
 * What the app adds to CodeMirror's panel. Its markup is the library's, so
 * both pieces are added once the panel exists rather than declared with it.
 *
 * An editable pane gets the chevron that shows and hides the replace row, for
 * anyone who does not know the key. A read-only pane gets the note that says
 * replace is not on offer, which the theme shows once replace is asked for.
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
      if (!panel) return;
      if (!replaceField(this.view)) {
        if (!panel.querySelector('.cm-replace-unavailable')) {
          const note = document.createElement('p');
          note.className = 'cm-replace-unavailable';
          note.textContent = 'This text is read-only here, so replace is not available.';
          panel.append(note);
        }
        return;
      }
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

const findKeymap: KeyBinding[] = [
  { key: 'Mod-f', run: openFindPanel, scope: 'editor search-panel' },
  { key: 'Mod-Alt-f', run: openReplacePanel, scope: 'editor search-panel', preventDefault: true },
  { key: 'Mod-Shift-f', run: openReplacePanel, scope: 'editor search-panel', preventDefault: true },
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
  keymap.of(findKeymap),
];

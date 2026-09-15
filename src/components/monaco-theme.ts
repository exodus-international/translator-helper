'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Monaco paints its own chrome from a registered theme rather than from CSS, so
 * it can't inherit the `.dark` tokens the rest of the shell uses. Both editors
 * register the same pair of themes here and switch between them, keeping the
 * editor surface in step with the app instead of staying white on a dark page.
 *
 * The colours mirror the light/dark `--background` / `--foreground` pairs in
 * globals.css; the accents stay on the blue ramp the light theme already used,
 * shifted lighter for dark so they hold contrast against the darker ground.
 */
const LIGHT_THEME = 'translation-theme';
const DARK_THEME = 'translation-theme-dark';

/** Extra colour keys only the diff editor understands. */
type ThemeColors = Record<string, string>;

const EDITOR_LIGHT: ThemeColors = {
  'editor.background': '#ffffff',
  'editor.foreground': '#0a0a0a',
  'editor.lineHighlightBackground': '#dbeafe',
  'editor.lineHighlightBorder': '#00000000',
  'editorLineNumber.foreground': '#9ca3af',
  'editorLineNumber.activeForeground': '#3b82f6',
  'editor.selectionBackground': '#bfdbfe',
  'editor.inactiveSelectionBackground': '#bfdbfe',
  'editorCursor.foreground': '#3b82f6',
};

const EDITOR_DARK: ThemeColors = {
  'editor.background': '#252525',
  'editor.foreground': '#fafafa',
  'editor.lineHighlightBackground': '#1e3a5f',
  'editor.lineHighlightBorder': '#00000000',
  'editorLineNumber.foreground': '#6b7280',
  'editorLineNumber.activeForeground': '#60a5fa',
  'editor.selectionBackground': '#2b4b74',
  'editor.inactiveSelectionBackground': '#2b4b74',
  'editorCursor.foreground': '#60a5fa',
};

const DIFF_LIGHT: ThemeColors = {
  'diffEditor.insertedTextBackground': '#e6ffed',
  'diffEditor.insertedTextBorder': '#81c784',
  'diffEditor.removedTextBackground': '#ffebee',
  'diffEditor.removedTextBorder': '#e57373',
  'diffEditor.unchangedCodeBackground': '#f5f5f5',
  'diffEditor.unchangedRegionBackground': '#f5f5f5',
  'diffEditor.unchangedRegionForeground': '#9e9e9e',
};

const DIFF_DARK: ThemeColors = {
  // Translucent so the inserted/removed washes tint the dark ground rather than
  // punching light blocks through it.
  'diffEditor.insertedTextBackground': '#22c55e26',
  'diffEditor.insertedTextBorder': '#2f6f43',
  'diffEditor.removedTextBackground': '#ef444426',
  'diffEditor.removedTextBorder': '#7f3a3a',
  'diffEditor.unchangedCodeBackground': '#1f1f1f',
  'diffEditor.unchangedRegionBackground': '#1f1f1f',
  'diffEditor.unchangedRegionForeground': '#8a8a8a',
};

/**
 * Registers both themes on the Monaco instance. Call from `onMount`, before
 * setting a theme — `defineTheme` is global to the Monaco instance, so doing it
 * twice is harmless.
 */
export function defineTranslationThemes(monaco: any, { diff = false }: { diff?: boolean } = {}) {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [{ token: '', foreground: '0a0a0a' }],
    colors: { ...EDITOR_LIGHT, ...(diff ? DIFF_LIGHT : {}) },
  });
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: '', foreground: 'fafafa' }],
    colors: { ...EDITOR_DARK, ...(diff ? DIFF_DARK : {}) },
  });
}

/**
 * The theme name for the current appearance, and an effect that re-applies it
 * whenever the user flips the toggle. `resolvedTheme` is undefined until
 * next-themes has read the OS preference; light is the safe first paint.
 */
export function useMonacoTheme(monacoRef: React.RefObject<any>) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    monacoRef.current?.editor.setTheme(theme);
  }, [monacoRef, theme]);

  return theme;
}

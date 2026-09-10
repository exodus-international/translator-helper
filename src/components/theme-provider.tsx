'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * next-themes writes the chosen theme onto <html> as a class, which is what the
 * `.dark` token block in globals.css keys off. It has to be a client component
 * because it reads localStorage and the OS preference before paint.
 *
 * `disableTransitionOnChange` stops every `transition-colors` in the tree from
 * animating at once while the palette swaps, which otherwise reads as a smear.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

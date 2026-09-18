import type { Metadata, Viewport } from 'next';
import { Alegreya, Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { getCurrentUser } from '@/lib/session';
import { SIDEBAR_COOKIE_NAME } from '@/lib/sidebar-cookie';
import { AppShell } from '@/components/app-shell';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { FeedbackButton } from '@/components/feedback-button';
import { PostHogProvider } from '@/components/posthog-provider';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// The serif the reading app sets its content in. Loaded here only so the
// formatted preview can show a translator what a reader will actually see;
// nothing in the tool's own chrome uses it. latin-ext covers the Czech and
// Polish diacritics the translations carry.
const alegreya = Alegreya({
  variable: '--font-reader',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const APP_NAME = 'Translation Helper';
const APP_DESCRIPTION = 'Manage your document translations efficiently';

export const metadata: Metadata = {
  // Without this, Next.js resolves the preview image against localhost and
  // every unfurl outside dev breaks.
  //
  // APP_URL first: NEXT_PUBLIC_* is inlined at build time, so a value supplied
  // only to the running container never reaches it. This is read on the server,
  // so a plain variable works and can be changed without a rebuild.
  metadataBase: new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: APP_NAME,
  description: APP_DESCRIPTION,
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#FE5A25',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  // First paint already has the width the user last chose.
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== 'false';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${alegreya.variable} antialiased`}>
        <ThemeProvider>
          <PostHogProvider user={user}>
            <NuqsAdapter>
              <AppShell user={user} defaultOpen={sidebarOpen}>
                {children}
              </AppShell>
              {/* Signed-in users get these two links in the sidebar footer instead. */}
              {!user && <FeedbackButton />}
              <Toaster />
            </NuqsAdapter>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

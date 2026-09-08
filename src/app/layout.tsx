import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { getCurrentUser } from '@/lib/session';
import { SIDEBAR_COOKIE_NAME } from '@/lib/sidebar-cookie';
import { AppShell } from '@/components/app-shell';
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
  // Same cookie ui/sidebar.tsx writes on toggle: reading it server-side means
  // the sidebar's first paint already has the width the user last chose.
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== 'false';

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PostHogProvider user={user}>
          <NuqsAdapter>
            <AppShell user={user} defaultOpen={sidebarOpen}>
              {children}
            </AppShell>
            <FeedbackButton />
            <Toaster />
          </NuqsAdapter>
        </PostHogProvider>
      </body>
    </html>
  );
}

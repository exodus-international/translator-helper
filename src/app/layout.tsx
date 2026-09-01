import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/session';
import { Navigation } from '@/components/navigation';
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
  themeColor: '#E08A1E',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PostHogProvider user={user}>
          <NuqsAdapter>
            <Navigation user={user} />
            {children}
            <FeedbackButton />
            <Toaster />
          </NuqsAdapter>
        </PostHogProvider>
      </body>
    </html>
  );
}

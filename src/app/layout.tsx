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
  // every unfurl outside dev breaks. Read on the server at runtime, so the
  // deployment can change it without a rebuild. Same variable auth.ts uses.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
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

import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Translation Helper',
  description: 'Manage your document translations efficiently',
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

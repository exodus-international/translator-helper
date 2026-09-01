import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Translation Helper',
    short_name: 'Translations',
    description: 'Manage your document translations efficiently',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0E0D0B',
    theme_color: '#E08A1E',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // Android crops this to whatever shape the launcher uses, so the mark
      // sits inside the middle 80%.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

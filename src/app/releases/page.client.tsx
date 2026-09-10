'use client';

import { MarkdownPreview } from '@/components/markdown-preview';
import { Card, CardContent } from '@/components/ui/card';
import type { ReleaseNote } from '@/lib/release-notes';

export default function ReleasesClient({ releases }: { releases: ReleaseNote[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Release notes</h1>

      {releases.length === 0 ? (
        <p className="text-muted-foreground text-sm">No release notes yet — check back after the next release.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {releases.map((release) => (
            <Card key={release.version}>
              <CardContent>
                <MarkdownPreview content={release.content} className="prose" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

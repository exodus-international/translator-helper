import { Skeleton } from '@/components/ui/skeleton';

// Instant shell while the editor loads its document, versions and suggestions.
// Mirrors the editor's own frame — one toolbar row, then panes on the workspace
// ground — so the load resolves into the same shape it promised.
export default function EditorLoading() {
  return (
    <div className="flex h-[calc(100svh-var(--header-height,3rem))] min-h-0 flex-col bg-workspace">
      <div className="border-b bg-background px-3 py-2">
        <Skeleton className="h-6 w-80" />
      </div>
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <Skeleton className="hidden min-h-0 flex-1 rounded-lg md:block" />
        <Skeleton className="min-h-0 flex-1 rounded-lg" />
        <Skeleton className="hidden w-72 rounded-lg lg:block" />
      </div>
    </div>
  );
}

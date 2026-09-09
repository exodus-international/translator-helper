import { Skeleton } from '@/components/ui/skeleton';

// Instant shell while the editor loads its document, versions and suggestions.
export default function EditorLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
      <div className="w-80 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

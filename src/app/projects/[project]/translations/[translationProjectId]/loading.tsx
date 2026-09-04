import { Skeleton } from '@/components/ui/skeleton';

// Instant shell for the translation-project page while its versions,
// documents and user queries resolve.
export default function TranslationProjectLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>
      <div className="container mx-auto grid gap-6 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-96 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

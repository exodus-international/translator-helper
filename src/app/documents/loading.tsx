import { Skeleton } from '@/components/ui/skeleton';

// Instant shell while the documents overview query resolves. The wrapper
// mirrors page.client.tsx so nothing shifts when the real table arrives.
export default function DocumentsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-28" />
          </div>
          <Skeleton className="mt-4 h-10 w-full max-w-md" />
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <Skeleton className="h-[32rem] w-full" />
      </div>
    </div>
  );
}

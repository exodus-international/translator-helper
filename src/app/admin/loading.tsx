import { Skeleton } from '@/components/ui/skeleton';

// Shared instant shell for every /admin/* page while its queries resolve.
export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        <Skeleton className="h-[32rem] w-full" />
      </div>
    </div>
  );
}

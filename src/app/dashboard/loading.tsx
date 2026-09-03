import { Skeleton } from '@/components/ui/skeleton';

// Instant shell while the dashboard queries resolve. Next.js renders this on
// navigation without waiting for the page's data, so the app feels responsive
// even when the database is slow.
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-8 w-48" />
          <div className="mt-1 flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="mt-4 h-10 w-full max-w-md" />
        </div>
      </div>
      <div className="container mx-auto space-y-8 px-4 py-6">
        <section>
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="mb-4 h-6 w-24" />
          <Skeleton className="h-48 w-full" />
        </section>
      </div>
    </div>
  );
}

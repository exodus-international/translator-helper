import type { ReactNode } from 'react';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

/**
 * The App Router contexts a page component reads, for rendering it outside Next.
 *
 * `useRouter()` throws when no router is mounted, and `usePathname()` and
 * `useSearchParams()` read their own contexts, so a component test wraps the
 * page in this instead of mocking `next/navigation`. Navigation does nothing;
 * `pushed` records where the component tried to go, for a test that cares.
 */
export function createTestRouter(pathname = '/', search = '') {
  const pushed: string[] = [];
  const noop = () => {};

  const router: AppRouterInstance = {
    back: noop,
    forward: noop,
    refresh: noop,
    push: (href) => pushed.push(href),
    replace: (href) => pushed.push(href),
    prefetch: noop,
    bfcacheId: '_b_0_',
  };

  function TestRouter({ children }: { children: ReactNode }) {
    return (
      <AppRouterContext.Provider value={router}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={new URLSearchParams(search)}>{children}</SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    );
  }

  return { TestRouter, pushed };
}

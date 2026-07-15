'use client';

import { useEffect } from 'react';
import { setActiveLanguage, setProjectGroup } from '@/lib/analytics';

/**
 * Associates PostHog events with the given source project for as long as the
 * calling component is mounted (i.e. while the user is in a project or
 * document-editor context). Call from any project-scoped client page.
 *
 * `projectId` may be undefined/null while data is loading — the group is only
 * set once a real id is available.
 */
export function useAnalyticsProjectGroup(
  projectId: string | null | undefined,
  projectName?: string | null,
): void {
  useEffect(() => {
    if (!projectId) return;
    setProjectGroup(projectId, projectName ? { name: projectName } : undefined);
  }, [projectId, projectName]);
}

/**
 * Registers the language the user is currently working in as a PostHog super
 * property while the calling component is mounted, so all events there can be
 * broken down by language. Pass the readable language code (+ optional name).
 */
export function useActiveLanguage(
  code: string | null | undefined,
  name?: string | null,
): void {
  useEffect(() => {
    if (!code) return;
    setActiveLanguage(code, name ?? undefined);
  }, [code, name]);
}

'use client';

import posthog from 'posthog-js';

/**
 * Whether PostHog is configured for this build. We gate on the presence of the
 * (build-time inlined) key rather than posthog's internal `__loaded` flag: that
 * flag can still read falsy in a click handler when init is async, which would
 * silently drop custom events even though pageviews (sent by posthog-js
 * internally) work fine. posthog-js safely buffers events fired before init.
 */
const POSTHOG_ENABLED =
  typeof window !== 'undefined' && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

/**
 * Central catalog of product-analytics event names.
 *
 * Every tracked interaction must use a name from this union so that:
 *  - naming stays consistent (`object_action`, snake_case), and
 *  - typos are caught at compile time.
 *
 * Add new events here first, then call `capture('event_name', { ...props })`.
 */
export type AnalyticsEvent =
  // ── Auth ─────────────────────────────────────────────────────────────
  | 'user_signed_in'
  | 'user_sign_in_failed'
  | 'user_registered'
  | 'user_signed_out'
  // ── Onboarding ───────────────────────────────────────────────────────
  | 'onboarding_completed'
  // ── Profile / account ────────────────────────────────────────────────
  | 'profile_updated'
  | 'password_changed'
  | 'avatar_uploaded'
  | 'avatar_removed'
  // ── Feedback / support ───────────────────────────────────────────────
  | 'support_link_clicked'
  | 'bug_report_clicked'
  // ── Announcements ────────────────────────────────────────────────────
  | 'announcement_shown'
  | 'announcement_dismissed'
  | 'announcement_cta_clicked'
  // ── Documents ────────────────────────────────────────────────────────
  | 'document_upload_started'
  | 'document_upload_rejected'
  | 'document_created'
  | 'document_updated'
  | 'document_deleted'
  | 'document_downloaded'
  | 'document_label_toggled'
  // ── Translation editor ───────────────────────────────────────────────
  | 'translation_saved'
  | 'translation_started'
  | 'translation_deleted'
  | 'ai_translate_triggered'
  | 'source_saved'
  | 'zen_mode_toggled'
  // ── Workflow / status ────────────────────────────────────────────────
  | 'document_status_changed'
  | 'document_deployed'
  | 'github_deploy_retried'
  // ── Audio ────────────────────────────────────────────────────────────
  | 'audio_generation_triggered'
  | 'audio_regeneration_triggered'
  | 'audio_playback_started'
  | 'audio_url_copied'
  | 'audio_generation_failed'
  | 'audio_transcript_saved'
  | 'audio_transcript_reset'
  | 'audio_transcript_kept'
  // ── Suggestions / review threads ─────────────────────────────────────
  | 'suggestion_created'
  | 'suggestion_applied'
  | 'suggestion_dismissed'
  | 'suggestion_reopened'
  | 'suggestion_replied'
  | 'suggestion_edited'
  | 'general_thread_created'
  // ── Assignments / review ─────────────────────────────────────────────
  | 'submitted_for_review'
  | 'translator_assigned'
  | 'translator_unassigned'
  | 'reviewer_assigned'
  | 'reviewer_unassigned'
  | 'document_assigned'
  | 'document_assignment_removed'
  // ── Projects ─────────────────────────────────────────────────────────
  | 'source_project_created'
  | 'source_project_updated'
  | 'source_project_deleted'
  | 'source_project_status_toggled'
  | 'translation_project_created'
  | 'project_settings_saved'
  | 'language_member_added'
  | 'language_member_role_changed'
  | 'language_member_removed'
  // ── Admin ────────────────────────────────────────────────────────────
  | 'user_role_changed'
  | 'user_banned'
  | 'user_unbanned'
  | 'admin_user_password_reset'
  | 'admin_user_languages_updated'
  | 'admin_user_profile_updated'
  | 'invitation_created'
  | 'invitation_link_copied'
  | 'invitation_revoked'
  | 'language_created'
  | 'language_updated'
  | 'language_deleted'
  | 'language_instructions_saved'
  // ── Generic UI ───────────────────────────────────────────────────────
  | 'dialog_opened'
  | 'document_type_filter_changed'
  | 'language_switched';

export type AnalyticsProperties = Record<string, unknown>;

/**
 * Capture a product-analytics event.
 *
 * Safe to call from anywhere in the client tree: it no-ops when PostHog has
 * not been initialized (e.g. local dev without `NEXT_PUBLIC_POSTHOG_KEY`),
 * so it never throws or logs "not initialized" warnings.
 */
export function capture(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  if (!POSTHOG_ENABLED) return;
  posthog.capture(event, properties);
}

/**
 * Associate subsequent events with a source project (PostHog "group
 * analytics"), enabling per-project funnels, retention, and dashboards.
 *
 * Note: the association persists until the next `group()` call or `reset()`,
 * so events fired outside any project context (e.g. the global dashboard)
 * carry whatever project was set last. Project-level insights should be
 * filtered by the `project` group, where this is accurate.
 */
export function setProjectGroup(
  projectId: string,
  properties?: AnalyticsProperties,
): void {
  if (!POSTHOG_ENABLED) return;
  posthog.group('project', projectId, properties);
}

/**
 * Register the language the user is currently working in as a PostHog super
 * property, so it's attached to EVERY subsequent event. This lets any insight
 * (funnel, adoption, retention) be broken down by language — each language is
 * effectively a team with its own way of working.
 *
 * Persists (localStorage) until changed or `reset()` (logout). Pass the
 * human-readable language code (e.g. "es") plus optional name for readable
 * breakdowns.
 */
export function setActiveLanguage(code: string, name?: string): void {
  if (!POSTHOG_ENABLED) return;
  if (!code) return;
  posthog.register({ language: code, ...(name ? { language_name: name } : {}) });
}

/**
 * Report a caught exception to PostHog Error Tracking, tying it to the
 * user's session (and session replay, if enabled). Complements Sentry.
 */
export function captureException(
  error: unknown,
  properties?: AnalyticsProperties,
): void {
  if (!POSTHOG_ENABLED) return;
  posthog.captureException(error, properties);
}

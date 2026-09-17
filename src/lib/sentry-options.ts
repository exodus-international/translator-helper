// Shared Sentry init options for the browser, Node and edge runtimes.
//
// The DSN comes from NEXT_PUBLIC_SENTRY_DSN. Next inlines NEXT_PUBLIC_* vars at
// build time, which is what the browser bundle needs; the server runtimes read
// the same variable so there is one switch for all three. When it is unset the
// SDK initialises in a disabled state and sends nothing, which is the default
// for local development and E2E. Set the variable only in Coolify for staging
// and production.
//
// `environment` tags every event so staging and production are separable in
// the Sentry UI. Without it Sentry labels everything "production".

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
} as const;

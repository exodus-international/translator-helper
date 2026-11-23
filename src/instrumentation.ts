import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');

    // The automatic translation worker lives as long as the server does. Not
    // while `next build` collects pages, and not where it is switched off
    // (AUTO_TRANSLATE_WORKER=off, e.g. a second instance that only serves).
    if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.AUTO_TRANSLATE_WORKER !== 'off') {
      const { startAutoTranslationWorker } = await import('./domain/auto-translation/auto-translation.worker');
      startAutoTranslationWorker();
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;

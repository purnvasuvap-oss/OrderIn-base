import * as Sentry from '@sentry/browser';
import { loggingEnabled } from '@orderin/core';

export function installLogging() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!loggingEnabled(dsn)) return;
  Sentry.init({ dsn, environment: import.meta.env.MODE });
}

export function reportError(error: unknown) {
  if (!loggingEnabled(import.meta.env.VITE_SENTRY_DSN)) return;
  Sentry.captureException(error);
}

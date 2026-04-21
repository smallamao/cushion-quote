import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    // Keep performance tracing light — we only want error reports by default.
    tracesSampleRate: 0.1,
    // Capture unhandled promise rejections and runtime exceptions.
    enabled: true,
  });
}

export { captureRouterTransitionStart } from "@sentry/nextjs";

// Side-effect import so Sentry.init runs before any user interaction.
import "./sentry.client.config";

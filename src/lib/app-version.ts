/**
 * Deployment identity used to detect when a newer build is live.
 *
 * On Vercel VERCEL_GIT_COMMIT_SHA is injected at build AND runtime, so a server
 * render bakes the current sha into the page while the /api/version route reads
 * the sha of whatever deployment is currently serving. A client still running an
 * older build sees its baked sha diverge from the endpoint and prompts a refresh.
 *
 * 'dev' locally (no deploy sha) - the update banner stays hidden.
 *
 * Fallback order: VERCEL_GIT_COMMIT_SHA (Vercel) then 'dev'.
 */
export const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

/**
 * Retry Fetch — Wraps fetch with exponential backoff for critical service-to-service calls.
 * Replaces silent .catch(() => {}) patterns with logged retries.
 *
 * Usage:
 *   retryFetch(url, options, { label: "chat:buyer_notification" })
 *
 * - Retries up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Logs failures with the label for debugging
 * - Still fire-and-forget (returns void Promise) — never blocks the response
 * - Only retries on network errors and 5xx responses (not 4xx)
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface RetryOptions {
  /** Short label for log messages (e.g. "chat:vendor_pickup") */
  label: string;
  /** Max retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 1000, doubles each retry) */
  baseDelay?: number;
}

/**
 * Fire-and-forget fetch with retries. Returns the Response on success, null on final failure.
 * Never throws — safe to call without await or .catch().
 */
export async function retryFetch(
  url: string,
  init: RequestInit,
  opts: RetryOptions
): Promise<Response | null> {
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  const baseDelay = opts.baseDelay ?? BASE_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(10000), // 10s timeout per attempt
      });

      // Success or client error (4xx) — don't retry
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        if (!res.ok) {
          console.warn(`[RetryFetch] ${opts.label} returned ${res.status} (not retrying)`);
        }
        return res;
      }

      // Server error (5xx) — retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[RetryFetch] ${opts.label} returned ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
      } else {
        console.error(
          `[RetryFetch] ${opts.label} failed after ${maxRetries + 1} attempts (last status: ${res.status})`
        );
        return null;
      }
    } catch (err) {
      // Network error or timeout — retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[RetryFetch] ${opts.label} network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${err instanceof Error ? err.message : err}`
        );
        await sleep(delay);
      } else {
        console.error(
          `[RetryFetch] ${opts.label} failed after ${maxRetries + 1} attempts: ${err instanceof Error ? err.message : err}`
        );
        return null;
      }
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import {
    PlanLimitDetail,
    PlanLimitError,
    broadcastPlanLimit,
} from './planLimits';
import { getCsrfToken } from './csrfService';

export const getDefaultHeaders = (): Record<string, string> => {
    return {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: window.location.origin,
    };
};

export const getPostHeaders = (): Record<string, string> => {
    return {
        ...getDefaultHeaders(),
        'Content-Type': 'application/json',
    };
};

export const getPostHeadersWithCsrf = async (): Promise<
    Record<string, string>
> => {
    const token = await getCsrfToken();
    return {
        ...getPostHeaders(),
        'x-csrf-token': token,
    };
};

// Thrown when a mutation was queued for background sync instead of
// reaching the server - see handleApiMutation in public/sw.js. Callers
// that care about the real created/updated resource should catch this
// separately rather than treating the queued placeholder body as the
// resource itself.
export class OfflineQueuedError extends Error {
    constructor(
        message = 'This action was saved offline and will sync automatically.'
    ) {
        super(message);
        this.name = 'OfflineQueuedError';
    }
}

export const isQueuedOfflineResponse = (response: Response): boolean =>
    response.headers.get('X-Tududi-Queued') === '1';

let isRedirecting = false;

export const handleAuthResponse = async (
    response: Response,
    errorMessage: string
): Promise<Response> => {
    if (isQueuedOfflineResponse(response)) {
        throw new OfflineQueuedError();
    }
    if (!response.ok) {
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            throw new RateLimitError(
                retryAfter === null ? null : rateLimitDelayMs(retryAfter, 0)
            );
        }
        if (response.status === 401) {
            if (window.location.pathname !== '/login' && !isRedirecting) {
                isRedirecting = true;
                setTimeout(() => {
                    window.location.href = '/login';
                }, 100);
            }
            throw new Error('Authentication required');
        }
        if (response.status === 402) {
            let detail: PlanLimitDetail = {
                code: 'PLAN_LIMIT_REACHED',
                error: errorMessage,
            };
            try {
                detail = await response.json();
            } catch {
                // keep the generic detail
            }
            // No subscription at all is a different situation from a plan
            // that is too small: there is no in-app action to offer, so the
            // browser goes to the page that sells one.
            if (detail.code === 'SUBSCRIPTION_REQUIRED') {
                if (
                    window.location.pathname !== '/subscription/new' &&
                    !isRedirecting
                ) {
                    isRedirecting = true;
                    setTimeout(() => {
                        window.location.href = '/subscription/new';
                    }, 100);
                }
                throw new PlanLimitError(detail);
            }
            broadcastPlanLimit(detail);
            throw new PlanLimitError(detail);
        }
        let details: string[] | undefined;
        let code: string | undefined;
        try {
            const body = await response.json();
            if (body.details && Array.isArray(body.details)) {
                details = body.details;
            }
            if (body.error) {
                errorMessage = body.error;
            }
            if (typeof body.code === 'string') {
                code = body.code;
            }
        } catch {
            // response body is not JSON, use fallback errorMessage
        }
        const error = new Error(errorMessage);
        (error as any).details = details;
        (error as any).status = response.status;
        (error as any).code = code;
        throw error;
    }
    return response;
};

// A 429 is a rate limit, not a session end: it never signs the user out.
export class RateLimitError extends Error {
    status = 429;
    retryAfterMs: number | null;

    constructor(retryAfterMs: number | null) {
        super('Too many requests');
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

export const isRateLimitError = (error: unknown): error is RateLimitError =>
    error instanceof RateLimitError;

const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_MAX_WAIT_MS = 30_000;

// Retry-After (seconds) when the server sends one, else 1s, 2s, 4s, ...
export const rateLimitDelayMs = (
    retryAfter: string | null,
    retry: number
): number => {
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const base =
        Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000
            : 1000 * 2 ** retry;
    return Math.min(base, RATE_LIMIT_MAX_WAIT_MS);
};

/**
 * Sends the request again after each 429, waiting with backoff. Returns the
 * last response: still a 429 once the retries are spent. `onRetry` runs
 * before each wait with the retry number (1 for the first).
 */
export const fetchRetryingOnRateLimit = async (
    request: () => Promise<Response>,
    onRetry?: (retry: number) => void,
    wait: (ms: number) => Promise<void> = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms))
): Promise<Response> => {
    let response = await request();
    for (
        let retry = 0;
        response.status === 429 && retry < RATE_LIMIT_RETRIES;
        retry++
    ) {
        onRetry?.(retry + 1);
        await wait(
            rateLimitDelayMs(response.headers.get('Retry-After'), retry)
        );
        response = await request();
    }
    return response;
};

export const isAuthError = (error: any): boolean => {
    return error?.message && error.message.includes('Authentication required');
};

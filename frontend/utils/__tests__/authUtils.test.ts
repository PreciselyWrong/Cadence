import {
    fetchRetryingOnRateLimit,
    handleAuthResponse,
    isAuthError,
    isQueuedOfflineResponse,
    isRateLimitError,
    OfflineQueuedError,
    rateLimitDelayMs,
} from '../authUtils';

// jsdom has no Response constructor, so stub the parts callers use
const makeResponse = (
    status: number,
    body: unknown,
    headers: Record<string, string> = {}
) =>
    ({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (key: string) => headers[key] ?? null },
        json: async () => body,
    }) as unknown as Response;

describe('isQueuedOfflineResponse', () => {
    it('is true only when the service worker set the queued marker header', () => {
        expect(
            isQueuedOfflineResponse(
                makeResponse(
                    202,
                    { queued: true },
                    {
                        'X-Tududi-Queued': '1',
                    }
                )
            )
        ).toBe(true);
        expect(isQueuedOfflineResponse(makeResponse(200, { id: 1 }))).toBe(
            false
        );
    });
});

describe('handleAuthResponse', () => {
    // #1417: a mutation queued for background sync (see handleApiMutation
    // in public/sw.js) must not be treated as if the placeholder { queued:
    // true } body were the real created/updated resource.
    it('throws OfflineQueuedError for a service-worker-queued response', async () => {
        const response = makeResponse(
            202,
            { queued: true, offline: true },
            { 'X-Tududi-Queued': '1' }
        );

        await expect(
            handleAuthResponse(response, 'Failed to create task.')
        ).rejects.toBeInstanceOf(OfflineQueuedError);
    });

    it('passes a normal successful response through unchanged', async () => {
        const response = makeResponse(200, { id: 1 });

        await expect(
            handleAuthResponse(response, 'Failed to create task.')
        ).resolves.toBe(response);
    });

    it('still throws the auth error for a 401', async () => {
        jest.useFakeTimers();
        try {
            const response = makeResponse(401, { error: 'Unauthorized' });

            await expect(
                handleAuthResponse(response, 'Failed to fetch tasks.')
            ).rejects.toThrow('Authentication required');
        } finally {
            jest.useRealTimers();
        }
    });

    it('surfaces the backend error message for other failures', async () => {
        const response = makeResponse(404, { error: 'Task not found.' });

        await expect(
            handleAuthResponse(response, 'Failed to fetch task.')
        ).rejects.toThrow('Task not found.');
    });
});

describe('rate limiting (429)', () => {
    it('is a RateLimitError that does not redirect to login', async () => {
        const originalHref = window.location.href;
        const error = await handleAuthResponse(
            makeResponse(429, {}, { 'Retry-After': '3' }),
            'Failed'
        ).catch((e: unknown) => e);
        expect(isRateLimitError(error)).toBe(true);
        expect(error).toMatchObject({ status: 429, retryAfterMs: 3000 });
        expect(isAuthError(error)).toBe(false);
        expect(window.location.href).toBe(originalHref);
    });

    it('retries with backoff until the request succeeds', async () => {
        const waits: number[] = [];
        const retries: number[] = [];
        const responses = [
            makeResponse(429, {}),
            makeResponse(429, {}, { 'Retry-After': '2' }),
            makeResponse(200, { ok: true }),
        ];
        const request = jest.fn(async () => responses.shift() as Response);

        const result = await fetchRetryingOnRateLimit(
            request,
            (retry) => retries.push(retry),
            async (ms) => {
                waits.push(ms);
            }
        );

        expect(result.status).toBe(200);
        expect(request).toHaveBeenCalledTimes(3);
        expect(waits).toEqual([1000, 2000]);
        expect(retries).toEqual([1, 2]);
    });

    it('gives up after the retries and returns the 429 without throwing', async () => {
        const request = jest.fn(async () => makeResponse(429, {}));
        const result = await fetchRetryingOnRateLimit(
            request,
            undefined,
            async () => undefined
        );
        expect(result.status).toBe(429);
        expect(request).toHaveBeenCalledTimes(5);
    });

    it('caps a long Retry-After', () => {
        expect(rateLimitDelayMs('86400', 0)).toBe(30_000);
        expect(rateLimitDelayMs(null, 3)).toBe(8000);
    });
});

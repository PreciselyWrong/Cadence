import { Page, expect, Locator } from '@playwright/test';

/**
 * Shared test helper utilities for e2e tests
 * These helpers maintain test autonomy while reducing code duplication
 */

/**
 * Login to the application
 * Each test remains autonomous - this is just a shared login flow
 */
export async function login(
    page: Page,
    baseURL: string | undefined
): Promise<string> {
    const appUrl = baseURL ?? process.env.APP_URL ?? 'http://localhost:8080';

    await page.goto(appUrl + '/login');

    const email = process.env.E2E_EMAIL || 'test@tududi.com';
    const password = process.env.E2E_PASSWORD || 'password123';

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    // Under parallel load the password check can take longer than the
    // default expect timeout, so wait for the login call itself first.
    const [response] = await Promise.all([
        page.waitForResponse(
            (r) =>
                r.url().endsWith('/api/login') &&
                r.request().method() === 'POST',
            { timeout: 30_000 }
        ),
        page.getByRole('button', { name: /login/i }).click(),
    ]);
    expect(response.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/today$/);

    return appUrl;
}

/**
 * Signs the page in as a fresh user of its own, for tests whose data (such
 * as today's plan) would clash with other tests or with copies of the same
 * test running in parallel. The shared e2e user creates it through the
 * admin API; onboarding is finished so the login lands on /today.
 */
export async function loginAsNewUser(
    page: Page,
    baseURL: string | undefined
): Promise<string> {
    const appUrl = await login(page, baseURL);
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@tududi.test`;
    const password = 'password123';

    const created = await page.request.post(`${appUrl}/api/admin/users`, {
        data: { email, password, name: 'E2E' },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    await page.request.post(`${appUrl}/api/logout`);
    await page.context().clearCookies();

    const signedIn = await page.request.post(`${appUrl}/api/login`, {
        data: { email, password },
    });
    expect(signedIn.ok(), await signedIn.text()).toBeTruthy();
    const starter = await page.request.post(
        `${appUrl}/api/onboarding/starter`,
        {
            data: { key: 'empty' },
        }
    );
    expect(starter.ok(), await starter.text()).toBeTruthy();

    await page.goto(`${appUrl}/today`);
    await expect(page).toHaveURL(/\/today$/);
    return appUrl;
}

/**
 * Wait for an element to be visible with better error messages
 */
export async function waitForElement(
    locator: Locator,
    options: {
        timeout?: number;
        state?: 'visible' | 'hidden' | 'attached' | 'detached';
    } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;
    const state = options.state ?? 'visible';

    await locator.waitFor({ state, timeout });
}

/**
 * Wait for API response matching a URL pattern
 */
export async function waitForApiResponse(
    page: Page,
    urlPattern: string | RegExp,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;

    await page.waitForResponse(
        (response) => {
            const url = response.url();
            if (typeof urlPattern === 'string') {
                return url.includes(urlPattern);
            }
            return urlPattern.test(url);
        },
        { timeout }
    );
}

/**
 * Wait for network to be idle after an action
 */
export async function waitForNetworkIdle(
    page: Page,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;
    await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Create a unique entity name for testing
 * Uses timestamp to ensure uniqueness across parallel test runs
 */
export function createUniqueEntity(baseName: string): string {
    return `${baseName} ${Date.now()}`;
}

/**
 * Hover and wait for element to be visible with transition
 * Useful for dropdown menus that appear on hover
 */
export async function hoverAndWaitForVisible(
    containerLocator: Locator,
    targetLocator: Locator,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;

    await containerLocator.hover();
    await targetLocator.waitFor({ state: 'visible', timeout });
}

/**
 * Click a button and wait for a modal to appear
 */
export async function clickAndWaitForModal(
    buttonLocator: Locator,
    modalLocator: Locator,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;

    await buttonLocator.click();
    await modalLocator.waitFor({ state: 'visible', timeout });
}

/**
 * Fill input and wait for value to be set
 * Retries if needed to handle flaky inputs
 */
export async function fillInputReliably(
    inputLocator: Locator,
    value: string,
    options: { maxRetries?: number; clearFirst?: boolean } = {}
): Promise<void> {
    const maxRetries = options.maxRetries ?? 3;
    const clearFirst = options.clearFirst ?? true;

    for (let i = 0; i < maxRetries; i++) {
        try {
            if (clearFirst) {
                await inputLocator.clear();
            }
            await inputLocator.fill(value);
            await expect(inputLocator).toHaveValue(value, { timeout: 2000 });
            return; // Success
        } catch (error) {
            if (i === maxRetries - 1) {
                throw new Error(
                    `Failed to fill input with value "${value}" after ${maxRetries} attempts`
                );
            }
            // Retry with more aggressive approach
            await inputLocator.click();
            await inputLocator.selectText();
            await inputLocator.press('Delete');
        }
    }
}

/**
 * Wait for a confirmation dialog and confirm it
 */
export async function confirmDialog(
    page: Page,
    dialogTitle: string | RegExp,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 10000;

    const dialogLocator =
        typeof dialogTitle === 'string'
            ? page.locator(`text=${dialogTitle}`)
            : page.locator(`text=${dialogTitle.source}`);

    await dialogLocator.waitFor({ state: 'visible', timeout });
    await page.locator('[data-testid="confirm-dialog-confirm"]').click();
    await dialogLocator.waitFor({ state: 'hidden', timeout });
}

/**
 * Navigate to a specific page and wait for it to load
 */
export async function navigateAndWait(
    page: Page,
    url: string,
    options: { waitForSelector?: string; timeout?: number } = {}
): Promise<void> {
    await page.goto(url);

    if (options.waitForSelector) {
        await page.locator(options.waitForSelector).waitFor({
            state: 'visible',
            timeout: options.timeout ?? 10000,
        });
    }

    await waitForNetworkIdle(page, { timeout: options.timeout });
}

import { request, FullConfig } from '@playwright/test';

/**
 * Finishes the first-visit welcome page for the e2e user through the real
 * API, so tests that log in land on /today instead of /welcome.
 * See docs/24-onboarding.md.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL =
        config.projects[0]?.use?.baseURL ??
        process.env.APP_URL ??
        'http://localhost:8080';
    const email = process.env.E2E_EMAIL || 'test@tududi.com';
    const password = process.env.E2E_PASSWORD || 'password123';

    const api = await request.newContext({ baseURL });
    try {
        const login = await api.post('/api/login', {
            data: { email, password },
        });
        if (!login.ok()) {
            throw new Error(
                `e2e setup: login failed (${login.status()}): ${await login.text()}`
            );
        }
        const starter = await api.post('/api/onboarding/starter', {
            data: { key: 'empty' },
        });
        if (!starter.ok()) {
            throw new Error(
                `e2e setup: completing onboarding failed (${starter.status()}): ${await starter.text()}`
            );
        }
    } finally {
        await api.dispose();
    }
}

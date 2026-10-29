import { test, expect } from '@playwright/test';
import { loginAsNewUser } from '../helpers/testHelpers';

test.describe('Plan my day', () => {
    test('plans a task on Today, the day starts itself and the task is marked done', async ({
        page,
        context,
        baseURL,
    }) => {
        // A long flow (plan, finish) that shares the backend with the
        // other workers: give it the slow-test budget.
        test.slow();
        const appUrl = await loginAsNewUser(page, baseURL);
        const name = `Plan me ${Date.now()}`;

        // A user of its own, so its day plan is not shared with other
        // tests or with parallel copies of this one.

        const today = await page.evaluate(() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        });
        const created = await context.request.post(`${appUrl}/api/task`, {
            data: { name, due_date: today, estimated_minutes: 60 },
        });
        expect(created.ok()).toBeTruthy();
        const task = await created.json();

        // Planning happens on Today itself: no separate planner page.
        await page.goto(`${appUrl}/today`);
        const card = page.getByTestId(`candidate-${task.uid}`);
        await expect(card).toBeVisible({ timeout: 10000 });

        await page.getByTestId(`add-${task.uid}`).click();

        // It takes the next free slot, with the task's 1h estimate. Planned
        // tasks leave the list; they live on the timeline now.
        await expect(card).toHaveCount(0);
        await expect(page.getByTestId('capacity')).toContainText('1h planned');

        // Placing the first task starts the day by itself; the plan is saved
        // first, and under parallel load that can take longer than the
        // default expect timeout.
        await expect(page.getByTestId('now-card')).toContainText(name, {
            timeout: 30_000,
        });
        await expect(page.getByTestId('day-timeline')).toBeVisible();

        await page.getByTestId('now-card-done').click();
        await expect(
            page.getByText('Everything you planned is done')
        ).toBeVisible();

        await context.request.delete(`${appUrl}/api/daily-plan/today`);
    });
});

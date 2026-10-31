import { test, expect, Page } from '@playwright/test';
import { loginAsNewUser } from '../helpers/testHelpers';

const localDay = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Opens the Decide menu of the row with this title and picks a choice.
async function decide(page: Page, title: string, choice: string) {
    const row = page.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: 'Decide' }).click();
    await page.getByRole('menuitem', { name: choice, exact: true }).click();
}

test.describe('Review', () => {
    test('resumes where it stopped after four decisions', async ({
        page,
        context,
        baseURL,
    }) => {
        test.slow();
        const appUrl = await loginAsNewUser(page, baseURL);
        const stamp = Date.now();
        const titles = Array.from(
            { length: 6 },
            (_, i) => `Idea ${stamp}-${i + 1}`
        );
        for (const content of titles) {
            const created = await context.request.post(`${appUrl}/api/inbox`, {
                data: { content },
            });
            expect(created.ok(), await created.text()).toBeTruthy();
        }

        await page.goto(`${appUrl}/review`);
        await expect(page.getByText('6 to look at')).toBeVisible();

        // Two parked for later, two discarded: four decisions in a row.
        await decide(page, titles[0], 'Park for later');
        await expect(page.getByText(titles[0])).toHaveCount(0);
        await decide(page, titles[1], 'Park for later');
        await expect(page.getByText(titles[1])).toHaveCount(0);
        await decide(page, titles[2], 'Discard');
        await expect(page.getByText(titles[2])).toHaveCount(0);
        await decide(page, titles[3], 'Discard');
        await expect(page.getByText(titles[3])).toHaveCount(0);

        // Leave and come back: the same two are still waiting, and what
        // was decided stayed decided.
        await page.goto(`${appUrl}/today`);
        await page.goto(`${appUrl}/review`);
        await expect(page.getByText('2 to look at')).toBeVisible();
        await expect(page.getByText(titles[4])).toBeVisible();
        await expect(page.getByText(titles[5])).toBeVisible();
        await expect(page.getByText(titles[0])).toHaveCount(0);

        const later = await context.request.get(`${appUrl}/api/review/later`);
        const body = await later.json();
        expect(body.items.map((i) => i.task.name).sort()).toEqual(
            [titles[0], titles[1]].sort()
        );
    });

    test('parks a task, sets its review date, then brings it back', async ({
        page,
        context,
        baseURL,
    }) => {
        test.slow();
        const appUrl = await loginAsNewUser(page, baseURL);
        const name = `Parked idea ${Date.now()}`;
        const created = await context.request.post(`${appUrl}/api/task`, {
            data: { name },
        });
        expect(created.ok()).toBeTruthy();
        const task = await created.json();
        const parked = await context.request.patch(
            `${appUrl}/api/task/${task.uid}`,
            { data: { later: true } }
        );
        expect(parked.ok()).toBeTruthy();

        await page.goto(`${appUrl}/review`);
        await page.getByRole('tab', { name: /^Later/ }).click();
        await expect(page.getByText(name)).toBeVisible();

        // A review date in the future: it stays parked and shows the date.
        const future = localDay(30);
        await decide(page, name, 'Review on…');
        await page.locator('input[type="date"]').fill(future);
        await expect(page.getByText(name)).toHaveCount(0);

        const withDate = await (
            await context.request.get(`${appUrl}/api/task/${task.uid}`)
        ).json();
        expect(withDate.review_on).toBe(future);
        expect(withDate.tags.map((t) => t.name)).toContain('someday');

        // The date arrives: the task comes up as due for review.
        await page.reload();
        await page.getByRole('tab', { name: /^Later/ }).click();
        await expect(page.getByText(name)).toBeVisible();
        await decide(page, name, 'Review on…');
        await page.locator('input[type="date"]').fill(localDay(0));
        await page.reload();
        await page.getByRole('tab', { name: /^Later/ }).click();
        await expect(
            page.getByRole('listitem').filter({ hasText: name })
        ).toContainText('review due');
        await expect(page.getByText('1 to look at')).toBeVisible();

        // Brought back: no longer parked, decided for this week.
        await decide(page, name, 'This week');
        await expect(page.getByText(name)).toHaveCount(0);
        await expect(page.getByText('Nothing parked.')).toBeVisible();

        const back = await (
            await context.request.get(`${appUrl}/api/task/${task.uid}`)
        ).json();
        expect(back.tags.map((t) => t.name)).not.toContain('someday');
        expect(back.week_of).toBeTruthy();
        expect(back.review_on).toBeNull();
    });
});

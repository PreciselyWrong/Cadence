#!/usr/bin/env node
// README screenshots of the web app, taken from the demo account made by
// `npm run db:seed:screenshots` (docs/fork/SCREENSHOTS.md).
// Usage: node scripts/screenshots/web.js [--wiki] [only-name ...]
// `--wiki` takes the wiki set (WIKI_SHOTS) into wiki/images/ instead.
// Env: APP_URL (default http://localhost:4180), OUT (default screenshots/web,
// or wiki/images with --wiki).
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const APP_URL = process.env.APP_URL || 'http://localhost:4180';
const args = process.argv.slice(2);
const WIKI = args.includes('--wiki');
const OUT = path.resolve(
    process.env.OUT ||
        path.join(__dirname, '../..', WIKI ? 'wiki/images' : 'screenshots/web')
);
const EMAIL = process.env.DEMO_EMAIL || 'demo@cadence.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'demodemo';

// The demo day is frozen in the morning so the calendars show the working day.
const frozenNow = () => {
    const now = new Date();
    now.setHours(10, 20, 0, 0);
    return now;
};

const clickText = async (page, text) => {
    await page.getByText(text, { exact: true }).first().click();
    await page.waitForTimeout(1200);
};

const byName = (list, name) => {
    const found = list.find((item) => item.name === name);
    if (!found) throw new Error(`Demo data has no "${name}"`);
    return found;
};

// Each shot: a page, the browser storage it needs, and what to do before
// the picture. `ids` holds uids read from the API after sign-in.
const SHOTS = [
    { name: 'today', url: () => '/today' },
    { name: 'today-dark', url: () => '/today', dark: true },
    { name: 'plan', url: () => '/upcoming' },
    {
        name: 'project',
        url: (ids) => `/project/${ids.launch}`,
        before: (page) => clickText(page, 'Chronologie'),
    },
    {
        name: 'calendar',
        url: () => '/calendar',
        before: (page) => clickText(page, 'Semaine'),
    },
    { name: 'habits', url: (ids) => `/habit/${ids.habit}` },
    { name: 'notes', url: (ids) => `/notes/${ids.note}` },
    { name: 'triage', url: () => '/triage' },
    { name: 'mail-deck', url: () => '/triage?deck=mail' },
    { name: 'review', url: () => '/review' },
    { name: 'goals', url: () => '/goals' },
];

const pause = (page, ms = 800) => page.waitForTimeout(ms);

// Opens the capture sheet and types a sample entry, left unsent.
const quickAdd = async (page) => {
    await page.getByText('Capturer', { exact: true }).first().click();
    await pause(page);
    await page.keyboard.type('Appeler le plombier pour la date d’intervention');
    await pause(page, 500);
};

// The inbox is the first column of Plan: the picture is that column and the
// day beside it, where its items are dropped.
const inboxColumn = async (page) => {
    const box = await page
        .getByText('Boîte de réception', { exact: true })
        .first()
        .boundingBox();
    if (!box) throw new Error('No inbox column on Plan');
    return { x: Math.max(box.x - 28, 0), y: 135, width: 560, height: 765 };
};

// The TODO.md picker lists its files in an open list for the picture: a
// closed menu is not drawn by the browser screenshot.
const todoMdPicker = async (page) => {
    const picker = page.getByTestId('todo-md-file');
    await picker.waitFor();
    await picker.evaluate((select) => {
        select.size = select.options.length;
        select.style.height = 'auto';
    });
    await picker.scrollIntoViewIfNeeded();
    await pause(page, 500);
};

const scrollToTestId = async (page, testId) => {
    const target = page.getByTestId(testId);
    await target.waitFor();
    await target.scrollIntoViewIfNeeded();
    await pause(page, 600);
};

// The wiki set: each shot is a page a wiki article shows.
const WIKI_SHOTS = [
    { name: 'inbox', url: () => '/upcoming', wait: 5000, clip: inboxColumn },
    { name: 'quick-add', url: () => '/today', before: quickAdd },
    {
        name: 'task-detail',
        url: (ids) => `/task/${ids.richTask}`,
        wait: 3000,
    },
    {
        name: 'project-board',
        url: (ids) => `/project/${ids.refonte}`,
        before: (page) => clickText(page, 'Tableau'),
    },
    {
        name: 'project-timeline',
        url: (ids) => `/project/${ids.launch}`,
        before: (page) => clickText(page, 'Chronologie'),
    },
    {
        name: 'project-pages',
        url: (ids) => `/project/${ids.refonte}`,
        before: async (page) => {
            // The tab last used is kept for the project: back to the tasks.
            await page
                .getByText(/^Tâches\s*\d+$/)
                .first()
                .click();
            await pause(page, 1200);
            await scrollToTestId(page, 'project-pages');
        },
    },
    {
        name: 'todo-md-link',
        url: (ids) => `/project/${ids.bretagne}`,
        before: todoMdPicker,
    },
    { name: 'tags', url: () => '/tags' },
    { name: 'views', url: () => '/views' },
    {
        name: 'palette',
        url: () => '/today',
        before: async (page) => {
            await page.keyboard.press('Control+k');
            await pause(page);
        },
    },
    { name: 'weekend', url: () => '/upcoming?weekend=1' },
    { name: 'decisions', url: () => '/triage?deck=decisions' },
    { name: 'career', url: () => '/career' },
    { name: 'summary', url: () => '/insights/summary' },
    { name: 'settings-ai', url: () => '/profile?section=ai-assistant' },
    {
        name: 'settings-notifications',
        url: () => '/profile?section=notifications',
    },
    { name: 'people', url: () => '/people' },
];

async function main() {
    const only = args.filter((arg) => !arg.startsWith('--'));
    const set = WIKI ? WIKI_SHOTS : SHOTS;
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    try {
        for (const dark of [false, true]) {
            const shots = set.filter(
                (s) =>
                    Boolean(s.dark) === dark &&
                    (only.length === 0 || only.includes(s.name))
            );
            if (shots.length === 0) continue;
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
                deviceScaleFactor: 2,
                locale: 'fr-FR',
                timezoneId: 'Europe/Paris',
                colorScheme: dark ? 'dark' : 'light',
            });
            const login = await context.request.post(`${APP_URL}/api/login`, {
                data: { email: EMAIL, password: PASSWORD },
            });
            if (!login.ok()) {
                throw new Error(`Sign-in failed: ${login.status()}`);
            }
            const ids = await readIds(context);
            const page = await context.newPage();
            await page.clock.setFixedTime(frozenNow());
            for (const shot of shots) {
                const storage = {
                    isDarkMode: String(dark),
                    ...(shot.storage || {}),
                };
                await page.addInitScript((entries) => {
                    for (const [key, value] of Object.entries(entries)) {
                        localStorage.setItem(key, value);
                    }
                }, storage);
                await page.goto(`${APP_URL}${shot.url(ids)}`, {
                    waitUntil: 'networkidle',
                });
                await page.waitForTimeout(shot.wait || (WIKI ? 3000 : 1200));
                if (shot.before) await shot.before(page);
                const file = path.join(OUT, `${shot.name}.png`);
                const clip = shot.clip ? await shot.clip(page) : undefined;
                await page.screenshot({ path: file, clip });
                console.log(`saved ${path.relative(process.cwd(), file)}`);
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
}

async function readIds(context) {
    const get = async (url) => {
        const response = await context.request.get(`${APP_URL}${url}`);
        if (!response.ok()) throw new Error(`${url}: ${response.status()}`);
        return response.json();
    };
    const projects = await get('/api/projects');
    const notes = await get('/api/notes');
    const habits = await get('/api/cadence/habits');
    const tasks = await get('/api/tasks?type=all');
    const projectList = projects.projects || projects;
    const noteList = notes.notes || notes;
    const habitList = habits.habits || habits;
    const taskList = tasks.tasks || tasks;
    return {
        refonte: byName(projectList, 'Refonte du site client').uid,
        bretagne: byName(projectList, 'Vacances en Bretagne').uid,
        richTask: byName(taskList, 'Préparer la présentation client du mardi')
            .uid,
        launch: byName(projectList, "Lancement de l'app v2").uid,
        note: byName(
            noteList.map((n) => ({ ...n, name: n.title })),
            'Architecture du site client'
        ).uid,
        habit: (habitList.find((h) => /Courir/.test(h.name)) || habitList[0])
            .uid,
    };
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

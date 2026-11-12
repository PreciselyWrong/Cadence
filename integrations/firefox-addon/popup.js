/* global CadenceCore, browser */
'use strict';

const $ = (id) => document.getElementById(id);
const message = (key, ...subs) => browser.i18n.getMessage(key, subs);

function say(key) {
    $('message').textContent = message(key);
    $('message').hidden = false;
}

$('options').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
});

// The page becomes a task: name proposed by the server (« Essayer : … »,
// « Lire : … »), editable; « Déjà dans … » when it is already somewhere.
async function start() {
    const settings = await browser.storage.local.get(['server', 'token']);
    if (!settings.server || !settings.token) {
        say('result_not_set');
        return;
    }
    const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (!CadenceCore.isSavable(tab?.url)) {
        say('result_not_a_page');
        return;
    }
    const page = { url: tab.url, title: tab.title ?? '' };
    $('name').value = page.title;
    $('url').textContent = tab.url;
    $('form').hidden = false;
    $('name').focus();

    let edited = false;
    $('name').addEventListener('input', () => {
        edited = true;
    });
    CadenceCore.lookup(fetch, settings, page).then((found) => {
        if (!found) return;
        if (!edited && found.task_name) $('name').value = found.task_name;
        const place = CadenceCore.firstPlace(found);
        if (!place) return;
        $('already-text').textContent =
            message('already_in', place.name) +
            (place.more > 0 ? ` +${place.more}` : '');
        $('already-open').href = `${settings.server}${place.path}`;
        $('already').hidden = false;
        $('save').textContent = message('action_add_anyway');
    });

    $('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        $('save').disabled = true;
        const result = await CadenceCore.addTask(fetch, settings, {
            ...page,
            name: $('name').value,
        });
        say(`result_${result}`);
        if (result === 'saved') {
            $('form').hidden = true;
        } else {
            $('save').disabled = false;
        }
    });
}

// « Envoyer au projet » (this tab or its whole group) and « Ouvrir le
// projet » (its pages in a tab group named like the project).
async function projects(settings, tab) {
    const request = CadenceCore.projectsRequest(settings);
    let list = [];
    try {
        const response = await fetch(request.url, request.options);
        if (response.status === 200) {
            list = CadenceCore.openProjects(await response.json());
        }
    } catch {
        return;
    }
    if (list.length === 0) return;
    for (const project of list) {
        const option = document.createElement('option');
        option.value = project.uid;
        option.textContent = project.name;
        $('project').append(option);
    }
    $('projects').hidden = false;
    const grouped = typeof tab.groupId === 'number' && tab.groupId >= 0;
    $('send-group').hidden = !grouped || !browser.tabs.group;

    const send = async (tabs) => {
        const request = CadenceCore.sendPagesRequest(settings, $('project').value, tabs);
        try {
            const response = await fetch(request.url, request.options);
            const body = await response.json().catch(() => null);
            if (response.status !== 200) return say(`result_${CadenceCore.outcome(response.status)}`);
            $('message').textContent = message('result_pages', String(body.created), String(body.existing));
            $('message').hidden = false;
        } catch {
            say('result_unreachable');
        }
    };
    $('send-tab').addEventListener('click', () => send([tab]));
    $('send-group').addEventListener('click', async () =>
        send(await browser.tabs.query({ groupId: tab.groupId }))
    );
    $('open-project').addEventListener('click', async () => {
        const request = CadenceCore.pagesRequest(settings, $('project').value);
        let urls = [];
        try {
            const response = await fetch(request.url, request.options);
            urls = response.status === 200 ? CadenceCore.pageUrls(await response.json()) : [];
        } catch {
            return say('result_unreachable');
        }
        if (urls.length === 0) return say('result_no_pages');
        const opened = [];
        for (const url of urls) opened.push((await browser.tabs.create({ url, active: false })).id);
        if (browser.tabs.group) {
            const groupId = await browser.tabs.group({ tabIds: opened });
            await browser.tabGroups.update(groupId, {
                title: $('project').selectedOptions[0].textContent,
            });
        }
        window.close();
    });
}

start().then(async () => {
    const settings = await browser.storage.local.get(['server', 'token']);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (settings.server && settings.token && tab) await projects(settings, tab);
});

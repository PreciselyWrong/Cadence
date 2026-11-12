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

start();

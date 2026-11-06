/* global CadenceCore, browser */
'use strict';

const $ = (id) => document.getElementById(id);

function say(key) {
    $('message').textContent = browser.i18n.getMessage(key);
    $('message').hidden = false;
}

$('options').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
});

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
    $('title').value = tab.title ?? '';
    $('url').textContent = tab.url;
    $('form').hidden = false;
    $('title').focus();

    $('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        $('save').disabled = true;
        const result = await CadenceCore.save(fetch, settings, {
            url: tab.url,
            title: $('title').value,
            note: $('note').value,
            status: $('status').value,
            tags: $('tags').value,
        });
        say(`result_${result}`);
        if (result === 'saved' || result === 'already') {
            $('form').hidden = true;
        } else {
            $('save').disabled = false;
        }
    });
}

start();

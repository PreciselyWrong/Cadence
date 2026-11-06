/* global CadenceCore, browser */
'use strict';

const $ = (id) => document.getElementById(id);

function say(key) {
    $('message').textContent = browser.i18n.getMessage(key);
    $('message').hidden = false;
}

browser.storage.local.get(['server', 'token']).then((settings) => {
    $('server').value = settings.server ?? '';
    $('token').value = settings.token ?? '';
});

// Asked for here, on the user's click: the add-on reads no other site, and the
// request needs to come from this gesture.
$('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const server = CadenceCore.normalizeServer($('server').value);
    const token = $('token').value.trim();
    if (!server || !token) {
        say('options_invalid');
        return;
    }
    const granted = await browser.permissions
        .request({ origins: [CadenceCore.originPattern(server)] })
        .catch(() => false);
    if (!granted) {
        say('options_denied');
        return;
    }
    await browser.storage.local.set({ server, token });
    say('options_saved');
});

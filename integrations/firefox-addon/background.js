/* global CadenceCore, browser */
'use strict';

const MENU_PAGE = 'cadence-save-page';
const MENU_LINK = 'cadence-save-link';

browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
        id: MENU_PAGE,
        title: browser.i18n.getMessage('save_page'),
        contexts: ['page'],
    });
    browser.contextMenus.create({
        id: MENU_LINK,
        title: browser.i18n.getMessage('save_link'),
        contexts: ['link'],
    });
});

async function showResult(tabId, result) {
    const good = result === 'saved';
    await browser.action.setBadgeBackgroundColor({
        color: good ? '#2e7d32' : '#c62828',
        tabId,
    });
    await browser.action.setBadgeText({ text: good ? '✓' : '!', tabId });
    await browser.action.setTitle({
        title: browser.i18n.getMessage(`result_${result}`),
        tabId,
    });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const isLink = info.menuItemId === MENU_LINK;
    const url = isLink ? info.linkUrl : tab?.url;
    if (!CadenceCore.isSavable(url)) return;
    const settings = await browser.storage.local.get(['server', 'token']);
    if (!settings.server || !settings.token) {
        await browser.runtime.openOptionsPage();
        return;
    }
    // One click: the server names the task from the kind of page.
    const result = await CadenceCore.addTask(fetch, settings, {
        url,
        title: isLink ? info.linkText : tab?.title,
    });
    await showResult(tab?.id, result);
});

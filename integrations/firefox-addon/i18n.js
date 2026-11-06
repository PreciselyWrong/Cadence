/* global browser */
'use strict';

document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = browser.i18n.getMessage(element.dataset.i18n);
});

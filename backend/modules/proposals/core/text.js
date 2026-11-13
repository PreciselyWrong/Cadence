'use strict';

// Text an agent wrote or a task name: plain, single line when asked, capped.
// Control characters and invisible reordering marks are dropped, as for mail
// cards (docs/43-mail-triage.md).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const INVISIBLE = /[؜​-‏‪-‮⁠-⁩﻿]/g;

function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    const text = value
        .replace(CONTROL, '')
        .replace(INVISIBLE, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, max);
}

module.exports = { cleanText };

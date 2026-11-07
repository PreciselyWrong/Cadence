'use strict';

// Whether a link's page can be summarized, and the summary made safe. Code
// decides: an unread, empty, error or sign-in page gets no summary.

const SUMMARY_PREFIX = 'Résumé auto : ';
const MIN_TEXT = 40;

const LOGIN_OR_ERROR =
    /\b(log ?in|sign ?in|sign ?up|connexion|se connecter|identifiez-vous|anmelden|access denied|forbidden|unauthori[sz]ed|not found|page introuvable|error|erreur|captcha|just a moment)\b|\b(40[134]|50[0-3])\b/i;
const LOGIN_PATH = /\/(login|signin|sign-in|auth|oauth|sso|session)(\/|$|\?)/i;

function pageText(link) {
    return [link.description, link.readme_excerpt]
        .filter((part) => typeof part === 'string' && part.trim())
        .join('\n')
        .trim();
}

function isSummarizable(link) {
    if (link.fetch_status !== 'done') return false;
    if (pageText(link).length < MIN_TEXT) return false;
    if (LOGIN_OR_ERROR.test(link.title || '')) return false;
    try {
        if (LOGIN_PATH.test(new URL(link.url).pathname)) return false;
    } catch {
        return false;
    }
    return true;
}

// The model's summary, trimmed to whole sentences within `max`; null when
// nothing usable is left.
function cleanSummary(raw, max) {
    if (typeof raw !== 'string') return null;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    if (text.length <= max) return text;
    const head = text.slice(0, max);
    const end = Math.max(
        head.lastIndexOf('. '),
        head.lastIndexOf('! '),
        head.lastIndexOf('? ')
    );
    return end > 0 ? head.slice(0, end + 1) : null;
}

module.exports = { SUMMARY_PREFIX, isSummarizable, cleanSummary, pageText };

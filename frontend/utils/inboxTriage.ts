// Deterministic suggestion for what an inbox item should become. No AI: it
// reads the #tag and +project tokens, a bare link, and a few keywords.
import { normalizeText } from './commandPalette';
import { splitInboxTokens } from './inboxTokens';

export type TriageKind = 'task' | 'note' | 'project';
export type TriageReason =
    'project' | 'tag' | 'url' | 'keyword' | 'long' | 'default';

export interface TriageSuggestion {
    kind: TriageKind;
    reason: TriageReason;
    // The tag, project or keyword that triggered the suggestion
    detail?: string;
}

const NOTE_TAGS = [
    'idea',
    'ideas',
    'idee',
    'note',
    'notes',
    'lire',
    'read',
    'reading',
    'recette',
    'recipe',
    'bookmark',
    'lien',
    'link',
    'ref',
    'citation',
];
const PROJECT_TAGS = ['projet', 'project'];

const NOTE_WORDS = [
    'idee',
    'idea',
    'lire',
    'read',
    'article',
    'citation',
    'recette',
    'recipe',
    'bookmark',
    'note',
];
const PROJECT_WORDS = ['projet', 'project'];
const TASK_WORDS = [
    'acheter',
    'appeler',
    'envoyer',
    'payer',
    'reserver',
    'repondre',
    'finir',
    'rdv',
    'buy',
    'call',
    'send',
    'pay',
    'book',
    'reply',
    'renew',
    'fix',
    'email',
    'mail',
];

const LONG_TEXT = 200;
const URL_ONLY = /^(https?:\/\/\S+|www\.\S+)$/i;

const firstWord = (text: string): string =>
    normalizeText(text).split(/[^a-z0-9]+/)[0] ?? '';

export const suggestTriage = (content: string): TriageSuggestion => {
    const text = content.trim();
    const tokens = splitInboxTokens(text);

    const projectToken = tokens.find((token) => token.kind === 'project');
    if (projectToken) {
        return {
            kind: 'task',
            reason: 'project',
            detail: projectToken.text.slice(1).replace(/^"|"$/g, ''),
        };
    }

    const tagToken = tokens.find((token) => token.kind === 'tag');
    if (tagToken) {
        const tag = tagToken.text.slice(1);
        const key = normalizeText(tag);
        if (NOTE_TAGS.includes(key)) {
            return { kind: 'note', reason: 'tag', detail: tag };
        }
        if (PROJECT_TAGS.includes(key)) {
            return { kind: 'project', reason: 'tag', detail: tag };
        }
        return { kind: 'task', reason: 'tag', detail: tag };
    }

    if (URL_ONLY.test(text)) return { kind: 'note', reason: 'url' };

    const word = firstWord(text);
    if (NOTE_WORDS.includes(word)) {
        return { kind: 'note', reason: 'keyword', detail: word };
    }
    if (PROJECT_WORDS.includes(word)) {
        return { kind: 'project', reason: 'keyword', detail: word };
    }
    if (TASK_WORDS.includes(word)) {
        return { kind: 'task', reason: 'keyword', detail: word };
    }

    if (text.includes('\n') || text.length > LONG_TEXT) {
        return { kind: 'note', reason: 'long' };
    }

    return { kind: 'task', reason: 'default' };
};

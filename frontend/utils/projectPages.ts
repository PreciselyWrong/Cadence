import { domainOf } from './linkTriage';

export interface PageLine {
    url: string;
    title?: string | null;
    note?: string | null;
}

const escapeLabel = (text: string): string => text.replace(/([[\]])/g, '\\$1');

// « Copier les pages en Markdown »: one line per page, in their order,
// « - [Title](url) — note » (docs/37-links.md, Project pages).
export const pagesMarkdown = (pages: PageLine[]): string =>
    pages
        .map((page) => {
            const label = escapeLabel(
                page.title?.trim() || domainOf(page.url) || page.url
            );
            const note = page.note?.trim();
            return `- [${label}](${page.url})${note ? ` — ${note}` : ''}`;
        })
        .join('\n');

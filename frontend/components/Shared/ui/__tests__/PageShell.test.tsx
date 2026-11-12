import React from 'react';
import { render, screen } from '@testing-library/react';
import PageShell, { PAGE_GUTTER } from '../PageShell';
import PageHeader from '../PageHeader';

describe('PageShell', () => {
    it('centres a list page in one column', () => {
        render(
            <PageShell template="list" data-testid="shell">
                x
            </PageShell>
        );
        const shell = screen.getByTestId('shell');
        expect(shell).toHaveAttribute('data-page-template', 'list');
        expect(shell.className).toContain('mx-auto');
        expect(shell.className).toContain('max-w-4xl');
    });

    it('gives a board page the full width', () => {
        render(
            <PageShell template="board" data-testid="shell">
                x
            </PageShell>
        );
        const shell = screen.getByTestId('shell');
        expect(shell).toHaveAttribute('data-page-template', 'board');
        expect(shell.className).not.toContain('max-w-');
        expect(shell.className).not.toContain('mx-auto');
    });

    it('starts the page header at the shared gutter', () => {
        render(<PageHeader title="Tags" />);
        const header = screen.getByRole('banner');
        for (const cls of PAGE_GUTTER.split(' ')) {
            expect(header.className).toContain(cls);
        }
    });
});

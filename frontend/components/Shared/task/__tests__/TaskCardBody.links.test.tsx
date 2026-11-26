import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskCardBody from '../TaskCardBody';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

jest.mock('../../../../utils/urlService', () => ({
    ...jest.requireActual('../../../../utils/urlService'),
    fetchUrlPreview: (url: string) =>
        Promise.resolve({
            url,
            title: 'rocket',
            description: null,
            image: 'https://img.example.com/rocket.png',
            siteName: 'GitHub',
        }),
}));

// A link task's card: the site instead of the address, and the page's
// picture (docs/37-links.md, Rows).
describe('TaskCardBody with an address in the note', () => {
    it('names the site with its icon and shows the page picture', async () => {
        render(
            <TaskCardBody
                task={
                    {
                        uid: 't1',
                        name: 'Essayer : rocket',
                        note: 'https://github.com/acme/rocket\n\nfor the build',
                        status: 'not_started',
                    } as any
                }
                done={false}
            />
        );

        expect(await screen.findByText('GitHub')).toBeInTheDocument();
        expect(
            screen.queryByText(/https:\/\/github\.com/)
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('task-card-note')).toHaveTextContent(
            'for the build'
        );
        expect(screen.getByTestId('link-thumb')).toHaveAttribute(
            'src',
            'https://img.example.com/rocket.png'
        );
        expect(screen.getByTestId('site-icon').getAttribute('src')).toContain(
            'links/favicon?host=github.com'
        );
    });

    it('shows the host while the page is unknown, and no picture', () => {
        render(
            <TaskCardBody
                task={
                    {
                        uid: 't2',
                        name: 'Lire : post',
                        note: 'https://blog.example.com/post',
                        status: 'not_started',
                    } as any
                }
                done={false}
            />
        );
        expect(screen.getByText('blog.example.com')).toBeInTheDocument();
        expect(screen.queryByTestId('link-thumb')).not.toBeInTheDocument();
        expect(screen.queryByTestId('task-card-note')).not.toBeInTheDocument();
    });
});

describe('TaskCardBody project and tag chips', () => {
    const cardTask = (fields: Record<string, unknown>) =>
        ({ uid: 't2', name: 'Carte', status: 'not_started', ...fields }) as any;

    it('shows the project only when the task has both a project and a tag', () => {
        render(
            <TaskCardBody
                task={cardTask({
                    Project: { name: 'Lancement' },
                    tags: [{ name: 'urgent' }],
                })}
                done={false}
            />
        );
        expect(screen.getByText('Lancement')).toBeInTheDocument();
        expect(screen.queryByText('#urgent')).not.toBeInTheDocument();
    });

    it('falls back to the first tag when there is no project', () => {
        render(
            <TaskCardBody
                task={cardTask({ tags: [{ name: 'urgent' }] })}
                done={false}
            />
        );
        expect(screen.getByText('#urgent')).toBeInTheDocument();
    });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectPages from '../ProjectPages';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, string | number>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const pages = [
    {
        uid: 'l1',
        url: 'https://github.com/acme/rocket',
        domain: 'github.com',
        title: 'acme/rocket',
        note: 'the engine',
        image_url: 'https://img.example.com/rocket.png',
    },
    {
        uid: 'l2',
        url: 'https://example.com/gone',
        domain: 'example.com',
        title: null,
        note: null,
    },
] as any;

const renderPages = (extra = {}) => {
    const props = {
        pages,
        checks: { l2: 'dead' as const },
        onCreateTask: jest.fn(),
        onEdit: jest.fn().mockResolvedValue(undefined),
        onRemove: jest.fn(),
        ...extra,
    };
    render(<ProjectPages {...props} />);
    return props;
};

// A project's pages (docs/37-links.md, Project pages).
describe('ProjectPages', () => {
    it('lists the pages with their site and note, and marks a dead one', () => {
        renderPages();
        expect(screen.getByText('Pages')).toBeInTheDocument();
        expect(screen.getByText('acme/rocket')).toBeInTheDocument();
        expect(screen.getByText('the engine')).toBeInTheDocument();
        expect(screen.getByText('example.com/gone')).toBeInTheDocument();
        expect(screen.getByText('Not found')).toBeInTheDocument();
    });

    it('marks each page with its site icon, and its picture when it has one', () => {
        renderPages();
        const icons = screen.getAllByTestId('site-icon');
        expect(icons[0].getAttribute('src')).toContain(
            'links/favicon?host=github.com'
        );
        expect(icons[1].getAttribute('src')).toContain(
            'links/favicon?host=example.com'
        );
        const thumbs = screen.getAllByTestId('link-thumb');
        expect(thumbs).toHaveLength(1);
        expect(thumbs[0]).toHaveAttribute(
            'src',
            'https://img.example.com/rocket.png'
        );
    });

    it('offers Create a task, Edit and Remove for a page', async () => {
        const { onCreateTask, onRemove, onEdit } = renderPages();
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Page actions' })[0]
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Create a task' })
        );
        expect(onCreateTask).toHaveBeenCalledWith(pages[0]);

        fireEvent.click(
            screen.getAllByRole('button', { name: 'Page actions' })[0]
        );
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
            target: { value: 'Rocket' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(onEdit).toHaveBeenCalledWith(pages[0], {
                title: 'Rocket',
                note: 'the engine',
            })
        );

        fireEvent.click(
            screen.getAllByRole('button', { name: 'Page actions' })[1]
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Remove' })
        );
        expect(onRemove).toHaveBeenCalledWith(pages[1]);
    });

    it('shows nothing without pages', () => {
        const { container } = render(
            <ProjectPages
                pages={[]}
                checks={{}}
                onCreateTask={jest.fn()}
                onEdit={jest.fn()}
                onRemove={jest.fn()}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });
});

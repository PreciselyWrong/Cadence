import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskSourceBadge from '../TaskSourceBadge';
import { Task } from '../../../entities/Task';

const task = (overrides: Partial<Task>) => overrides as Task;

describe('TaskSourceBadge', () => {
    it('renders nothing for a plain web task', () => {
        const { container } = render(
            <TaskSourceBadge task={task({ source: null, source_url: null })} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('opens a gmail source in a new tab without opening the row', () => {
        const onRowClick = jest.fn();
        render(
            <div onClick={onRowClick}>
                <TaskSourceBadge
                    task={task({
                        source: 'gmail',
                        source_url: 'https://mail.google.com/mail/u/0/#inbox/a',
                    })}
                />
            </div>
        );
        const link = screen.getByTestId('task-source-badge');
        expect(link.tagName).toBe('A');
        expect(link).toHaveAttribute(
            'href',
            'https://mail.google.com/mail/u/0/#inbox/a'
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveTextContent('Gmail');
        expect(link.querySelector('img')?.getAttribute('src')).toContain(
            'host=mail.google.com'
        );

        fireEvent.click(link);
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it("shows the site's favicon, and the letter when it cannot load", () => {
        render(
            <TaskSourceBadge
                task={task({
                    source: 'link',
                    source_url: 'https://Blog.Example.com/post/1',
                })}
            />
        );
        const badge = screen.getByTestId('task-source-badge');
        const img = badge.querySelector('img') as HTMLImageElement;
        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toContain(
            'links/favicon?host=blog.example.com'
        );
        expect(img).toHaveAttribute('alt', '');
        expect(badge.querySelector('span[aria-hidden]')).toBeNull();

        fireEvent.error(img);
        expect(badge.querySelector('img')).toBeNull();
        expect(badge.querySelector('span[aria-hidden]')).toHaveTextContent('L');
    });

    it('shows an origin without a link as a plain label', () => {
        render(
            <TaskSourceBadge
                task={task({ source: 'telegram', source_url: null })}
            />
        );
        const badge = screen.getByTestId('task-source-badge');
        expect(badge.tagName).toBe('SPAN');
        expect(badge).toHaveTextContent('Telegram');
    });

    it('uses the existing TODO.md badge for a mirrored task', () => {
        render(
            <TaskSourceBadge task={task({ source: null, source_key: 'abc' })} />
        );
        expect(screen.getByTestId('todo-md-badge')).toBeInTheDocument();
    });
});

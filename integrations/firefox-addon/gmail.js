/* global browser */
'use strict';

// A « Cadence » button beside the subject of the open message; it opens a
// small panel over Gmail to name the task and pick its due date. The
// background sends it: this script never sees the token.
(function () {
    const t = (key) => browser.i18n.getMessage(key);
    const BUTTON_ID = 'cadence-gmail-button';
    let panel = null;

    const style = `
        :host { all: initial; }
        .panel { position: fixed; top: 72px; right: 24px; z-index: 2147483647; width: 320px;
            padding: 14px; border-radius: 12px; background: #fff; color: #1f1f1f;
            box-shadow: 0 8px 28px #0004; font: 14px system-ui, sans-serif; }
        @media (prefers-color-scheme: dark) { .panel { background: #2a2b31; color: #eee; } }
        .title { margin: 0 0 10px; font-weight: 600; }
        label span { display: block; margin-bottom: 2px; font-size: 12px; opacity: .75; }
        input { width: 100%; box-sizing: border-box; padding: 6px 8px; font: inherit; color: inherit;
            border: 1px solid #8888; border-radius: 6px; background: transparent; }
        .row { display: flex; gap: 6px; margin: 10px 0; }
        .row button { flex: 1; min-height: 30px; border: 1px solid #8888; border-radius: 8px;
            background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
        .row button[aria-pressed='true'] { border-color: #5e5ce6; background: #5e5ce62e; font-weight: 600; }
        .add { width: 100%; min-height: 36px; border: 0; border-radius: 8px; background: #5e5ce6;
            color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
        .add:disabled { opacity: .6; }
        .close { position: absolute; top: 8px; right: 10px; border: 0; background: none;
            color: inherit; font-size: 18px; cursor: pointer; opacity: .6; }
        .status { margin: 8px 0 0; font-size: 12px; }
    `;

    function subjectElement() {
        return document.querySelector('h2.hP');
    }

    function closePanel() {
        panel?.remove();
        panel = null;
    }

    function openPanel(message) {
        closePanel();
        const host = document.createElement('div');
        const root = host.attachShadow({ mode: 'closed' });
        const el = (tag, props = {}, children = []) => {
            const node = document.createElement(tag);
            for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
            node.append(...children);
            return node;
        };
        const css = document.createElement('style');
        css.textContent = style;
        root.append(
            css,
            el('form', { class: 'panel', role: 'dialog' }, [
                el('button', { type: 'button', class: 'close' }, ['×']),
                el('p', { class: 'title' }),
                el('label', {}, [el('span', { class: 'name-label' }), el('input', { class: 'name' })]),
                el('div', { class: 'row' }, [
                    el('button', { type: 'button', 'data-due': 'today', 'aria-pressed': 'false' }),
                    el('button', { type: 'button', 'data-due': 'tomorrow', 'aria-pressed': 'false' }),
                ]),
                el('button', { type: 'submit', class: 'add' }),
                el('p', { class: 'status', role: 'status', hidden: '' }),
            ])
        );
        const $ = (selector) => root.querySelector(selector);
        $('.panel').setAttribute('aria-label', t('gmail_add'));
        $('.title').textContent = t('gmail_add');
        $('.close').setAttribute('aria-label', t('action_close'));
        $('.name-label').textContent = t('field_task_name');
        $('[data-due="today"]').textContent = t('due_today');
        $('[data-due="tomorrow"]').textContent = t('due_tomorrow');
        $('.add').textContent = t('action_task');
        $('.name').value = message.name;

        let due = null;
        const dueButtons = root.querySelectorAll('[data-due]');
        for (const button of dueButtons) {
            button.addEventListener('click', () => {
                due = due === button.dataset.due ? null : button.dataset.due;
                for (const other of dueButtons) {
                    other.setAttribute('aria-pressed', String(other.dataset.due === due));
                }
            });
        }
        $('.close').addEventListener('click', closePanel);
        root.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Escape') closePanel();
        });
        $('.panel').addEventListener('submit', async (event) => {
            event.preventDefault();
            $('.add').disabled = true;
            let result = 'unreachable';
            try {
                result = await browser.runtime.sendMessage({
                    type: 'cadence-gmail-task',
                    href: location.href,
                    name: $('.name').value,
                    due,
                });
            } catch {
                result = 'unreachable';
            }
            $('.status').textContent = t(`result_${result}`);
            $('.status').hidden = false;
            if (result === 'saved') {
                setTimeout(closePanel, 1200);
            } else {
                $('.add').disabled = false;
            }
        });
        document.body.append(host);
        panel = host;
        $('.name').focus();
        $('.name').setSelectionRange(message.name.length, message.name.length);
    }

    function placeButton() {
        const subject = subjectElement();
        if (!subject || document.getElementById(BUTTON_ID)) return;
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = '+ Cadence';
        button.title = t('gmail_add');
        button.style.cssText =
            'margin-left:12px;padding:2px 10px;border:1px solid #5e5ce6;border-radius:12px;' +
            'background:transparent;color:#5e5ce6;font:500 13px system-ui,sans-serif;' +
            'cursor:pointer;vertical-align:middle;';
        button.addEventListener('click', () => {
            const current = subjectElement();
            openPanel({ name: current ? current.textContent : '' });
        });
        subject.after(button);
    }

    let scheduled = false;
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            placeButton();
        });
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', closePanel);
    placeButton();
})();

const { parseGitUrl } = require('../../../../modules/plugins/core/gitUrl');

describe('plugin git address', () => {
    it.each([
        [
            'https://github.com/acme/cadence-plugin-hermes.git',
            'cadence-plugin-hermes',
        ],
        ['https://github.com/acme/hermes/', 'hermes'],
        ['http://gitea.lan:3000/me/My_Plugin', 'my-plugin'],
        ['ssh://git@gitea.lan/me/hermes.git', 'hermes'],
        ['git@gitea.lan:me/hermes.git', 'hermes'],
    ])('accepts %s', (url, folder) => {
        expect(parseGitUrl(url)).toEqual({ ok: true, url, folder });
    });

    it.each([
        ['empty', ''],
        ['not a string', 42],
        ['a local path', '/home/x/plugin'],
        ['file protocol', 'file:///home/x/plugin'],
        ['ext transport', 'ext::sh -c touch% /tmp/x'],
        ['an option', '--upload-pack=evil'],
        ['credentials in the address', 'https://user:token@host/x/y.git'],
        ['a space', 'https://host/x y.git'],
        ['a newline', 'https://host/x\ny.git'],
        ['no repository name', 'https://host/'],
        ['a name that climbs', 'https://host/x/..'],
    ])('rejects %s', (_label, url) => {
        const result = parseGitUrl(url);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/\S/);
    });
});

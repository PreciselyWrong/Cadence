const {
    configuredRepos,
    invalidSlugs,
    displayName,
} = require('../../../../modules/todo-md/repoConfig');

const env = (extra) => ({
    TUDUDI_TODO_REPOS: 'cadence, My-Notes ,cadence',
    TUDUDI_TODO_REPO_CADENCE_URL: 'https://git.example.com/nico/cadence.git',
    TUDUDI_TODO_REPO_MY_NOTES_URL: 'git@github.com:nico/notes.git',
    TUDUDI_TODO_REPO_MY_NOTES_BRANCH: 'trunk',
    TUDUDI_TODO_REPO_MY_NOTES_PATH: 'docs/TODO.md',
    TUDUDI_TODO_REPO_MY_NOTES_TOKEN: 'tok',
    ...extra,
});

describe('TODO.md repository configuration', () => {
    it('reads each slug once with its defaults', () => {
        expect(configuredRepos(env())).toEqual([
            expect.objectContaining({
                slug: 'cadence',
                branch: 'main',
                path: 'TODO.md',
                token: null,
                display: 'git.example.com/nico/cadence',
            }),
            expect.objectContaining({
                slug: 'my-notes',
                branch: 'trunk',
                path: 'docs/TODO.md',
                token: 'tok',
                display: 'github.com:nico/notes',
            }),
        ]);
    });

    it.each([
        ['TUDUDI_TODO_REPO_CADENCE_URL', ''],
        ['TUDUDI_TODO_REPO_CADENCE_URL', 'ext::sh -c touch% /tmp/pwned'],
        ['TUDUDI_TODO_REPO_CADENCE_URL', '--upload-pack=evil'],
        ['TUDUDI_TODO_REPO_CADENCE_BRANCH', '--force'],
        ['TUDUDI_TODO_REPO_CADENCE_BRANCH', 'a..b'],
        ['TUDUDI_TODO_REPO_CADENCE_PATH', '../outside/TODO.md'],
        ['TUDUDI_TODO_REPO_CADENCE_PATH', '/etc/passwd'],
        ['TUDUDI_TODO_REPO_CADENCE_PATH', '.git/config'],
    ])('leaves out a repository whose %s is %p', (key, value) => {
        const vars = env({ [key]: value });
        expect(configuredRepos(vars).map((r) => r.slug)).toEqual(['my-notes']);
        expect(invalidSlugs(vars)).toEqual(['cadence']);
    });

    it('never shows credentials in the display name', () => {
        expect(displayName('https://user:secret@host/x/y.git')).toBe(
            'host/x/y'
        );
    });
});

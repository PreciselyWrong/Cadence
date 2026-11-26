const {
    configuredRepos,
    invalidSlugs,
    displayName,
} = require('../../../../modules/todo-md/repoConfig');

const env = (extra) => ({
    CADENCE_TODO_REPOS: 'cadence, My-Notes ,cadence',
    CADENCE_TODO_REPO_CADENCE_URL: 'https://git.example.com/nico/cadence.git',
    CADENCE_TODO_REPO_MY_NOTES_URL: 'git@github.com:nico/notes.git',
    CADENCE_TODO_REPO_MY_NOTES_BRANCH: 'trunk',
    CADENCE_TODO_REPO_MY_NOTES_PATH: 'docs/TODO.md',
    CADENCE_TODO_REPO_MY_NOTES_TOKEN: 'tok',
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
        ['CADENCE_TODO_REPO_CADENCE_URL', ''],
        ['CADENCE_TODO_REPO_CADENCE_URL', 'ext::sh -c touch% /tmp/pwned'],
        ['CADENCE_TODO_REPO_CADENCE_URL', '--upload-pack=evil'],
        ['CADENCE_TODO_REPO_CADENCE_BRANCH', '--force'],
        ['CADENCE_TODO_REPO_CADENCE_BRANCH', 'a..b'],
        ['CADENCE_TODO_REPO_CADENCE_PATH', '../outside/TODO.md'],
        ['CADENCE_TODO_REPO_CADENCE_PATH', '/etc/passwd'],
        ['CADENCE_TODO_REPO_CADENCE_PATH', '.git/config'],
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

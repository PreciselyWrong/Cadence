const { Sequelize } = require('sequelize');
const {
    sequelize,
    Link,
    Project,
    Tag,
    Task,
    User,
} = require('../../../models');
const { createTestUser } = require('../../helpers/testUtils');
const migration = require('../../../migrations/20261112230000-links-takeover');

// The links library goes (docs/fork/PLAN-links.md, Données): each link
// finds its home, once.
describe('migration 20261112230000-links-takeover', () => {
    const qi = () => sequelize.getQueryInterface();

    afterAll(async () => {
        await sequelize.close();
    });

    // The former library's columns, as an older database has them.
    beforeAll(async () => {
        const columns = await qi().describeTable('links');
        for (const [name, type] of [
            ['status', Sequelize.STRING],
            ['source_type', Sequelize.STRING],
            ['source_uid', Sequelize.STRING],
        ]) {
            if (!(name in columns)) {
                await qi().addColumn('links', name, { type, allowNull: true });
            }
        }
    });

    const oldLink = async (fields) => {
        const link = await Link.create(fields);
        const extra = {};
        for (const key of ['status', 'source_type', 'source_uid']) {
            if (key in fields) extra[key] = fields[key];
        }
        if (Object.keys(extra).length) {
            await qi().bulkUpdate('links', extra, { id: link.id });
        }
        return link;
    };

    it('keeps project links as pages, turns the others into tasks or drops them', async () => {
        const user = await createTestUser({ email: 'takeover@example.com' });
        await User.update({ language: 'fr' }, { where: { id: user.id } });
        const project = await Project.create({
            name: 'Fusée',
            user_id: user.id,
        });
        const source = await Task.create({
            name: 'À regarder : jq',
            note: 'https://github.com/jqlang/jq',
            user_id: user.id,
        });
        const tag = await Tag.create({ name: 'outils', user_id: user.id });

        const archived = await oldLink({
            user_id: user.id,
            url: 'https://example.com/old',
            status: 'dropped',
        });
        const page = await Link.create({
            user_id: user.id,
            url: 'https://example.com/engine',
            project_id: project.id,
            title: 'Engine',
        });
        await oldLink({
            user_id: user.id,
            url: 'https://github.com/jqlang/jq',
            source_type: 'task',
            source_uid: source.uid,
        });
        const toTask = await Link.create({
            user_id: user.id,
            url: 'https://github.com/BurntSushi/ripgrep',
            kind: 'repo',
            title: 'ripgrep',
            note: 'pour remplacer grep\n\nRésumé auto : un outil de recherche.',
        });
        await toTask.setTags([tag]);
        await oldLink({
            user_id: user.id,
            url: 'https://www.youtube.com/watch?v=abc',
            kind: 'video',
            title: 'Une conférence',
            note: 'Résumé auto : une vidéo sur les fusées.',
            source_type: 'task',
            source_uid: 'gone-task-uid',
        });

        await migration.up(qi(), Sequelize);
        // Idempotent: a second run finds nothing left to move.
        await migration.up(qi(), Sequelize);

        const links = await Link.findAll({ where: { user_id: user.id } });
        expect(links.map((l) => l.uid)).toEqual([page.uid]);
        expect(await Link.findByPk(archived.id)).toBeNull();

        const made = await Task.findAll({
            where: { user_id: user.id, source: 'link' },
            include: [{ model: Tag }],
            order: [['id', 'ASC']],
        });
        expect(
            made.map((t) => ({
                name: t.name,
                note: t.note,
                needs_when: t.needs_when,
                source_url: t.source_url,
                tags: t.Tags.map((x) => x.name),
            }))
        ).toEqual([
            {
                name: 'Essayer : BurntSushi/ripgrep',
                note: 'https://github.com/BurntSushi/ripgrep\n\npour remplacer grep',
                needs_when: true,
                source_url: 'https://github.com/BurntSushi/ripgrep',
                tags: ['outils'],
            },
            {
                name: 'Regarder : Une conférence',
                note: 'https://www.youtube.com/watch?v=abc',
                needs_when: true,
                source_url: 'https://www.youtube.com/watch?v=abc',
                tags: [],
            },
        ]);
        expect(await Task.findByPk(source.id)).not.toBeNull();
    });
});

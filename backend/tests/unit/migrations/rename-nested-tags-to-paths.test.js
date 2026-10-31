const { sequelize, Tag, User } = require('../../../models');
const migration = require('../../../migrations/20261031160416-rename-nested-tags-to-paths');

describe('migration 20261031160416-rename-nested-tags-to-paths', () => {
    const qi = () => sequelize.getQueryInterface();
    let user;

    beforeEach(async () => {
        user = await User.create({ email: 'paths@example.com', name: 'Paths' });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    // Creates a legacy one-level link: the hooks would derive the name, so
    // the parent is set with SQL, as the old code did.
    const legacyChild = async (parent, name) => {
        const child = await Tag.create({ name, user_id: user.id });
        await sequelize.query(
            'UPDATE tags SET parent_id = :parentId WHERE id = :id',
            {
                replacements: { parentId: parent.id, id: child.id },
            }
        );
        return child;
    };

    const nameOf = async (id) => (await Tag.findByPk(id)).name;

    it('renames a one-level child to its full path', async () => {
        const parent = await Tag.create({ name: 'perso', user_id: user.id });
        const child = await legacyChild(parent, 'sport');

        await migration.up(qi());

        expect(await nameOf(child.id)).toBe('perso/sport');
        expect(await nameOf(parent.id)).toBe('perso');
    });

    it('leaves top-level tags and already-pathed names alone, and is idempotent', async () => {
        const top = await Tag.create({ name: 'work', user_id: user.id });
        const parent = await Tag.create({ name: 'perso', user_id: user.id });
        const child = await legacyChild(parent, 'sport');

        await migration.up(qi());
        await migration.up(qi());

        expect(await nameOf(top.id)).toBe('work');
        expect(await nameOf(child.id)).toBe('perso/sport');
    });

    it('strips the path back to the leaf on down', async () => {
        const parent = await Tag.create({ name: 'perso', user_id: user.id });
        const child = await legacyChild(parent, 'sport');
        await migration.up(qi());

        await migration.down(qi());

        expect(await nameOf(child.id)).toBe('sport');
    });
});

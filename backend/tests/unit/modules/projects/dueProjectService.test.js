const { Project, Notification, User } = require('../../../../models');
const {
    checkDueProjects,
} = require('../../../../modules/projects/dueProjectService');
const bcrypt = require('bcrypt');

describe('dueProjectService', () => {
    let user;

    beforeEach(async () => {
        user = await User.create({
            email: 'test@example.com',
            password_digest: await bcrypt.hash('password123', 10),
            notification_preferences: {
                inApp: {
                    project_due_soon: true,
                    project_overdue: true,
                },
            },
        });
    });

    describe('checkDueProjects', () => {
        it('never announces an overdue project', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            await Project.create({
                name: 'Active Project',
                user_id: user.id,
                due_date_at: yesterday,
                status: 'in_progress',
            });

            await checkDueProjects();

            expect(
                await Notification.count({ where: { user_id: user.id } })
            ).toBe(0);
        });

        it('notifies once, in place, for a project due within 24 hours', async () => {
            const soon = new Date(Date.now() + 20 * 60 * 60 * 1000);
            const project = await Project.create({
                name: 'Launch',
                user_id: user.id,
                due_date_at: soon,
                status: 'in_progress',
            });

            const first = await checkDueProjects();
            const [original] = await Notification.findAll({
                where: { user_id: user.id, type: 'project_due_soon' },
            });
            await Notification.update(
                { message: 'stale' },
                { where: { id: original.id } }
            );
            const second = await checkDueProjects();

            expect(first.notificationsCreated).toBe(1);
            expect(second.notificationsCreated).toBe(0);
            const rows = await Notification.findAll({
                where: { user_id: user.id, type: 'project_due_soon' },
            });
            expect(rows).toHaveLength(1);
            expect(rows[0].uid).toBe(original.uid);
            expect(rows[0].message).toContain('hours');
            expect(rows[0].data.projectUid).toBe(project.uid);
        });

        it('should not create a notification for a project marked done', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            await Project.create({
                name: 'Completed Project',
                user_id: user.id,
                due_date_at: yesterday,
                status: 'done',
            });

            await checkDueProjects();

            const notifications = await Notification.findAll({
                where: { user_id: user.id },
            });

            expect(notifications.length).toBe(0);
        });

        it('should not create a notification for a cancelled project', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            await Project.create({
                name: 'Cancelled Project',
                user_id: user.id,
                due_date_at: yesterday,
                status: 'cancelled',
            });

            await checkDueProjects();

            const notifications = await Notification.findAll({
                where: { user_id: user.id },
            });

            expect(notifications.length).toBe(0);
        });
    });
});

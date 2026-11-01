'use strict';

const { setJsonColumnDefault } = require('../utils/db-dialect');

// Installs created by sequelize.sync() while the User model still listed
// `habitReminders` carry that key in the column DEFAULT of
// users.notification_preferences. Sequelize always supplies the model default
// on create, so only raw inserts see the column default; this makes it match
// the model again. A frozen copy of the model default: migrations never read
// the model.
const MODEL_DEFAULT = {
    dueTasks: { inApp: true, email: false, push: false, telegram: false },
    overdueTasks: { inApp: true, email: false, push: false, telegram: false },
    dueProjects: { inApp: true, email: false, push: false, telegram: false },
    overdueProjects: {
        inApp: true,
        email: false,
        push: false,
        telegram: false,
    },
    deferUntil: { inApp: true, email: false, push: false, telegram: false },
    taskAssigned: { inApp: true, email: false, push: false, telegram: false },
    comments: { inApp: true, email: false, push: false, telegram: false },
};

module.exports = {
    async up(queryInterface) {
        await setJsonColumnDefault(
            queryInterface,
            'users',
            'notification_preferences',
            MODEL_DEFAULT
        );
    },

    // The old default carried a key that no longer exists: nothing to restore.
    async down() {},
};

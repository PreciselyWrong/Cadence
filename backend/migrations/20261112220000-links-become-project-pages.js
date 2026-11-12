'use strict';

const {
    safeEnsureIndex,
    safeRemoveIndex,
} = require('../utils/migration-utils');

// A link is now a page of a project (docs/37-links.md, Project pages): the
// same address may be in two projects, once in each.
module.exports = {
    async up(queryInterface) {
        await safeRemoveIndex(queryInterface, 'links', 'links_user_url_unique');
        await safeEnsureIndex(queryInterface, 'links', ['project_id', 'url'], {
            unique: true,
            name: 'links_project_url_unique',
        });
        await safeEnsureIndex(queryInterface, 'links', ['user_id', 'url'], {
            name: 'links_user_url_idx',
        });
    },

    async down(queryInterface) {
        await safeRemoveIndex(
            queryInterface,
            'links',
            'links_project_url_unique'
        );
        await safeRemoveIndex(queryInterface, 'links', 'links_user_url_idx');
    },
};

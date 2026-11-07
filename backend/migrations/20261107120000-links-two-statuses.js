'use strict';

// Links have two statuses: new (to read) and dropped (set aside). The former
// ones fold into new; a parked link keeps its review day (docs/37-links.md).
// Idempotent: a second run finds no former status left. Nothing to restore on
// down: the former statuses cannot be told apart again.
const FORMER_STATUSES = ['to_evaluate', 'tested', 'kept', 'parked'];

module.exports = {
    async up(queryInterface) {
        await queryInterface.bulkUpdate(
            'links',
            { status: 'new' },
            { status: FORMER_STATUSES }
        );
    },

    async down() {},
};

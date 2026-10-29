const { compareTasksByField, comparePinned } = require('../core/comparators');

function createTaskComparator(orderColumn, orderDirection, safeTimezone) {
    return (a, b) => {
        const pinned = comparePinned(a, b);
        if (pinned !== 0) return pinned;
        const comparison = compareTasksByField(a, b, orderColumn, safeTimezone);
        return orderDirection === 'desc' ? -comparison : comparison;
    };
}

function sortTasksByOrder(tasks, orderBy, safeTimezone) {
    const [orderColumn, orderDirection = 'desc'] = orderBy.split(':');
    tasks.sort(createTaskComparator(orderColumn, orderDirection, safeTimezone));
}

module.exports = {
    createTaskComparator,
    sortTasksByOrder,
};

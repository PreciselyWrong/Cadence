'use strict';

const { ValidationError } = require('../../shared/errors');
const { TASK_STATUS_FILTERS } = require('../search/validation');

function validateName(name) {
    if (!name || name.trim() === '') {
        throw new ValidationError('View name is required');
    }
    return name.trim();
}

function validateTaskStatus(taskStatus) {
    if (!taskStatus) return null;
    if (!Object.keys(TASK_STATUS_FILTERS).includes(taskStatus)) {
        throw new ValidationError('Invalid task status');
    }
    return taskStatus;
}

// A view can be narrowed to one project by its uid; blank means all projects.
function validateProjectUid(projectUid) {
    if (projectUid === undefined || projectUid === null) return null;
    if (typeof projectUid !== 'string' || projectUid.trim().length > 64) {
        throw new ValidationError('Invalid project');
    }
    return projectUid.trim() || null;
}

module.exports = { validateName, validateTaskStatus, validateProjectUid };

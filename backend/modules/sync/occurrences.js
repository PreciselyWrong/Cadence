'use strict';

const hlc = require('./hlc');

const rejected = (reason) => ({ status: 'rejected', reason });

// Completing or skipping a recurring task moves its due date, which a field
// merge cannot express: two devices completing the same day offline would
// advance it twice. These ops name the occurrence they act on, and an
// occurrence already recorded is answered as done.
async function applyOccurrence(userId, op) {
    const { Task, User, RecurringCompletion } = require('../../models');
    const {
        completeOccurrence,
        skipRecurringOccurrence,
    } = require('../tasks/operations/recurring');

    if (!hlc.isAcceptable(op.hlc)) return rejected('invalid_clock');
    const date = new Date(op.occurrence_date);
    if (Number.isNaN(date.getTime())) return rejected('invalid_occurrence');

    const task = await Task.findOne({ where: { uid: op.uid } });
    if (!task) return rejected('not_found');
    if (task.user_id !== userId) return rejected('forbidden');
    if (!task.recurrence_type || task.recurrence_type === 'none') {
        return rejected('not_recurring');
    }

    const recorded = await RecurringCompletion.findOne({
        where: { task_id: task.id, original_due_date: date },
    });
    if (recorded) return { status: 'applied', duplicate: true };

    if (
        !task.due_date ||
        new Date(task.due_date).getTime() !== date.getTime()
    ) {
        return rejected('occurrence_not_due');
    }

    hlc.observe(op.hlc);
    const user = await User.findByPk(userId, { attributes: ['timezone'] });
    const timezone = user?.timezone || 'UTC';

    if (op.action === 'complete_occurrence') {
        await completeOccurrence(task, { timezone, userId });
        return { status: 'applied' };
    }
    const result = await skipRecurringOccurrence(task, userId, timezone);
    return result.error ? rejected('cannot_skip') : { status: 'applied' };
}

module.exports = { applyOccurrence };

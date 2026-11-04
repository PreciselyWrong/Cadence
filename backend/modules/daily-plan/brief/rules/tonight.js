'use strict';

// The few open tasks worth doing this evening, in the order the user chose
// (settings.priorities). A task only qualifies when at least one of those
// criteria holds; the total must fit tonight's capacity when it is known.
const { addDays } = require('./dates');
const { taskMinutes } = require('./load');
const { texts } = require('./texts');

// Each criterion is a boolean; the order of settings.priorities decides
// which one wins a comparison.
function criteriaOf(task, today) {
    const tomorrow = addDays(today, 1);
    return {
        consequence: Boolean(task.due_date) && task.due_date <= tomorrow,
        blocking: (task.blocks_uids || []).length > 0,
        money_deadline: Boolean(task.money) && Boolean(task.due_date),
        planned_load: (task.planned_on || []).includes(today),
        long_term: Boolean(task.project_name),
    };
}

function reasonFor(criterion, task, today) {
    switch (criterion) {
        case 'consequence':
            if (task.due_date < today) return texts.tonight.overdue;
            if (task.due_date === today) return texts.tonight.dueToday;
            return texts.tonight.dueTomorrow;
        case 'blocking':
            return texts.tonight.blocking(task.blocks_uids.length);
        case 'money_deadline':
            return texts.tonight.money(task.due_date);
        case 'planned_load':
            return texts.tonight.planned;
        case 'long_term':
            return texts.tonight.project(task.project_name);
        default:
            return '';
    }
}

// Ranking: the first criterion (in the user's order) that differs decides.
// Then higher priority, earlier due date, and uid so the order is stable.
function compare(a, b, priorities) {
    for (const key of priorities) {
        if (a.criteria[key] !== b.criteria[key])
            return a.criteria[key] ? -1 : 1;
    }
    return (
        (b.task.priority ?? -1) - (a.task.priority ?? -1) ||
        (a.task.due_date || '9999').localeCompare(b.task.due_date || '9999') ||
        String(a.task.uid).localeCompare(String(b.task.uid))
    );
}

function tonightPicks(input, settings, todayLoad) {
    const today = input.today;
    const { maxTonight } = settings.thresholds;
    const capacity = todayLoad.capacity_minutes;
    const ranked = input.tasks
        .filter((task) => task.status !== 'waiting')
        .map((task) => ({ task, criteria: criteriaOf(task, today) }))
        .filter(({ criteria }) => Object.values(criteria).some(Boolean))
        .sort((a, b) => compare(a, b, settings.priorities));

    const picks = [];
    let total = 0;
    for (const { task, criteria } of ranked) {
        if (picks.length >= maxTonight) break;
        const { minutes } = taskMinutes(task);
        // A task that does not fit is skipped, a smaller one below may still.
        if (capacity !== null && total + minutes > capacity) continue;
        const criterion = settings.priorities.find((key) => criteria[key]);
        picks.push({
            task_uid: task.uid,
            reason: reasonFor(criterion, task, today),
            minutes,
        });
        total += minutes;
    }
    return picks;
}

module.exports = { criteriaOf, tonightPicks };

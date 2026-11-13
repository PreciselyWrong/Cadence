'use strict';

// Membership of one day's lists on the Today page: the server rule shared by
// web, Android and MCP (docs/fork/TODAY-REDESIGN.md, "Modèle", rule 2).
// Pure: the caller loads the plan lines ({ task_id, plan_date }) and tasks.

// Task ids planned on `date`.
function planIdsOn(lines, date) {
    return new Set(
        lines
            .filter((line) => line.plan_date === date)
            .map((line) => line.task_id)
    );
}

// Task ids a day's `due` and `overdue` lists leave out: planned on the day
// itself, or on any day from `today` on. A plan on a past day never counts.
function blockingTaskIds(lines, { date, today }) {
    return new Set(
        lines
            .filter(
                (line) => line.plan_date === date || line.plan_date >= today
            )
            .map((line) => line.task_id)
    );
}

// Overdue tasks planned on a day after `today`: task id -> the nearest such
// day. They leave `overdue` (the Plan board shows them on that day) but the
// Today page still lists them, with that day, under `overdue_planned`.
function laterPlanDays(lines, { today }) {
    const days = new Map();
    for (const line of lines) {
        if (line.plan_date <= today) continue;
        const known = days.get(line.task_id);
        if (!known || line.plan_date < known)
            days.set(line.task_id, line.plan_date);
    }
    return days;
}

// The suggestion lists of the day, from getCandidates. Suggested tasks of the
// current week lead, then the ones in view, then the rest (as laterSection in
// frontend/components/DailyPlan/autoPlace.ts). Tasks in `excludeUids` (on the
// plan, due or overdue) appear nowhere.
function buildSuggestions(candidates, { weekStart, excludeUids }) {
    const keep = (tasks = []) =>
        tasks.filter((task) => !excludeUids.has(task.uid));
    const thisWeek = [];
    const inView = [];
    const suggested = [];
    for (const task of keep(candidates.suggested)) {
        if (task.week_of === weekStart) thisWeek.push(task);
        else if (task.in_view) inView.push(task);
        else suggested.push(task);
    }
    return {
        tagged_today: keep(candidates.tagged_today),
        in_progress: keep(candidates.in_progress),
        tomorrow: keep(candidates.tomorrow),
        this_week: thisWeek,
        in_view: inView,
        suggested,
        suggested_total: candidates.suggested_total,
        inbox_count: candidates.inbox_count,
    };
}

module.exports = {
    planIdsOn,
    blockingTaskIds,
    laterPlanDays,
    buildSuggestions,
};

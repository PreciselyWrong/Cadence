'use strict';

/**
 * Cadence habit rules, a JavaScript mirror of android/domain. Parity with the
 * Kotlin rules is proven by the golden fixtures in fixtures/habits/ (see its
 * README), replayed by Jest and by Gradle.
 */

const dates = require('./dates');
const models = require('./models');
const evaluator = require('./evaluator');
const streak = require('./streak');
const statistics = require('./statistics');
const timerAndGroup = require('./timerAndGroup');

module.exports = {
    dates,
    ...models,
    periodWindow: evaluator.periodWindow,
    isPlannedOn: evaluator.isPlannedOn,
    evaluate: evaluator.evaluate,
    computeStreak: streak.computeStreak,
    computeSummary: statistics.computeSummary,
    computeActivity: statistics.computeActivity,
    confidenceFor: statistics.confidenceFor,
    elapsedSecondsAt: timerAndGroup.elapsedSecondsAt,
    timerAttainment: timerAndGroup.timerAttainment,
    groupIsActiveAt: timerAndGroup.groupIsActiveAt,
};

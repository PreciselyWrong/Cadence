'use strict';

// Mirrors android/domain HabitTimer.kt and HabitGroup.kt.

const effectiveMinimum = (goal) => goal.minimumMinor ?? goal.targetMinor;

// Elapsed time is derived, never stored: finished segments plus the running
// one. A clock going backwards never removes time already counted.
function elapsedSecondsAt(timer, now) {
    if (!timer.runningSince) return timer.accumulatedSeconds;
    const current = Math.max(
        Math.floor(Date.parse(now) / 1000) -
            Math.floor(Date.parse(timer.runningSince) / 1000),
        0
    );
    return timer.accumulatedSeconds + current;
}

function timerAttainment(goal, progressMinor, elapsedSeconds) {
    const total = progressMinor + elapsedSeconds;
    if (total >= goal.targetMinor) return 'IDEAL';
    if (total >= effectiveMinimum(goal)) return 'MINIMUM';
    return 'TODO';
}

// A group without bounds is always active; a range may cross midnight; equal
// bounds cover the whole clock.
function groupIsActiveAt(group, time) {
    const { startMinute: start, endMinute: end } = group;
    if (
        start === null ||
        start === undefined ||
        end === null ||
        end === undefined
    ) {
        return true;
    }
    const [hour, minute] = time.split(':').map(Number);
    const minuteOfDay = hour * 60 + minute;
    if (start <= end) {
        return start === end ? true : minuteOfDay >= start && minuteOfDay < end;
    }
    return minuteOfDay >= start || minuteOfDay < end;
}

module.exports = { elapsedSecondsAt, timerAttainment, groupIsActiveAt };

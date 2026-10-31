const fs = require('fs');
const path = require('path');
const cadence = require('../../../modules/habits/cadence');

// Replays fixtures/habits/*.json (see its README). The Kotlin twin is
// android/domain/.../GoldenFixturesTest.kt; both must pass on the same files.
const DIR = path.join(__dirname, '../../../../fixtures/habits');

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));

function habitSource(testCase) {
    const versions = testCase.versions
        ? testCase.versions
        : [{ effectiveFrom: '1970-01-01', habit: testCase.habit }];
    return versions
        .map((v) => ({
            effectiveFrom: v.effectiveFrom,
            habit: cadence.buildHabit(v.habit),
        }))
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function habitAtOf(versions) {
    return (date) => {
        let found = null;
        for (const v of versions) {
            if (v.effectiveFrom <= date) found = v.habit;
        }
        return found;
    };
}

const entriesOf = (testCase, habitId) =>
    (testCase.entries ?? []).map((e) => cadence.buildEntry(e, habitId));
const pausesOf = (testCase) => (testCase.pauses ?? []).map(cadence.buildPause);

// Subset comparison: every key of `expected` must match; arrays must match
// element by element, with the same length.
function expectSubset(actual, expected, label) {
    if (expected === null || typeof expected !== 'object') {
        expect({ label, v: actual }).toEqual({ label, v: expected });
        return;
    }
    if (Array.isArray(expected)) {
        expect(Array.isArray(actual)).toBe(true);
        expect({ label, length: actual.length }).toEqual({
            label,
            length: expected.length,
        });
        expected.forEach((item, i) =>
            expectSubset(actual[i], item, `${label}[${i}]`)
        );
        return;
    }
    expect(actual).not.toBeNull();
    for (const [key, value] of Object.entries(expected)) {
        expectSubset(actual[key], value, `${label}.${key}`);
    }
}

const statusMap = (list) =>
    Object.fromEntries(list.map((d) => [d.date, d.status]));

const RUNNERS = {
    evaluate(c) {
        const habit = cadence.buildHabit(c.habit);
        return cadence.evaluate(
            habit,
            c.date,
            entriesOf(c, habit.id),
            pausesOf(c)
        );
    },
    streak(c) {
        const versions = habitSource(c);
        return cadence.computeStreak(
            habitAtOf(versions),
            c.today,
            entriesOf(c, versions[0]?.habit.id ?? 'h'),
            pausesOf(c),
            c.maxPeriods
        );
    },
    statistics(c) {
        const versions = habitSource(c);
        const summary = cadence.computeSummary(
            habitAtOf(versions),
            c.today,
            entriesOf(c, versions[0]?.habit.id ?? 'h'),
            pausesOf(c)
        );
        return {
            ...summary,
            dayStatuses: statusMap(summary.days),
            calendarDayStatuses: statusMap(summary.calendarDays),
            calendarDaysCount: summary.calendarDays.length,
        };
    },
    activity(c) {
        return cadence.computeActivity(
            c.habitId,
            c.startsOn,
            c.today,
            entriesOf(c, c.habitId)
        );
    },
    target_at(c) {
        return {
            targetMinor: cadence.targetAt(cadence.buildGoal(c.goal), c.date),
        };
    },
    goal_invalid(c) {
        try {
            cadence.buildGoal(c.goal);
            return { error: false };
        } catch {
            return { error: true };
        }
    },
    window(c) {
        return cadence.periodWindow(c.date, c.period, c.firstDayOfWeek);
    },
    is_planned(c) {
        return {
            planned: cadence.isPlannedOn(cadence.buildHabit(c.habit), c.date),
        };
    },
    pause(c) {
        const pause = cadence.buildPause(c.pause);
        return {
            includes: cadence.pauseIncludes(pause, c.date),
            isSingleDay: cadence.isSingleDay(pause),
            isCancellableOn: cadence.isCancellableOn(pause, c.date),
            resumedOn: (() => {
                const resumed = cadence.resumedOn(pause, c.date);
                return resumed
                    ? {
                          start: resumed.start,
                          endExclusive: resumed.endExclusive,
                      }
                    : null;
            })(),
        };
    },
    group_active(c) {
        return { active: cadence.groupIsActiveAt(c.group, c.time) };
    },
    timer(c) {
        return {
            elapsedSeconds: cadence.elapsedSecondsAt(c.timer, c.now),
            isRunning: Boolean(c.timer.runningSince),
        };
    },
    timer_attainment(c) {
        return {
            attainment: cadence.timerAttainment(
                cadence.buildGoal(c.goal),
                c.progressMinor,
                c.elapsedSeconds
            ),
        };
    },
};

describe('Cadence golden fixtures', () => {
    it('finds the fixture files', () => {
        expect(files.length).toBeGreaterThanOrEqual(8);
    });

    for (const file of files) {
        const { suite, cases } = JSON.parse(
            fs.readFileSync(path.join(DIR, file), 'utf8')
        );

        describe(`${suite} (${file})`, () => {
            it('has unique case names and known kinds', () => {
                const names = cases.map((c) => c.name);
                expect(new Set(names).size).toBe(names.length);
                for (const c of cases) {
                    expect(Object.keys(RUNNERS)).toContain(c.kind);
                }
            });

            for (const testCase of cases) {
                it(`${testCase.name} [${testCase.source}]`, () => {
                    const actual = RUNNERS[testCase.kind](testCase);
                    expectSubset(actual, testCase.expect, testCase.name);
                });
            }
        });
    }
});

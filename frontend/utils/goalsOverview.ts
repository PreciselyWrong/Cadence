import { Goal, GoalBucket } from '../entities/Goal';

export const GOAL_BUCKETS: GoalBucket[] = ['have', 'be', 'do'];

export interface ObjectiveEntry {
    goal: Goal;
    keyResults: Goal[];
}

// What the Goals page shows, in order: active objectives, the others folded
// away, then the open wishes per group and the finished ones. Android builds
// the same view (`Goals.overview` in android/tasks).
export interface GoalsOverview {
    objectives: ObjectiveEntry[];
    otherObjectives: ObjectiveEntry[];
    wishes: Record<GoalBucket, Goal[]>;
    doneWishes: Goal[];
}

const collator = new Intl.Collator('fr', { sensitivity: 'accent' });
const byTitle = (a: Goal, b: Goal) => collator.compare(a.title, b.title);

const isActive = (goal: Goal) => !goal.status || goal.status === 'active';

// A wish is still open while active or paused; achieved or dropped, it leaves
// its group.
export const isOpenWish = (goal: Goal) =>
    isActive(goal) || goal.status === 'paused';

// Nearest target date first, goals without one after, then by title.
const byTargetDate = (a: Goal, b: Goal) => {
    const dateA = a.target_date || null;
    const dateB = b.target_date || null;
    if (dateA !== dateB) {
        if (dateA === null) return 1;
        if (dateB === null) return -1;
        return dateA < dateB ? -1 : 1;
    }
    return byTitle(a, b);
};

export const buildGoalsOverview = (goals: Goal[]): GoalsOverview => {
    const keyResultsOf = new Map<string, Goal[]>();
    for (const goal of goals) {
        if (!goal.parent_goal_uid || goal.bucket) continue;
        const list = keyResultsOf.get(goal.parent_goal_uid) || [];
        list.push(goal);
        keyResultsOf.set(goal.parent_goal_uid, list);
    }
    const entries = goals
        .filter((goal) => !goal.parent_goal_uid && !goal.bucket)
        .sort(byTargetDate)
        .map((goal) => ({
            goal,
            keyResults: [...(keyResultsOf.get(goal.uid || '') || [])].sort(
                byTitle
            ),
        }));
    const wishes = goals.filter((goal) => goal.bucket).sort(byTitle);
    return {
        objectives: entries.filter((entry) => isActive(entry.goal)),
        otherObjectives: entries.filter((entry) => !isActive(entry.goal)),
        wishes: {
            have: wishes.filter((w) => w.bucket === 'have' && isOpenWish(w)),
            be: wishes.filter((w) => w.bucket === 'be' && isOpenWish(w)),
            do: wishes.filter((w) => w.bucket === 'do' && isOpenWish(w)),
        },
        doneWishes: wishes.filter((w) => !isOpenWish(w)),
    };
};

// Lower case without accents: "Écrire" is found with "ecrire".
export const foldText = (text: string) =>
    text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Mn}+/gu, '');

// Keeps what matches the query in the title or the why. An objective stays
// when it matches (with all its key results) or when one of its key results
// does (only those stay). A blank query keeps everything.
export const filterGoalsOverview = (
    overview: GoalsOverview,
    query: string
): GoalsOverview => {
    const needle = foldText(query.trim());
    if (!needle) return overview;
    const matches = (goal: Goal) =>
        foldText(goal.title).includes(needle) ||
        (!!goal.why && foldText(goal.why).includes(needle));
    const keep = (entries: ObjectiveEntry[]) =>
        entries.flatMap((entry) => {
            if (matches(entry.goal)) return [entry];
            const keyResults = entry.keyResults.filter(matches);
            return keyResults.length ? [{ ...entry, keyResults }] : [];
        });
    return {
        objectives: keep(overview.objectives),
        otherObjectives: keep(overview.otherObjectives),
        wishes: {
            have: overview.wishes.have.filter(matches),
            be: overview.wishes.be.filter(matches),
            do: overview.wishes.do.filter(matches),
        },
        doneWishes: overview.doneWishes.filter(matches),
    };
};

export const openWishCount = (overview: GoalsOverview) =>
    GOAL_BUCKETS.reduce(
        (sum, bucket) => sum + overview.wishes[bucket].length,
        0
    );

export const isOverviewEmpty = (overview: GoalsOverview) =>
    overview.objectives.length === 0 &&
    overview.otherObjectives.length === 0 &&
    overview.doneWishes.length === 0 &&
    openWishCount(overview) === 0;

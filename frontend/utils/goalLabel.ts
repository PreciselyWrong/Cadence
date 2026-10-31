import { Goal } from '../entities/Goal';

// A goal's name in a picker: a key result is shown under its objective.
export const goalLabel = (goal: Goal, goals: Goal[]): string => {
    const objective = goal.parent_goal_uid
        ? goals.find((g) => g.uid === goal.parent_goal_uid)
        : undefined;
    return objective ? `${objective.title} › ${goal.title}` : goal.title;
};

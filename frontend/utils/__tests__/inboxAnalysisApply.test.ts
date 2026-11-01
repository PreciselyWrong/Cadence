import { applyAnalysisToTask, InboxAnalysis } from '../inboxService';
import { Task } from '../../entities/Task';

const analysis = (overrides: Partial<InboxAnalysis>): InboxAnalysis => ({
    parsed_tags: [],
    parsed_projects: [],
    cleaned_content: 'Standup',
    parsed_due_date: null,
    parsed_due_time: null,
    parsed_estimated_minutes: null,
    parsed_reminder_at: null,
    parsed_date_text: null,
    parsed_recurrence: null,
    parsed_person: null,
    parsed_assignee: null,
    parsed_area: null,
    suggested_type: null,
    suggested_reason: null,
    ...overrides,
});

describe('applyAnalysisToTask', () => {
    it('keeps the time and duration of a timed recurring capture', () => {
        const task = applyAnalysisToTask(
            { name: 'Standup' } as Task,
            analysis({
                parsed_due_date: '2026-11-02',
                parsed_due_time: '09:00',
                parsed_estimated_minutes: 90,
                parsed_recurrence: {
                    recurrence_type: 'weekly',
                    recurrence_weekday: 1,
                },
            })
        );
        expect(task.due_has_time).toBe(true);
        expect(task.due_time).toBe('09:00');
        expect(task.estimated_minutes).toBe(90);
        expect(task.recurrence_type).toBe('weekly');
    });

    it('leaves the estimate alone when no duration was parsed', () => {
        const task = applyAnalysisToTask(
            { name: 'Call', estimated_minutes: 30 } as Task,
            analysis({})
        );
        expect(task.estimated_minutes).toBe(30);
    });
});

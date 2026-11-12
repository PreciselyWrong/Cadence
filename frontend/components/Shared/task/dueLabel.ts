// The due day of a task row, as Today shows it: "Today", "Tomorrow",
// "Yesterday" in sentence case, else a short weekday date in the app
// language. A day before today is late (warning tone, never red).

type Translate = (key: string, fallback: string) => string;

const shiftDay = (day: string, by: number): string => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d + by);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
};

export const shortDayLabel = (day: string, language: string): string => {
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(new Date(y, m - 1, d));
};

export const dueDayLabel = (
    dueDay: string,
    today: string,
    language: string,
    t: Translate
): string => {
    const day = dueDay.slice(0, 10);
    if (day === today) return t('tasks.today', 'Today');
    if (day === shiftDay(today, 1)) return t('today.tomorrow', 'Tomorrow');
    if (day === shiftDay(today, -1)) return t('today.yesterday', 'Yesterday');
    return shortDayLabel(day, language);
};

export const isDueLate = (
    dueDay: string | null | undefined,
    today: string,
    done: boolean
): boolean => !done && !!dueDay && dueDay.slice(0, 10) < today;

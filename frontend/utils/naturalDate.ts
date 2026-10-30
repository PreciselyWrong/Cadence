import { analyzeInboxText } from './inboxService';

export interface NaturalDate {
    date: string;
    time: string | null;
    // The words that were understood, e.g. "demain 14h"
    text: string;
}

// Reads a typed date ("demain 14h", "vendredi", "in 3 days") with the same
// server analyzer quick capture uses. Null when nothing is understood.
export const parseNaturalDate = async (
    input: string
): Promise<NaturalDate | null> => {
    const text = input.trim();
    if (!text) return null;
    try {
        const analysis = await analyzeInboxText(text, { parseDates: true });
        if (!analysis?.parsed_due_date) return null;
        return {
            date: analysis.parsed_due_date,
            time: analysis.parsed_due_time ?? null,
            text: analysis.parsed_date_text ?? text,
        };
    } catch {
        return null;
    }
};

import { getApiPath } from '../config/paths';
import { getDefaultHeaders } from './authUtils';
import type { SummaryTask } from '../components/Insights/summaryExport';

export interface SummaryResponse {
    start: string;
    end: string;
    timezone: string;
    include_open: boolean;
    completed_count: number;
    open_count: number;
    tasks: SummaryTask[];
}

export const fetchSummary = async (
    start: string,
    end: string,
    includeOpen: boolean
): Promise<SummaryResponse> => {
    const params = new URLSearchParams({
        start,
        end,
        include_open: includeOpen ? 'true' : 'false',
    });
    const response = await fetch(
        getApiPath(`reports/summary?${params.toString()}`),
        { credentials: 'include', headers: getDefaultHeaders() }
    );
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load summary');
    }
    return response.json();
};

import { getApiPath } from '../config/paths';
import { getPostHeadersWithCsrf, handleAuthResponse } from './authUtils';

export interface TodoMdRescanResult {
    projects: number;
    created: number;
    updated: number;
    removed: number;
    errors: { folder: string; code: string }[];
}

// Reads every TODO.md folder again now; the server also does it by itself
// when a file changes.
export const rescanTodoMd = async (): Promise<TodoMdRescanResult> => {
    const response = await fetch(getApiPath('todo-md/rescan'), {
        method: 'POST',
        credentials: 'include',
        headers: await getPostHeadersWithCsrf(),
    });
    await handleAuthResponse(response, 'Failed to reread the TODO.md files.');
    return response.json();
};

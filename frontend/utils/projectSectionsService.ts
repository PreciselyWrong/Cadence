import { handleAuthResponse } from './authUtils';
import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';

export interface ProjectSection {
    uid: string;
    name: string;
    position: number;
}

const base = (projectUid: string) =>
    getApiPath(`project/${encodeURIComponent(projectUid)}/sections`);

const send = async (
    url: string,
    method: string,
    body: unknown,
    errorMessage: string
): Promise<Response> => {
    const token = await getCsrfToken();
    const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-csrf-token': token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    await handleAuthResponse(response, errorMessage);
    return response;
};

export const fetchProjectSections = async (
    projectUid: string
): Promise<ProjectSection[]> => {
    const response = await fetch(base(projectUid), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    await handleAuthResponse(response, 'Failed to fetch sections.');
    return response.json();
};

export const createProjectSection = async (
    projectUid: string,
    name: string,
    position?: number
): Promise<ProjectSection> => {
    const response = await send(
        base(projectUid),
        'POST',
        { name, position },
        'Failed to create section.'
    );
    return response.json();
};

export const renameProjectSection = async (
    projectUid: string,
    sectionUid: string,
    name: string
): Promise<ProjectSection> => {
    const response = await send(
        `${base(projectUid)}/${encodeURIComponent(sectionUid)}`,
        'PATCH',
        { name },
        'Failed to rename section.'
    );
    return response.json();
};

export const reorderProjectSections = async (
    projectUid: string,
    sectionUids: string[]
): Promise<ProjectSection[]> => {
    const response = await send(
        `${base(projectUid)}/order`,
        'PUT',
        { section_uids: sectionUids },
        'Failed to reorder sections.'
    );
    return response.json();
};

export const deleteProjectSection = async (
    projectUid: string,
    sectionUid: string
): Promise<void> => {
    await send(
        `${base(projectUid)}/${encodeURIComponent(sectionUid)}`,
        'DELETE',
        undefined,
        'Failed to delete section.'
    );
};

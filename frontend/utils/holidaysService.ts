import { handleAuthResponse, getDefaultHeaders } from './authUtils';
import { getApiPath } from '../config/paths';

export interface HolidayPlace {
    code: string;
    name: string;
}

export interface Holiday {
    date: string;
    name: string;
}

const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(getApiPath(path), {
        credentials: 'include',
        headers: getDefaultHeaders(),
    });
    await handleAuthResponse(response, 'Could not load holidays.');
    return response.json();
};

export const fetchHolidayCountries = async () =>
    (await get<{ countries: HolidayPlace[] }>('holidays/countries')).countries;

export const fetchHolidayRegions = async (country: string) =>
    (
        await get<{ regions: HolidayPlace[] }>(
            `holidays/regions?country=${encodeURIComponent(country)}`
        )
    ).regions;

export const fetchHolidays = async (
    country: string,
    region: string,
    start: string,
    end: string
) => {
    const params = new URLSearchParams({ country, start, end });
    if (region) params.set('region', region);
    return (await get<{ holidays: Holiday[] }>(`holidays?${params}`)).holidays;
};

import {
    CadenceHabitError,
    createCadenceHabit,
    createRow,
    deleteCadenceHabit,
    deleteRow,
    fetchCadenceGroups,
    fetchCadenceHabit,
    fetchCadenceHabits,
    fetchEntries,
    fetchRows,
    updateCadenceHabit,
    updateRow,
} from '../cadenceHabitsService';

jest.mock('../csrfService', () => ({
    getCsrfToken: async () => 'csrf-token',
}));

const respond = (status: number, body: unknown) =>
    ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }) as unknown as Response;

describe('cadenceHabitsService', () => {
    const originalFetch = global.fetch;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });

    const lastCall = () =>
        fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

    it('lists the habits of a date, archived or not', async () => {
        fetchMock.mockResolvedValue(
            respond(200, { date: '2026-10-05', timezone: 'UTC', habits: [] })
        );
        await fetchCadenceHabits({ archived: true, date: '2026-10-05' });
        const [url, init] = lastCall();
        expect(url).toContain('/cadence/habits?');
        expect(url).toContain('archived=true');
        expect(url).toContain('date=2026-10-05');
        expect(init.credentials).toBe('include');
    });

    it('lists without query when no option is given', async () => {
        fetchMock.mockResolvedValue(respond(200, { habits: [] }));
        await fetchCadenceHabits();
        expect(lastCall()[0]).toMatch(/\/cadence\/habits$/);
    });

    it('reads one habit and the groups', async () => {
        fetchMock.mockResolvedValue(respond(200, { uid: 'h1' }));
        await fetchCadenceHabit('h1', '2026-10-05');
        expect(lastCall()[0]).toContain('/cadence/habits/h1?date=2026-10-05');
        fetchMock.mockResolvedValue(respond(200, []));
        await fetchCadenceGroups();
        expect(lastCall()[0]).toMatch(/\/cadence\/groups$/);
    });

    it('creates a habit with a CSRF token and an idempotency key', async () => {
        fetchMock.mockResolvedValue(respond(201, { uid: 'h1' }));
        const body = { name: 'Lire', goal: { target_minor: 1 } };
        await createCadenceHabit(body as never);
        const [url, init] = lastCall();
        expect(url).toMatch(/\/cadence\/habits$/);
        expect(init.method).toBe('POST');
        expect(init.headers['x-csrf-token']).toBe('csrf-token');
        expect(init.headers['Idempotency-Key']).toEqual(expect.any(String));
        expect(JSON.parse(init.body)).toEqual(body);
    });

    it('patches and deletes a habit', async () => {
        fetchMock.mockResolvedValue(respond(200, { uid: 'h1' }));
        await updateCadenceHabit('h1', { archived: true });
        expect(lastCall()[1].method).toBe('PATCH');
        expect(JSON.parse(lastCall()[1].body)).toEqual({ archived: true });
        fetchMock.mockResolvedValue(respond(200, { deleted: true }));
        await deleteCadenceHabit('h1');
        expect(lastCall()[1].method).toBe('DELETE');
    });

    it('lists the entries of a range', async () => {
        fetchMock.mockResolvedValue(respond(200, []));
        await fetchEntries('h1', { from: '2026-10-01', to: '2026-10-31' });
        expect(lastCall()[0]).toContain(
            '/cadence/habits/h1/entries?from=2026-10-01&to=2026-10-31'
        );
    });

    it('lists the rows of a collection', async () => {
        fetchMock.mockResolvedValue(respond(200, []));
        await fetchRows('h1', 'quick-values');
        expect(lastCall()[0]).toMatch(/\/cadence\/habits\/h1\/quick-values$/);
    });

    it('adds, edits and removes rows that hang from a habit', async () => {
        fetchMock.mockResolvedValue(respond(201, { uid: 'e1' }));
        await createRow('h1', 'entries', { value_minor: 5 });
        expect(lastCall()[0]).toMatch(/\/cadence\/habits\/h1\/entries$/);
        expect(lastCall()[1].method).toBe('POST');

        fetchMock.mockResolvedValue(respond(200, { uid: 'e1' }));
        await updateRow('h1', 'quick-values', 'q1', { label: 'x' });
        expect(lastCall()[0]).toMatch(/\/h1\/quick-values\/q1$/);
        expect(lastCall()[1].method).toBe('PATCH');

        fetchMock.mockResolvedValue(respond(200, { deleted: true }));
        await deleteRow('h1', 'pauses', 'p1');
        expect(lastCall()[0]).toMatch(/\/h1\/pauses\/p1$/);
        expect(lastCall()[1].method).toBe('DELETE');
    });

    it('raises the server code of a refused write', async () => {
        fetchMock.mockResolvedValue(
            respond(400, { error: 'invalid_value:target_minor' })
        );
        const error = await updateCadenceHabit('h1', {}).catch((e) => e);
        expect(error).toBeInstanceOf(CadenceHabitError);
        expect(error.code).toBe('invalid_value:target_minor');
        expect(error.status).toBe(400);
    });

    it('raises on a failed read', async () => {
        fetchMock.mockResolvedValue(respond(500, {}));
        await expect(fetchCadenceHabits()).rejects.toBeInstanceOf(
            CadenceHabitError
        );
    });
});

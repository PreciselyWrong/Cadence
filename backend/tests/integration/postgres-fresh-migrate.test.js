// A brand-new PostgreSQL database goes through scripts/db-prepare.js, then
// `npm run db:migrate` (scripts/db-migrate.js), exactly as an operator would.
// The baseline recorded by db-prepare must be the one the migration runner
// reads: otherwise every historical migration replays on PostgreSQL, where
// their SQLite-only SQL fails. Runs on its own throwaway database, only when
// the suite targets PostgreSQL.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { isPostgres } = require('../../utils/db-dialect');

const run = promisify(execFile);
const describeOnPostgres = isPostgres() ? describe : describe.skip;

const BACKEND = path.join(__dirname, '..', '..');
const MIGRATION_FILES = fs
    .readdirSync(path.join(BACKEND, 'migrations'))
    .filter((file) => file.endsWith('.js'))
    .sort();

describeOnPostgres(
    'Fresh PostgreSQL install: db-prepare then db:migrate',
    () => {
        const name = `cadence_fresh_migrate_${process.pid}`;
        let admin;
        let db;
        let env;

        const adminClient = (database) => {
            const { Client } = require('pg');
            const {
                resolveDatabaseSettings,
            } = require('../../config/database-settings');
            const settings = resolveDatabaseSettings(process.env, null);
            return new Client({
                host: settings.host,
                port: settings.port,
                user: settings.username,
                password: settings.password,
                database,
                ssl: settings.ssl
                    ? { rejectUnauthorized: settings.ssl.rejectUnauthorized }
                    : undefined,
            });
        };

        const script = (file, args = []) =>
            run('node', [path.join('scripts', file), ...args], {
                cwd: BACKEND,
                env,
                maxBuffer: 64 * 1024 * 1024,
            });

        const recorded = async (table) => {
            const { rows } = await db.query(`SELECT name FROM "${table}"`);
            return rows.map((row) => row.name).sort();
        };

        beforeAll(async () => {
            admin = adminClient(process.env.DB_ADMIN_DATABASE || 'postgres');
            await admin.connect();
            await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
            await admin.query(`CREATE DATABASE "${name}"`);

            const url = new URL(process.env.DATABASE_URL);
            url.pathname = `/${name}`;
            env = { ...process.env, DATABASE_URL: url.toString() };
            delete env.DB_NAME;

            db = adminClient(name);
            await db.connect();
        }, 60000);

        afterAll(async () => {
            if (db) await db.end();
            if (admin) {
                await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
                await admin.end();
            }
        });

        it('runs twice without replaying the baseline and leaves status up to date', async () => {
            await script('db-prepare.js');
            expect(await recorded('SequelizeMeta')).toEqual(MIGRATION_FILES);

            for (let pass = 0; pass < 2; pass++) {
                await script('db-prepare.js');
                const { stdout } = await script('db-migrate.js');
                expect(stdout).toContain('No pending migrations');
            }

            expect(await recorded('SequelizeMeta')).toEqual(MIGRATION_FILES);
            const { rows } = await db.query(
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'sequelize_meta'"
            );
            expect(rows).toHaveLength(0);

            const { stdout: status } = await run(
                'npx',
                [
                    'sequelize-cli',
                    'db:migrate:status',
                    '--config',
                    'config/database.js',
                ],
                { cwd: BACKEND, env, maxBuffer: 64 * 1024 * 1024 }
            );
            expect(status).not.toMatch(/^down /m);
            expect(status.match(/^up /gm)).toHaveLength(MIGRATION_FILES.length);
        }, 240000);

        it('runs a migration added after the baseline and records it', async () => {
            const latest = MIGRATION_FILES[MIGRATION_FILES.length - 1];
            await db.query('DELETE FROM "SequelizeMeta" WHERE name = $1', [
                latest,
            ]);

            const { stdout } = await script('db-migrate.js');
            expect(stdout).toContain('Found 1 pending migration(s)');
            expect(stdout).toContain(latest);
            expect(await recorded('SequelizeMeta')).toEqual(MIGRATION_FILES);
        }, 120000);
    }
);

#!/usr/bin/env node
'use strict';

try {
    require('dotenv').config();
} catch (_) {}

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
}
if (!process.env.SEQUELIZE_LOGGING) {
    process.env.SEQUELIZE_LOGGING = 'false';
}

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const Umzug = require('umzug');
const { Op, Sequelize } = require('sequelize');

const models = require('../models');
const { createApiToken } = require('../modules/users/apiTokenService');
const dailyPlanService = require('../modules/daily-plan/service');
const cadenceHabitsWrite = require('../modules/habits/cadence/operations/write');
const goalsService = require('../modules/goals/service');
const peopleService = require('../modules/people/service');
const focusSessionsService = require('../modules/focus-sessions/service');
const relationsService = require('../modules/tasks/relations/service');
const commentsService = require('../modules/comments/service');
const linksRepository = require('../modules/links/repository');
const { normalizeUrl, classifyKind } = require('../modules/links/core/urls');
const mailService = require('../modules/triage/mail');
const decisionsService = require('../modules/decisions/service');
const proposalsService = require('../modules/proposals/service');
const { proposeCareer } = require('../modules/proposals/career');

const DEMO_EMAIL = 'demo@cadence.test';
const DEMO_PASSWORD = 'demodemo';
const DEMO_NAME = 'Sam Carter';
const TIMEZONE = 'Europe/Paris';

const {
    sequelize,
    User,
    Role,
    Area,
    Project,
    Task,
    Tag,
    Note,
    InboxItem,
    Goal,
    Person,
    ApiToken,
    Comment,
    TaskEvent,
    TaskRelation,
    FocusSession,
    DailyPlan,
    DailyPlanItem,
    Link,
    LinkPreview,
    MailItem,
    MailSenderRule,
    AgentDecision,
    Habit,
    HabitGroup,
    HabitGoal,
    HabitSchedule,
    HabitEntry,
    HabitPause,
    HabitQuickValue,
    HabitReminder,
    HabitTimer,
    AbstinenceLog,
    SyncChange,
    SyncOp,
    SyncConflict,
    View,
    Proposal,
    Notification,
} = models;

function parisNow() {
    return moment.tz(TIMEZONE);
}

function dayStr(offsetDays) {
    return parisNow().add(offsetDays, 'days').format('YYYY-MM-DD');
}

function atLocal(offsetDays, hour = 9, minute = 0) {
    return parisNow()
        .add(offsetDays, 'days')
        .hour(hour)
        .minute(minute)
        .second(0)
        .millisecond(0)
        .toDate();
}

function startOfDayLocal(offsetDays) {
    return parisNow().add(offsetDays, 'days').startOf('day').toDate();
}

function endOfDayLocal(offsetDays) {
    return parisNow().add(offsetDays, 'days').endOf('day').toDate();
}

async function ensureSchema() {
    const queryInterface = sequelize.getQueryInterface();
    const tables = (await queryInterface.showAllTables()).map(String);
    if (!tables.includes('users')) {
        await sequelize.sync();
    }

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (fs.existsSync(migrationsDir)) {
        const umzug = new Umzug({
            migrations: {
                path: migrationsDir,
                params: [queryInterface, Sequelize],
            },
            storage: 'sequelize',
            storageOptions: { sequelize, tableName: 'SequelizeMeta' },
        });
        const pending = await umzug.pending();
        if (pending.length > 0) {
            await umzug.up();
        }
    }
}

async function wipeUserData(userId) {
    const where = { user_id: userId };

    const userTasks = await Task.findAll({
        where,
        attributes: ['id'],
        paranoid: false,
    });
    const taskIds = userTasks.map((t) => t.id);

    if (taskIds.length > 0) {
        await TaskRelation.destroy({
            where: {
                [Op.or]: [
                    { source_task_id: { [Op.in]: taskIds } },
                    { target_task_id: { [Op.in]: taskIds } },
                ],
            },
        });
        await Comment.destroy({
            where: { task_id: { [Op.in]: taskIds } },
            force: true,
        });
    }

    await TaskEvent.destroy({ where });
    await FocusSession.destroy({ where });

    const plans = await DailyPlan.findAll({ where, attributes: ['id'] });
    const planIds = plans.map((p) => p.id);
    if (planIds.length > 0) {
        await DailyPlanItem.destroy({
            where: { daily_plan_id: { [Op.in]: planIds } },
        });
    }
    await DailyPlan.destroy({ where });

    await HabitEntry.destroy({ where });
    await HabitQuickValue.destroy({ where });
    await HabitReminder.destroy({ where });
    await HabitPause.destroy({ where });
    await HabitTimer.destroy({ where });
    await AbstinenceLog.destroy({ where });
    await HabitGoal.destroy({ where });
    await HabitSchedule.destroy({ where });
    await Habit.destroy({ where });
    await HabitGroup.destroy({ where });

    await MailItem.destroy({ where });
    await MailSenderRule.destroy({ where });
    await AgentDecision.destroy({ where });

    await Link.destroy({ where });
    await View.destroy({ where });
    await Proposal.destroy({ where });
    await Notification.destroy({ where });

    // Clear parent links before deleting tasks, projects, goals, tags.
    await Task.update(
        { parent_task_id: null, recurring_parent_id: null },
        { where, paranoid: false }
    );
    await Task.destroy({ where, force: true });

    await Note.destroy({ where, force: true });
    await InboxItem.destroy({ where, force: true });

    await Project.update(
        { parent_project_id: null, next_task_uid: null },
        { where, paranoid: false }
    );
    await Project.destroy({ where, force: true });

    await Goal.destroy({
        where: { ...where, parent_goal_id: { [Op.ne]: null } },
    });
    await Goal.destroy({ where });

    await Tag.update({ parent_id: null }, { where });
    await Tag.destroy({ where });

    await Area.destroy({ where });
    await Person.destroy({ where });
    await ApiToken.destroy({ where });

    if (SyncChange) await SyncChange.destroy({ where });
    if (SyncOp) await SyncOp.destroy({ where });
    if (SyncConflict) await SyncConflict.destroy({ where });
}

async function ensureDemoUser() {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    let user = await User.findOne({ where: { email: DEMO_EMAIL } });

    if (!user) {
        user = await User.create({
            email: DEMO_EMAIL,
            password_digest: passwordHash,
            name: DEMO_NAME,
            language: 'en',
            timezone: TIMEZONE,
            appearance: 'light',
            email_verified: true,
            onboarded_at: new Date(),
            onboarding_starter: 'empty',
        });
    } else {
        await wipeUserData(user.id);
        await user.update({
            password_digest: passwordHash,
            name: DEMO_NAME,
            language: 'en',
            timezone: TIMEZONE,
            appearance: 'light',
            email_verified: true,
            onboarded_at: new Date(),
            onboarding_starter: 'empty',
            ui_settings: null,
        });
    }

    const [role] = await Role.findOrCreate({
        where: { user_id: user.id },
        defaults: { user_id: user.id, is_admin: true },
    });
    if (!role.is_admin) {
        await role.update({ is_admin: true });
    }

    const { rawToken } = await createApiToken({
        userId: user.id,
        name: 'Android Emulator Demo',
    });

    return { user, rawToken };
}

async function seedAreas(userId) {
    const defs = [
        {
            name: 'Work',
            description: 'Product, design and client deliverables',
        },
        {
            name: 'Home',
            description: 'Renovations, chores and getaways',
        },
        {
            name: 'Health',
            description: 'Sport, sleep and balance',
        },
        {
            name: 'Learning',
            description: 'Languages, reading and design watch',
        },
    ];

    const areas = {};
    for (const def of defs) {
        areas[def.name] = await Area.create({ ...def, user_id: userId });
    }
    return areas;
}

async function seedTags(userId) {
    const names = [
        'call',
        'errands',
        'waiting',
        'quick',
        'reading',
        'code',
        'code/frontend',
    ];
    const tags = {};
    for (const name of names) {
        tags[name] = await Tag.create({ name, user_id: userId });
    }
    return tags;
}

async function seedPeople(userId) {
    const defs = [
        {
            name: 'Luke Bennett',
            relationship_type: 'work',
            email: 'luke.bennett@example.com',
            notes: 'Lead front-end developer on the app v2 project',
        },
        {
            name: 'Sophie Lawrence',
            relationship_type: 'friend',
            email: 'sophie.lawrence@example.com',
            notes: 'Sunday morning running partner',
        },
        {
            name: 'Mark Morgan',
            relationship_type: 'family',
            email: 'mark.morgan@example.com',
            notes: 'Planning the weekend in Brittany',
        },
    ];

    const people = {};
    for (const def of defs) {
        people[def.name] = await peopleService.create(userId, def);
    }
    return people;
}

async function seedGoals(userId, areas) {
    const thisMonthEnd = parisNow().endOf('month').format('YYYY-MM-DD');
    const quarterEnd = parisNow().endOf('quarter').format('YYYY-MM-DD');

    const objLaunch = await goalsService.create(userId, {
        title: 'Ship the client v2 on time',
        why: 'Stabilize the product foundation before quarter end',
        area_id: areas.Work.id,
        horizon: 'quarter',
        target_date: quarterEnd,
        status: 'active',
    });

    const krTimeline = await goalsService.create(userId, {
        title: 'Finish the Pricing mockups and specs',
        area_id: areas.Work.id,
        horizon: 'month',
        target_date: thisMonthEnd,
        parent_goal_uid: objLaunch.uid,
    });

    const objRun = await goalsService.create(userId, {
        title: 'Run the half marathon in under 1:50',
        why: 'Rebuild a steady endurance base',
        area_id: areas.Health.id,
        horizon: 'quarter',
        target_date: quarterEnd,
        status: 'active',
    });

    const krVolume = await goalsService.create(userId, {
        title: 'Keep up 3 sessions a week for 6 weeks',
        area_id: areas.Health.id,
        horizon: 'month',
        target_date: thisMonthEnd,
        parent_goal_uid: objRun.uid,
    });

    const objPt = await goalsService.create(userId, {
        title: 'Hold a 15-minute conversation in Portuguese',
        why: 'Get ready for the trip to Porto',
        area_id: areas.Learning.id,
        horizon: 'month',
        target_date: thisMonthEnd,
        status: 'active',
    });

    const bucket1 = await goalsService.create(userId, {
        title: 'Cycle across Brittany on the Vélodyssée',
        area_id: areas.Home.id,
        bucket: 'do',
    });

    const bucket2 = await goalsService.create(userId, {
        title: 'Be at ease speaking Portuguese',
        area_id: areas.Learning.id,
        bucket: 'be',
    });

    return {
        objectives: [objLaunch, objRun, objPt],
        keyResults: [krTimeline, krVolume],
        bucketItems: [bucket1, bucket2],
    };
}

async function seedProjects(userId, areas, goals) {
    const refonte = await Project.create({
        name: 'Client website redesign',
        description: 'New visual identity, key pages and performance',
        area_id: areas.Work.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(25, 18),
        goal_id: goals.objectives[0].id,
    });

    const tarifs = await Project.create({
        name: 'New Pricing page',
        description: 'Clear grid, FAQ and annual vs monthly comparison',
        area_id: areas.Work.id,
        parent_project_id: refonte.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(10, 18),
        goal_id: goals.keyResults[0].id,
    });

    const accueil = await Project.create({
        name: 'Home page',
        description: 'New hero banner, social proof and call to action',
        area_id: areas.Work.id,
        parent_project_id: refonte.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(18, 18),
    });

    const blog = await Project.create({
        name: 'Blog and news',
        description: 'Article template, RSS feed and migration of old posts',
        area_id: areas.Work.id,
        parent_project_id: refonte.id,
        user_id: userId,
        status: 'planned',
        due_date_at: atLocal(24, 18),
    });

    const appV2 = await Project.create({
        name: 'Launch of app v2',
        description: 'Design coordination, mobile QA and release',
        area_id: areas.Work.id,
        user_id: userId,
        status: 'in_progress',
        start_date_at: startOfDayLocal(-3),
        due_date_at: atLocal(28, 18),
        goal_id: goals.objectives[0].id,
    });

    const cuisine = await Project.create({
        name: 'Kitchen renovation',
        description: 'Countertop quote, plumbing and cabinet installation',
        area_id: areas.Home.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(40, 18),
    });

    const bretagne = await Project.create({
        name: 'Brittany trip',
        description: 'Lodging, coastal route and logistics',
        area_id: areas.Home.id,
        user_id: userId,
        status: 'planned',
        due_date_at: atLocal(55, 18),
    });

    const marathon = await Project.create({
        name: 'Spring marathon',
        description: '12-week training plan',
        area_id: areas.Health.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(60, 18),
        goal_id: goals.objectives[1].id,
    });

    const portugais = await Project.create({
        name: 'Learn Portuguese',
        description: 'Weekly lessons and daily vocabulary',
        area_id: areas.Learning.id,
        user_id: userId,
        status: 'in_progress',
        goal_id: goals.objectives[2].id,
    });

    const podcast = await Project.create({
        name: 'Product design podcast',
        description: 'Audio note series on hold for the quarter',
        area_id: areas.Learning.id,
        user_id: userId,
        status: 'paused',
    });

    return {
        refonte,
        tarifs,
        accueil,
        blog,
        appV2,
        cuisine,
        bretagne,
        marathon,
        portugais,
        podcast,
    };
}

async function seedProjectPages(userId, projects) {
    const pages = [
        {
            url: 'https://github.com/tailwindlabs/tailwindcss',
            title: 'Tailwind CSS: utilities and design tokens',
            description:
                'Utility-first CSS framework used for the new client site components.',
            site_name: 'GitHub',
            kind: 'repo',
            github_stars: 85400,
            github_language: 'TypeScript',
            note: 'Reference for the Pricing page grid',
        },
        {
            url: 'https://en.wikipedia.org/wiki/Design_system',
            title: 'Design system · Wikipedia',
            description:
                'Principles of consistency, reusable components and living documentation.',
            site_name: 'Wikipedia',
            kind: 'article',
            note: 'Reread before the component review',
        },
        {
            url: 'https://example.com/accessibility-contrast-guide',
            title: 'Practical guide to WCAG AA contrast',
            description:
                'Quick checklist to check the legibility of buttons and badges.',
            site_name: 'Example Design',
            kind: 'article',
            note: 'Check contrast in light mode',
        },
    ];

    const createdLinks = [];
    for (const page of pages) {
        const normalized = normalizeUrl(page.url);
        const now = new Date();
        const link = await linksRepository.create({
            user_id: userId,
            url: normalized,
            kind: page.kind || classifyKind(normalized),
            title: page.title,
            description: page.description,
            site_name: page.site_name,
            github_stars: page.github_stars ?? null,
            github_language: page.github_language ?? null,
            note: page.note,
            project_id: projects.refonte.id,
            fetch_status: 'done',
            fetched_at: now,
        });
        await LinkPreview.findOrCreate({
            where: { url: normalized },
            defaults: {
                url: normalized,
                title: page.title,
                description: page.description,
                site_name: page.site_name,
                kind: page.kind || classifyKind(normalized),
                github_stars: page.github_stars ?? null,
                github_language: page.github_language ?? null,
                fetch_status: 'done',
                fetched_at: now,
            },
        });
        createdLinks.push(link);
    }
    return createdLinks;
}

async function createTaskWithTags(userId, data, tagNames, tagsMap) {
    const task = await Task.create({
        user_id: userId,
        ...data,
    });
    if (tagNames && tagNames.length > 0) {
        await task.setTags(tagNames.map((n) => tagsMap[n].id));
    }
    return task;
}

async function seedTasksAndRelations(
    userId,
    areas,
    projects,
    tags,
    goals,
    people
) {
    const thisWeekStart = parisNow().startOf('isoWeek').format('YYYY-MM-DD');
    const nextWeekStart = parisNow()
        .add(1, 'week')
        .startOf('isoWeek')
        .format('YYYY-MM-DD');
    const thisMonthStart = parisNow().startOf('month').format('YYYY-MM-DD');
    const nextMonthStart = parisNow()
        .add(1, 'month')
        .startOf('month')
        .format('YYYY-MM-DD');

    const createdTasks = [];
    const add = async (data, tagNames = []) => {
        const t = await createTaskWithTags(userId, data, tagNames, tags);
        createdTasks.push(t);
        return t;
    };

    // --- Overdue (3) ---
    await add(
        {
            name: 'Follow up with the plumber about the visit date',
            project_id: projects.cuisine.id,
            area_id: areas.Home.id,
            due_date: endOfDayLocal(-3),
            priority: 2,
            estimated_minutes: 15,
        },
        ['call', 'waiting']
    );
    await add(
        {
            name: 'Approve the home page copy',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(-2),
            priority: 2,
            estimated_minutes: 45,
        },
        ['quick']
    );
    await add(
        {
            name: 'Send the deposit invoice to the client',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(-1),
            priority: 1,
            estimated_minutes: 20,
        },
        ['quick']
    );

    // --- Due today (8, with 3 timed) ---
    const todayTimed1 = await add(
        {
            name: 'Weekly design sync with Luke',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            due_date: atLocal(0, 9, 30),
            due_has_time: true,
            priority: 2,
            estimated_minutes: 60,
        },
        ['call']
    );
    const todayTimed2 = await add(
        {
            name: 'Finalize the annual pricing grid',
            project_id: projects.tarifs.id,
            area_id: areas.Work.id,
            due_date: atLocal(0, 14, 0),
            due_has_time: true,
            priority: 2,
            estimated_minutes: 90,
            goal_id: goals.keyResults[0].id,
        },
        ['code/frontend']
    );
    const todayTimed3 = await add(
        {
            name: 'Call the carpenter about the kitchen fronts',
            project_id: projects.cuisine.id,
            area_id: areas.Home.id,
            due_date: atLocal(0, 16, 30),
            due_has_time: true,
            priority: 1,
            estimated_minutes: 20,
        },
        ['call']
    );

    const todayUntimed1 = await add(
        {
            name: 'Compress the site hero images',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(0),
            priority: 1,
            estimated_minutes: 30,
        },
        ['quick']
    );
    const todayUntimed2 = await add(
        {
            name: 'Prepare the 3 user test questions',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(0),
            priority: 1,
            estimated_minutes: 45,
        },
        ['code']
    );
    const todayUntimed3 = await add(
        {
            name: 'Buy warm LED bulbs and coffee',
            area_id: areas.Home.id,
            due_date: endOfDayLocal(0),
            priority: 0,
            estimated_minutes: 25,
        },
        ['errands']
    );
    const todayUntimed4 = await add(
        {
            name: 'Review irregular present-tense verbs',
            project_id: projects.portugais.id,
            area_id: areas.Learning.id,
            due_date: endOfDayLocal(0),
            priority: 0,
            estimated_minutes: 20,
            goal_id: goals.objectives[2].id,
        },
        ['reading']
    );
    await add(
        {
            name: 'Interval run 8 × 400 m with Sophie',
            project_id: projects.marathon.id,
            area_id: areas.Health.id,
            due_date: endOfDayLocal(0),
            priority: 1,
            estimated_minutes: 60,
            goal_id: goals.keyResults[1].id,
        },
        []
    );

    // --- Tomorrow & this week (5) ---
    await add(
        {
            name: 'Confirm the quartz countertop quote',
            project_id: projects.cuisine.id,
            area_id: areas.Home.id,
            due_date: endOfDayLocal(1),
            priority: 2,
            estimated_minutes: 30,
        },
        ['waiting']
    );
    await add(
        {
            name: 'Contrast review on the light theme',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(1),
            priority: 1,
            estimated_minutes: 45,
        },
        ['code/frontend']
    );
    await add(
        {
            name: 'Book two Portuguese lessons for next week',
            project_id: projects.portugais.id,
            area_id: areas.Learning.id,
            due_date: endOfDayLocal(2),
            priority: 0,
            estimated_minutes: 15,
        },
        ['quick']
    );
    await add(
        {
            name: 'Compare cottages near Crozon',
            project_id: projects.bretagne.id,
            area_id: areas.Home.id,
            due_date: endOfDayLocal(3),
            priority: 1,
            estimated_minutes: 60,
        },
        []
    );
    await add(
        {
            name: 'Long run 16 km at easy pace',
            project_id: projects.marathon.id,
            area_id: areas.Health.id,
            due_date: endOfDayLocal(4),
            priority: 1,
            estimated_minutes: 105,
            goal_id: goals.keyResults[1].id,
        },
        []
    );

    // --- Launch of app v2 timeline tasks (5 tasks spread over 4 weeks + 3 blocks) ---
    const tlAudit = await add(
        {
            name: 'Audit the iOS and Android screens',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            start_date: startOfDayLocal(-2),
            due_date: endOfDayLocal(3),
            priority: 2,
            estimated_minutes: 120,
        },
        ['code']
    );
    const tlProto = await add(
        {
            name: 'Interactive prototype of the new onboarding',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            start_date: startOfDayLocal(4),
            due_date: endOfDayLocal(10),
            priority: 2,
            estimated_minutes: 120,
        },
        ['code/frontend']
    );
    const tlQa = await add(
        {
            name: 'Full offline acceptance test with Luke',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            start_date: startOfDayLocal(11),
            due_date: endOfDayLocal(17),
            priority: 1,
            estimated_minutes: 90,
        },
        ['code']
    );
    const tlStore = await add(
        {
            name: 'Prepare Play Store screenshots and release notes',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            start_date: startOfDayLocal(18),
            due_date: endOfDayLocal(22),
            priority: 1,
            estimated_minutes: 60,
        },
        []
    );
    await add(
        {
            name: 'Staged rollout of v2.0 (10% then 100%)',
            project_id: projects.appV2.id,
            area_id: areas.Work.id,
            start_date: startOfDayLocal(23),
            due_date: endOfDayLocal(27),
            priority: 2,
            estimated_minutes: 60,
        },
        ['code']
    );

    await relationsService.createRelation({
        task: tlAudit,
        targetUid: tlProto.uid,
        type: 'blocks',
        userId,
    });
    await relationsService.createRelation({
        task: tlProto,
        targetUid: tlQa.uid,
        type: 'blocks',
        userId,
    });
    await relationsService.createRelation({
        task: tlQa,
        targetUid: tlStore.uid,
        type: 'blocks',
        userId,
    });

    // --- Horizons: week_of, in_view_at, month_of, undated (6) ---
    await add(
        {
            name: 'Update the running gear sheet',
            project_id: projects.marathon.id,
            area_id: areas.Health.id,
            week_of: thisWeekStart,
            priority: 0,
            estimated_minutes: 20,
        },
        ['quick']
    );
    await add(
        {
            name: 'Prepare the kitchen electrical outlet list',
            project_id: projects.cuisine.id,
            area_id: areas.Home.id,
            week_of: nextWeekStart,
            priority: 1,
            estimated_minutes: 30,
        },
        []
    );
    await add(
        {
            name: 'Write the case study for the client redesign',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            in_view_at: new Date(),
            priority: 0,
            estimated_minutes: 90,
        },
        ['reading']
    );
    await add(
        {
            name: 'Book train tickets to Quimper',
            project_id: projects.bretagne.id,
            area_id: areas.Home.id,
            month_of: thisMonthStart,
            priority: 1,
            estimated_minutes: 30,
        },
        []
    );
    await add(
        {
            name: 'Renew the public library card',
            area_id: areas.Learning.id,
            month_of: nextMonthStart,
            priority: 0,
            estimated_minutes: 15,
        },
        ['quick']
    );
    await add(
        {
            name: 'Sort last year’s photos',
            area_id: areas.Home.id,
            priority: 0,
            estimated_minutes: 60,
        },
        []
    );

    // --- Recurring tasks (2) ---
    await add(
        {
            name: 'Clear the inbox and sort the captures',
            area_id: areas.Work.id,
            due_date: endOfDayLocal(0),
            recurrence_type: 'daily',
            recurrence_interval: 1,
            priority: 0,
            estimated_minutes: 15,
        },
        ['quick']
    );
    await add(
        {
            name: 'Weekly review and plan for the week',
            area_id: areas.Work.id,
            due_date: endOfDayLocal(3),
            recurrence_type: 'weekly',
            recurrence_interval: 1,
            recurrence_weekdays: [5],
            priority: 1,
            estimated_minutes: 30,
        },
        []
    );

    // --- Tasks with subtasks (3 parents + 7 subtasks) ---
    const parent1 = await add(
        {
            name: 'Prepare the Tuesday client presentation',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(2),
            priority: 2,
            estimated_minutes: 90,
            note: 'Audience: the client’s steering committee, a short slot with time for questions.\n\n- Start from the redesign results, not the technical detail\n- Show the three before/after screens\n- End on the delivery schedule',
        },
        ['quick', 'waiting']
    );
    await add({
        name: 'Export the Figma screens in high resolution',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 1,
        status: Task.STATUS.DONE,
        completed_at: atLocal(-1, 16),
    });
    await add({
        name: 'Write the outline of the 5 key slides',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 2,
    });
    await add({
        name: 'Check the conversion figures before sending',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 3,
    });

    const parent2 = await add(
        {
            name: 'Plan the Brittany weekend with Mark',
            project_id: projects.bretagne.id,
            area_id: areas.Home.id,
            due_date: endOfDayLocal(5),
            priority: 1,
            estimated_minutes: 45,
        },
        []
    );
    await add({
        name: 'List 3 accessible coastal walks',
        parent_task_id: parent2.id,
        project_id: projects.bretagne.id,
        order: 1,
        status: Task.STATUS.DONE,
        completed_at: atLocal(0, 8, 30),
    });
    await add({
        name: 'Check the tide times',
        parent_task_id: parent2.id,
        project_id: projects.bretagne.id,
        order: 2,
    });

    const parent3 = await add(
        {
            name: 'Set up allergy and prescription tracking',
            area_id: areas.Health.id,
            due_date: endOfDayLocal(6),
            priority: 0,
            estimated_minutes: 30,
        },
        []
    );
    await add({
        name: 'Book an appointment with the family doctor',
        parent_task_id: parent3.id,
        order: 1,
    });
    await add({
        name: 'Scan the health insurance card',
        parent_task_id: parent3.id,
        order: 2,
    });

    // --- Sub-project board of "Client website redesign" ---
    const boardTasks = [
        ['accueil', 'Mock up the new hero banner', 2],
        ['accueil', 'Write the three customer testimonials', 1],
        ['accueil', 'Wire up the call-to-action button', 1],
        ['blog', 'Design the article template', 1],
        ['blog', 'Migrate the ten old posts', 0],
    ];
    for (const [key, name, priority] of boardTasks) {
        await add({
            name,
            project_id: projects[key].id,
            area_id: areas.Work.id,
            priority,
        });
    }

    // --- Link tasks (2) ---
    await add(
        {
            name: 'Read: Architecture of modern design systems',
            project_id: projects.refonte.id,
            area_id: areas.Learning.id,
            source: 'web',
            source_url: 'https://example.com/architecture-design-systems',
            priority: 0,
            estimated_minutes: 25,
        },
        ['reading']
    );
    await add(
        {
            name: 'Watch: Fluid typography and legibility on mobile',
            project_id: projects.tarifs.id,
            area_id: areas.Learning.id,
            source: 'web',
            source_url: 'https://example.com/fluid-typography-mobile',
            priority: 0,
            estimated_minutes: 35,
        },
        ['reading']
    );

    // --- Completed yesterday / today (6 more, plus 2 subtasks above = 8) ---
    const completedSpecs = [
        ['Send the exact kitchen measurements', projects.cuisine.id, -1],
        ['Update the sidebar icons', projects.appV2.id, -1],
        ['Fix card alignment on mobile', projects.tarifs.id, -1],
        ['Refill water and prepare the running kit', projects.marathon.id, -1],
        ['Reread Portuguese grammar lesson 3', projects.portugais.id, 0],
        ['Reply to the building manager about the parking badge', null, 0],
    ];
    for (const [name, projectId, offset] of completedSpecs) {
        await add({
            name,
            project_id: projectId,
            status: Task.STATUS.DONE,
            completed_at: atLocal(offset, 17, 15),
            due_date: endOfDayLocal(offset),
            estimated_minutes: 20,
        });
    }

    // --- Task with needs_when: true (shown in Inbox > Tasks to sort) ---
    await add(
        {
            name: 'Install the new wall shelf in the living room',
            project_id: projects.cuisine.id,
            area_id: areas.Home.id,
            needs_when: true,
            estimated_minutes: 45,
        },
        []
    );

    // --- Task pushed back 3 times in last 30 days (for Review) ---
    const pushedTask = await add(
        {
            name: 'Write the Q4 design retrospective note',
            project_id: projects.refonte.id,
            area_id: areas.Work.id,
            due_date: endOfDayLocal(2),
            priority: 1,
            estimated_minutes: 45,
        },
        ['waiting']
    );

    const pushHistory = [
        { createdOffset: -18, fromOffset: -18, toOffset: -11 },
        { createdOffset: -11, fromOffset: -11, toOffset: -4 },
        { createdOffset: -4, fromOffset: -4, toOffset: 2 },
    ];
    for (const entry of pushHistory) {
        await TaskEvent.create({
            task_id: pushedTask.id,
            user_id: userId,
            event_type: 'due_date_changed',
            old_value: { due_date: dayStr(entry.fromOffset) },
            new_value: { due_date: dayStr(entry.toOffset) },
            field_name: 'due_date',
            metadata: { source: 'web' },
            created_at: atLocal(entry.createdOffset, 18, 0),
            updated_at: atLocal(entry.createdOffset, 18, 0),
        });
    }

    // --- Comments on one task ---
    await commentsService.addComment(userId, todayTimed1.uid, {
        body: `I’ve prepared the three variants of the sign-up flow with @[${people['Luke Bennett'].name}](person:${people['Luke Bennett'].uid}).`,
        mentionedPersonUids: [people['Luke Bennett'].uid],
    });
    await commentsService.addComment(userId, todayTimed1.uid, {
        body: 'Remember to check the touch target size (48 dp minimum) on Android.',
    });

    // --- Next action on 3 projects ---
    await projects.refonte.update({ next_task_uid: todayUntimed1.uid });
    await projects.tarifs.update({ next_task_uid: todayTimed2.uid });
    await projects.appV2.update({ next_task_uid: tlAudit.uid });

    return {
        createdTasks,
        plannedTasks: [
            todayTimed1,
            todayUntimed1,
            todayTimed2,
            todayUntimed2,
            todayTimed3,
            todayUntimed3,
            todayUntimed4,
        ],
        focusTasks: [tlAudit, todayTimed2, todayUntimed1, todayUntimed2],
        refTask: todayTimed2,
    };
}

async function seedInbox(userId) {
    const items = [
        'Check the recycling centre opening hours on Saturday morning',
        'Ask Sophie for the name of her running podcast',
        'Compare flight prices to Porto in May',
        'Gather the receipts for health insurance before month end',
    ];
    for (const content of items) {
        await InboxItem.create({
            content,
            user_id: userId,
            status: 'added',
            source: 'manual',
        });
    }
}

async function seedDailyPlan(user, plannedTasks) {
    const today = dayStr(0);
    const [t1, t2, t3, t4, t5, t6] = plannedTasks;

    await dailyPlanService.applyPlanOps(user, today, [
        {
            op: 'slot',
            task_uid: t1.uid,
            start_minute: 9 * 60 + 30,
            duration_minutes: 60,
        },
        { op: 'add', task_uid: t2.uid },
        {
            op: 'slot',
            task_uid: t3.uid,
            start_minute: 14 * 60,
            duration_minutes: 90,
        },
        { op: 'add', task_uid: t4.uid },
        { op: 'add', task_uid: t5.uid },
        { op: 'add', task_uid: t6.uid },
    ]);

    await dailyPlanService.saveFocusBlocks(user, {
        blocks: [
            {
                days: [1, 2, 3, 4, 5],
                start: 9 * 60,
                end: 11 * 60 + 30,
                label: 'Deep work',
            },
        ],
    });
}

async function seedCadenceHabits(userId) {
    const startsOn = dayStr(-45);

    const { habit: water } = await cadenceHabitsWrite.createHabit(userId, {
        name: 'Drink 2 L of water',
        description: 'Steady hydration throughout the day',
        starts_on: startsOn,
        sort_order: 1,
        color_argb: -14782503,
        goal: {
            goal_type: 'QUANTITY',
            period: 'DAY',
            target_minor: 2000,
            unit_dimension: 'VOLUME',
            unit_name_fr: 'ml',
            unit_symbol: 'ml',
            direction: 'AT_LEAST',
        },
        schedule: {
            schedule_mode: 'EVERY_DAY',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
        },
    });

    const { habit: run } = await cadenceHabitsWrite.createHabit(userId, {
        name: 'Run',
        description: '3 runs a week (easy pace or intervals)',
        starts_on: startsOn,
        sort_order: 2,
        color_argb: -2078661,
        goal: {
            goal_type: 'BINARY',
            period: 'WEEK',
            target_minor: 1,
            frequency_target: 3,
            direction: 'AT_LEAST',
        },
        schedule: {
            schedule_mode: 'FLEXIBLE_PERIOD',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
        },
    });

    const { habit: meditate } = await cadenceHabitsWrite.createHabit(userId, {
        name: 'Meditate 10 min',
        description: 'Calm breathing in the morning before opening any screens',
        starts_on: startsOn,
        sort_order: 3,
        color_argb: -16742021,
        goal: {
            goal_type: 'DURATION',
            period: 'DAY',
            target_minor: 600,
            unit_dimension: 'TIME',
            unit_name_fr: 'min',
            unit_symbol: 'min',
            direction: 'AT_LEAST',
        },
        schedule: {
            schedule_mode: 'EVERY_DAY',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
        },
    });

    const { habit: read } = await cadenceHabitsWrite.createHabit(userId, {
        name: 'Read 20 pages',
        description: 'Paper reading in the evening before sleep',
        starts_on: startsOn,
        sort_order: 4,
        color_argb: -3705088,
        goal: {
            goal_type: 'QUANTITY',
            period: 'DAY',
            target_minor: 20,
            unit_dimension: 'COUNT',
            unit_name_fr: 'pages',
            unit_symbol: 'p.',
            direction: 'AT_LEAST',
        },
        schedule: {
            schedule_mode: 'EVERY_DAY',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
        },
    });

    const { habit: screens } = await cadenceHabitsWrite.createHabit(userId, {
        name: 'No screens after 10 pm',
        description: 'Keep the phone out of the bedroom',
        starts_on: startsOn,
        sort_order: 5,
        color_argb: -10593050,
        abstinence_profile: 'BEDTIME_SCREENS',
        abstinence_started_at: atLocal(-20, 22, 0).toISOString(),
        goal: {
            goal_type: 'BINARY',
            period: 'DAY',
            target_minor: 1,
            direction: 'AT_LEAST',
        },
        schedule: {
            schedule_mode: 'EVERY_DAY',
            active_days:
                'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
        },
    });

    let entryCount = 0;
    const addEntry = async (habit, offsetDays, valueMinor, hour = 20) => {
        const localDate = dayStr(offsetDays);
        const occurredAt = atLocal(offsetDays, hour, 15).toISOString();
        await cadenceHabitsWrite.createChild(userId, habit, 'habit_entry', {
            occurred_at: occurredAt,
            local_date: localDate,
            observed_zone_id: TIMEZONE,
            value_minor: valueMinor,
            source: 'MANUAL',
        });
        entryCount += 1;
    };

    for (let d = -44; d <= 0; d += 1) {
        const idx = d + 44;
        if (idx % 7 !== 3) {
            const ml = idx % 5 === 0 ? 1500 : 2000;
            await addEntry(water, d, ml, 19);
        }
        const weekday = parisNow().add(d, 'days').isoWeekday();
        if (weekday === 2 || weekday === 4 || weekday === 7) {
            if (idx !== 18 && idx !== 31) {
                await addEntry(run, d, 1, 18);
            }
        }
        if (idx % 6 !== 2) {
            await addEntry(meditate, d, 600, 8);
        }
        if (idx % 5 !== 4) {
            const pages = idx % 4 === 0 ? 25 : 20;
            await addEntry(read, d, pages, 22);
        }
        if (idx % 8 !== 5 && d < 0) {
            await addEntry(screens, d, 1, 22);
        }
    }

    // The server creates the habit groups with French names; the demo is English.
    const clock = `${String(Date.now()).padStart(13, '0')}-0000-server`;
    const groupNames = {
        'group-day': 'Daytime',
        'group-morning': 'Morning',
        'group-afternoon': 'Afternoon',
        'group-evening': 'Evening',
    };
    for (const [uid, name] of Object.entries(groupNames)) {
        const group = await HabitGroup.findOne({
            where: { user_id: userId, uid },
        });
        if (group) {
            await group.update({
                name,
                field_clocks: { ...group.field_clocks, name: clock },
            });
        }
    }

    return {
        habits: [water, run, meditate, read, screens],
        entryCount,
    };
}

async function seedNotes(userId, projects, tags, people, refTask) {
    const notesData = [
        {
            title: 'Client site architecture',
            project_id: projects.refonte.id,
            content: [
                '- Main goal: make the value proposition clear from the first screen',
                '  - Tagline in one simple sentence',
                '  - Social proof before the pricing grid',
                '  - See also [[New Pricing page: notes]]',
                '- Pages',
                '  - Home',
                '    - Hero, three benefits, testimonials',
                '    - One call to action per screen',
                '  - Pricing',
                '    - Three-column comparison, FAQ below',
                '  - Resources',
                '    - Guides, case studies, press page',
                '- Technical points',
                '  - [x] Pick the static site generator',
                '  - [ ] Fast loading of the hero images',
                '  - [ ] Dark mode respected on every page',
                `  - Review with @[${people['Luke Bennett'].name}](person:${people['Luke Bennett'].uid})`,
                `  - Related task: [[task:${refTask.name}]]`,
                '- Open questions',
                '  - Do we need a blog at launch?',
                '  - Who signs off the legal copy?',
            ].join('\n'),
        },
        {
            title: 'New Pricing page: notes',
            project_id: projects.tarifs.id,
            content: [
                '- Three-column layout',
                '  - Essential: individual use',
                '  - Team: sharing and roles',
                '  - Custom: self-hosting',
                '- References: [[Client site architecture]]',
            ].join('\n'),
        },
        {
            title: 'Kitchen plan: quote comparison',
            project_id: projects.cuisine.id,
            content: [
                '- Carpenter A',
                '  - Installation included, 5-week lead time',
                '  - Quartz countertop optional',
                '- Carpenter B',
                '  - Custom cabinets, plumbing hookup not included',
                '- Next step: confirm the dimensions after the visit',
            ].join('\n'),
        },
        {
            title: 'Portuguese: useful verbs and phrases',
            project_id: projects.portugais.id,
            tag: 'reading',
            content: [
                '- Difference between ser and estar',
                '  - ser: lasting characteristic',
                '  - estar: temporary state or location',
                '- Near future: ir + infinitive',
                '  - Vou viajar em maio',
            ].join('\n'),
        },
        {
            title: 'Brittany route ideas',
            project_id: projects.bretagne.id,
            content: [
                '- Crozon Peninsula',
                '  - Pen-Hir Point and the coastal path',
                '  - Morgat market on Saturday morning',
                '- Logistics',
                '  - Coordinate dates with Mark',
            ].join('\n'),
        },
    ];

    const notes = [];
    for (const item of notesData) {
        const note = await Note.create({
            title: item.title,
            content: item.content,
            user_id: userId,
            project_id: item.project_id,
        });
        if (item.tag && tags[item.tag]) {
            await note.setTags([tags[item.tag].id]);
        }
        notes.push(note);
    }
    return notes;
}

async function seedFocusSessions(user, focusTasks) {
    const specs = [
        { dayOffset: -6, hour: 9, duration: 50 * 60, taskIdx: 0 },
        { dayOffset: -6, hour: 14, duration: 45 * 60, taskIdx: 1 },
        { dayOffset: -5, hour: 10, duration: 60 * 60, taskIdx: 2 },
        { dayOffset: -4, hour: 9, duration: 40 * 60, taskIdx: 0 },
        { dayOffset: -3, hour: 11, duration: 55 * 60, taskIdx: 3 },
        { dayOffset: -3, hour: 15, duration: 35 * 60, taskIdx: 1 },
        { dayOffset: -2, hour: 10, duration: 50 * 60, taskIdx: 0 },
        { dayOffset: -1, hour: 9, duration: 45 * 60, taskIdx: 2 },
        { dayOffset: -1, hour: 16, duration: 30 * 60, taskIdx: 3 },
        { dayOffset: 0, hour: 8, duration: 25 * 60, taskIdx: 1 },
    ];

    const sessions = [];
    for (const spec of specs) {
        const ended = atLocal(spec.dayOffset, spec.hour, 50);
        const safeEnded =
            ended.getTime() > Date.now() ? new Date(Date.now() - 60000) : ended;
        const session = await focusSessionsService.create(user, {
            ended_at: safeEnded.toISOString(),
            duration_seconds: spec.duration,
            task_uid: focusTasks[spec.taskIdx]?.uid,
        });
        sessions.push(session);
    }
    return sessions;
}

async function seedTriageMailAndDecisions(user) {
    const mailCards = [
        {
            account: 'personal',
            thread_id: 'thr_newsletter_design_01',
            from_name: 'Weekly Design Review',
            from_address: 'hello@example.com',
            subject: 'Issue 142: grid systems and typography',
            received_at: atLocal(0, 7, 45).toISOString(),
            summary: 'Weekly newsletter on responsive grids, no action needed.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_newsletter_design_01',
            options: ['archive', 'task', 'later', 'dismiss'],
            recommended: 'archive',
            excerpt:
                'This week: lessons learned on fluid grids and visual hierarchy on mobile.',
        },
        {
            account: 'personal',
            thread_id: 'thr_facture_internet_02',
            from_name: 'Fibre & Co',
            from_address: 'billing@example.com',
            subject: 'Your monthly bill is available (39.90 EUR)',
            received_at: atLocal(-1, 18, 10).toISOString(),
            summary:
                'Internet connection bill to pay before the end of the week.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_facture_internet_02',
            options: ['task', 'later', 'archive', 'dismiss'],
            recommended: 'task',
            suggestion: {
                kind: 'task',
                task_name: 'Pay the Fibre & Co bill (39.90 EUR)',
                due_date: dayStr(3),
            },
            excerpt:
                'Hi Sam, your 39.90 EUR bill is available in your customer area.',
        },
        {
            account: 'work',
            thread_id: 'thr_rdv_client_03',
            from_name: 'Claire Dawson',
            from_address: 'claire.dawson@example.com',
            subject: 'Invitation: Pricing page mockups review',
            received_at: atLocal(0, 8, 20).toISOString(),
            summary:
                'Proposed slot on Thursday at 10:30 am to approve the Pricing page.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_rdv_client_03',
            options: ['event', 'task', 'later', 'dismiss'],
            recommended: 'event',
            suggestion: {
                kind: 'event',
                task_name: 'Pricing page mockups review with Claire',
                due_date: dayStr(2),
                event: {
                    title: 'Pricing page mockups review',
                    start: parisNow()
                        .add(2, 'days')
                        .hour(10)
                        .minute(30)
                        .second(0)
                        .format('YYYY-MM-DDTHH:mm:ssZ'),
                    end: parisNow()
                        .add(2, 'days')
                        .hour(11)
                        .minute(15)
                        .second(0)
                        .format('YYYY-MM-DDTHH:mm:ssZ'),
                    location: 'Video call',
                },
            },
            excerpt:
                'Does Thursday at 10:30 am work for you to go over the latest mockups?',
        },
        {
            account: 'work',
            thread_id: 'thr_reponse_devis_04',
            from_name: 'Oak & Quartz Workshop',
            from_address: 'contact@example.com',
            subject: 'Re: Availability to measure the kitchen',
            received_at: atLocal(-1, 15, 5).toISOString(),
            summary: 'The carpenter offers two slots next week to come by.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_reponse_devis_04',
            options: ['draft', 'task', 'later', 'dismiss'],
            recommended: 'draft',
            draft_excerpt:
                'Hello, Tuesday at 2 pm works perfectly. Here is the access code…',
            draft: {
                body: 'Hello,\n\nNext Tuesday at 2 pm works perfectly for measuring.\nThanks, see you Tuesday,\nSam',
            },
            excerpt:
                'We can come by Tuesday at 2 pm or Wednesday at 9:30 am, depending on your availability.',
        },
    ];

    for (const card of mailCards) {
        await mailService.proposeMail(user, card);
    }

    const decisionRes = await decisionsService.proposeDecisions(user, {
        kind: 'assistant_ops',
        kind_label: 'Assistant decisions',
        items: [
            {
                key: 'renew_cloud_sub_2026',
                title: 'Renew the annual photo storage plan?',
                context: 'Due in 5 days · 29.99 EUR/year',
                body: 'Storage used is 68 GB of 100 GB. Automatic renewal is on.',
                choices: [
                    { id: 'keep', label: 'Keep', tone: 'primary' },
                    { id: 'cancel', label: 'Cancel plan', tone: 'danger' },
                ],
                recommended: 'keep',
                reason: 'Space used regularly for backups.',
            },
            {
                key: 'docker_postgres_minor_update',
                title: 'Apply the minor Postgres server update',
                context: 'Server maintenance · 20 s restart',
                body: 'Minor security fix available for the database container.',
                choices: [
                    { id: 'update_tonight', label: 'Tonight', tone: 'primary' },
                    { id: 'skip', label: 'Postpone' },
                ],
                recommended: 'update_tonight',
                reason: 'Minor fix with no schema change.',
            },
            {
                key: 'family_bretagne_dates',
                title: 'Block the weekend of May 22 for Brittany?',
                context: 'Question from Mark · lodging available',
                body: 'The cottage near Morgat stays free for that slot until tomorrow evening.',
                choices: [
                    { id: 'confirm_may', label: 'Confirm', tone: 'primary' },
                    { id: 'propose_june', label: 'Suggest June' },
                ],
                recommended: 'confirm_may',
                reason: 'Slot fits the training plan.',
            },
        ],
    });

    return {
        mailCount: mailCards.length,
        decisionCount: decisionRes.created + decisionRes.updated,
    };
}

// Saved searches (the Views page): a name, filters and a few criteria.
async function seedViews(userId) {
    const views = [
        {
            name: 'This week’s priorities',
            filters: ['Task'],
            priority: 'high',
            due: 'next_week',
            is_pinned: true,
        },
        {
            name: 'To read and watch',
            filters: ['Task', 'Note'],
            tags: ['reading'],
        },
        { name: 'Calls to make', filters: ['Task'], tags: ['call'] },
        {
            name: 'Quick wins today',
            filters: ['Task'],
            tags: ['quick'],
            due: 'today',
        },
    ];
    for (const view of views) {
        await View.create({ user_id: userId, ...view });
    }
    return views;
}

// Next Saturday and Sunday, or this one when today is one of them.
function weekendDays() {
    const now = parisNow();
    const saturday = now.clone().isoWeekday(6);
    if (now.isoWeekday() === 7) saturday.subtract(1, 'day');
    return [
        saturday.format('YYYY-MM-DD'),
        saturday.clone().add(1, 'day').format('YYYY-MM-DD'),
    ];
}

// Agent proposals, filled the way the agent does it: a week to plan, a
// weekend to choose, a career digest. Only invented content, example.com links.
async function seedProposals(user) {
    const created = await proposalsService.createProposal(user, {
        kind: 'week',
    });
    const week = await proposalsService.getProposal(user, created.row.uid);
    const open = week.facts.tasks.filter((task) => !task.someday);
    const dates = (offset) => {
        const day = moment(week.facts.period.start).add(offset, 'days');
        return day.format('YYYY-MM-DD');
    };
    const plans = [
        ['plan_day', 1, 'Tuesday is the quietest day'],
        ['plan_day', 2, 'Do before Thursday’s sync'],
        ['this_week', null, 'Can wait until the end of the week'],
        ['next_week', null, 'Not urgent, review next Monday'],
        ['plan_day', 3, 'A free slot in the afternoon'],
    ];
    const changes = open.slice(0, plans.length).map((task, index) => {
        const [op, offset, reason] = plans[index];
        return {
            task_uid: task.uid,
            op,
            reason,
            ...(offset !== null ? { date: dates(offset) } : {}),
        };
    });
    await proposalsService.answerProposal(user, week.uid, {
        answer: {
            headline: 'Tuesday is free, two late tasks rescheduled',
            subtitle:
                'I’m keeping the client presentation for Tuesday: it blocks what follows.',
            changes,
            focus: open.slice(0, 3).map((task) => task.uid),
            questions: [
                {
                    id: 'q1',
                    text: 'Are you working on Friday afternoon?',
                    choices: ['Yes', 'No'],
                },
            ],
        },
    });

    const [saturday, sunday] = weekendDays();
    const slot = (id, date, part, weather, temp, activity, extra = {}) => ({
        id,
        date,
        part,
        weather,
        temp,
        feels: temp - 2,
        activity,
        ...extra,
    });
    await proposalsService.proposeWeekend(user, {
        headline: 'A bright Saturday, a sheltered Sunday',
        subtitle: 'Forest walk in the morning, museum if the rain arrives.',
        days: [
            { date: saturday, weather: 'sun', min: 4, max: 12 },
            { date: sunday, weather: 'rain', min: 6, max: 9 },
        ],
        slots: [
            slot(
                'sat-am',
                saturday,
                'morning',
                'sun',
                9,
                {
                    title: 'Hike in Roche Forest',
                    url: 'https://example.com/roche-forest',
                    place: 'Roche Forest',
                    note: '9 km loop, mud possible, wear good shoes.',
                    travel: '35 min by car',
                    start: '09:30',
                    end: '12:30',
                    after: 'Lunch at the village crêperie',
                },
                { recommended: true }
            ),
            slot('sat-pm', saturday, 'afternoon', 'sun', 12, {
                title: 'Farmers market and coffee',
                url: 'https://example.com/farmers-market',
                place: 'Market Square',
                note: 'Cheese, sourdough bread and seasonal vegetables.',
                travel: '10 min by bike',
                start: '14:00',
                end: '16:30',
            }),
            slot(
                'sun-am',
                sunday,
                'morning',
                'rain',
                7,
                {
                    title: 'Photography exhibition at the museum',
                    url: 'https://example.com/photo-museum',
                    place: 'Museum of Photography',
                    note: 'Last weekend of the exhibition on light.',
                    travel: '20 min by tram',
                    start: '10:30',
                    end: '12:30',
                },
                { recommended: true }
            ),
            slot('sun-pm', sunday, 'afternoon', 'rain', 8, null, {
                busy: 'Lunch at Mark’s',
            }),
        ],
        nearby: [
            {
                title: 'Jazz concert at the Little Theatre',
                date: saturday,
                start: '20:30',
                place: 'Little Theatre',
                travel: '15 min',
                url: 'https://example.com/jazz-little-theatre',
                note: 'Local quartet, free entry.',
            },
        ],
        elsewhere: [
            {
                place: 'Quimper',
                date: sunday,
                weather: 'partly',
                temp: 11,
                travel: '1 h 10 by train',
            },
        ],
    });

    await proposeCareer(user, {
        headline: 'Two offers to look at, one follow-up to send',
        subtitle: 'This morning’s pass over your ongoing searches.',
        stats: [
            { label: 'Applications', value: '6' },
            { label: 'Interviews', value: '2' },
            { label: 'Follow-ups', value: '1' },
        ],
        offers: [
            {
                id: 'offer-1',
                title: 'Senior product designer',
                company: 'Lumen Workshop',
                url: 'https://example.com/jobs/product-designer',
                fit: 'Close to your experience with design systems.',
                location: 'Lyon, partly remote',
                rate: '€55k to €65k',
                expires: dayStr(6),
                source: 'agent',
            },
            {
                id: 'offer-2',
                title: 'Freelance UX lead',
                company: 'Tide Studio',
                url: 'https://example.com/jobs/ux-lead',
                fit: 'Three-month assignment, compatible with your spring project.',
                location: 'Remote',
                rate: '€450 per day',
                expires: dayStr(10),
                source: 'agent',
            },
        ],
        followups: [
            {
                id: 'follow-1',
                title: 'Product designer',
                company: 'Nova Cooperative',
                applied_at: dayStr(-9),
                note: 'No reply for nine days.',
            },
        ],
        tasks: [
            {
                id: 'task-1',
                name: 'Update the portfolio with the redesign project',
                note: 'Add two case studies and the key figures.',
                due_date: dayStr(4),
            },
        ],
    });
    // The proposals above notify; read, so the bell stays quiet in the shots.
    await Notification.update(
        { read_at: new Date() },
        { where: { user_id: user.id } }
    );
}

async function main() {
    await ensureSchema();
    const { user, rawToken } = await ensureDemoUser();

    const areas = await seedAreas(user.id);
    const tags = await seedTags(user.id);
    const people = await seedPeople(user.id);
    const goals = await seedGoals(user.id, areas);
    const projects = await seedProjects(user.id, areas, goals);
    const links = await seedProjectPages(user.id, projects);
    const { createdTasks, plannedTasks, focusTasks, refTask } =
        await seedTasksAndRelations(
            user.id,
            areas,
            projects,
            tags,
            goals,
            people
        );
    await seedInbox(user.id);
    await seedDailyPlan(user, plannedTasks);
    const { habits, entryCount } = await seedCadenceHabits(user.id);
    const notes = await seedNotes(user.id, projects, tags, people, refTask);
    const sessions = await seedFocusSessions(user, focusTasks);
    const triage = await seedTriageMailAndDecisions(user);
    const views = await seedViews(user.id);
    await seedProposals(user);

    console.log('');
    console.log('Cadence screenshots database seeded successfully.');
    console.log('--------------------------------------------------');
    console.log(`Areas:           ${Object.keys(areas).length}`);
    console.log(`Projects:        ${Object.keys(projects).length}`);
    console.log(`Project pages:   ${links.length}`);
    console.log(`Tags:            ${Object.keys(tags).length}`);
    console.log(`Tasks:           ${createdTasks.length}`);
    console.log(`Daily plan:      ${plannedTasks.slice(0, 6).length} tasks`);
    console.log(`Habits:          ${habits.length} (${entryCount} entries)`);
    console.log(`Notes:           ${notes.length}`);
    console.log(
        `Goals:           ${goals.objectives.length} objectives, ${goals.keyResults.length} key results, ${goals.bucketItems.length} bucket`
    );
    console.log(`People:          ${Object.keys(people).length}`);
    console.log(`Focus sessions:  ${sessions.length}`);
    console.log(`Mail triage:     ${triage.mailCount}`);
    console.log(`Decisions:       ${triage.decisionCount}`);
    console.log(`Views:           ${views.length}`);
    console.log('--------------------------------------------------');
    console.log(`Email:    ${DEMO_EMAIL}`);
    console.log(`Password: ${DEMO_PASSWORD}`);
    console.log(`API Key:  ${rawToken}`);
    console.log('');

    await sequelize.close();
}

main().catch(async (error) => {
    console.error('Screenshots seeder failed:', error);
    try {
        await sequelize.close();
    } catch (_) {}
    process.exit(1);
});

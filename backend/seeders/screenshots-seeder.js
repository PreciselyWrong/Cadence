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

const DEMO_EMAIL = 'demo@cadence.test';
const DEMO_PASSWORD = 'demodemo';
const DEMO_NAME = 'Camille Martin';
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
            language: 'fr',
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
            language: 'fr',
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
            name: 'Travail',
            description: 'Projets produit, design et livrables clients',
        },
        {
            name: 'Maison',
            description: 'Travaux, intendance et escapades',
        },
        {
            name: 'Santé',
            description: 'Sport, sommeil et équilibre',
        },
        {
            name: 'Apprendre',
            description: 'Langues, lectures et veille design',
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
        'appel',
        'courses',
        'en-attente',
        'rapide',
        'lecture',
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
            name: 'Lucas Bernard',
            relationship_type: 'work',
            email: 'lucas.bernard@example.com',
            notes: 'Lead développeur front sur le projet app v2',
        },
        {
            name: 'Sophie Laurent',
            relationship_type: 'friend',
            email: 'sophie.laurent@example.com',
            notes: 'Partenaire de course du dimanche matin',
        },
        {
            name: 'Marc Moreau',
            relationship_type: 'family',
            email: 'marc.moreau@example.com',
            notes: 'Organisation du week-end en Bretagne',
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
        title: 'Livrer la v2 client dans les temps',
        why: 'Stabiliser le socle produit avant la fin du trimestre',
        area_id: areas.Travail.id,
        horizon: 'quarter',
        target_date: quarterEnd,
        status: 'active',
    });

    const krTimeline = await goalsService.create(userId, {
        title: 'Finaliser les maquettes et specs Tarifs',
        area_id: areas.Travail.id,
        horizon: 'month',
        target_date: thisMonthEnd,
        parent_goal_uid: objLaunch.uid,
    });

    const objRun = await goalsService.create(userId, {
        title: 'Courir le semi-marathon en moins de 1 h 50',
        why: 'Retrouver une bonne régularité de fond',
        area_id: areas['Santé'].id,
        horizon: 'quarter',
        target_date: quarterEnd,
        status: 'active',
    });

    const krVolume = await goalsService.create(userId, {
        title: 'Tenir 3 séances par semaine pendant 6 semaines',
        area_id: areas['Santé'].id,
        horizon: 'month',
        target_date: thisMonthEnd,
        parent_goal_uid: objRun.uid,
    });

    const objPt = await goalsService.create(userId, {
        title: 'Tenir une conversation de 15 min en portugais',
        why: 'Préparer le séjour à Porto',
        area_id: areas.Apprendre.id,
        horizon: 'month',
        target_date: thisMonthEnd,
        status: 'active',
    });

    const bucket1 = await goalsService.create(userId, {
        title: 'Traverser la Bretagne à vélo sur la Vélodyssée',
        area_id: areas.Maison.id,
        bucket: 'do',
    });

    const bucket2 = await goalsService.create(userId, {
        title: 'Être à l’aise à l’oral en portugais',
        area_id: areas.Apprendre.id,
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
        name: 'Refonte du site client',
        description: 'Nouvelle identité visuelle, pages clés et performances',
        area_id: areas.Travail.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(25, 18),
        goal_id: goals.objectives[0].id,
    });

    const tarifs = await Project.create({
        name: 'Nouvelle page Tarifs',
        description: 'Grille claire, FAQ et comparatif annuel/mensuel',
        area_id: areas.Travail.id,
        parent_project_id: refonte.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(10, 18),
        goal_id: goals.keyResults[0].id,
    });

    const appV2 = await Project.create({
        name: "Lancement de l'app v2",
        description: 'Coordination design, QA mobile et mise en production',
        area_id: areas.Travail.id,
        user_id: userId,
        status: 'in_progress',
        start_date_at: startOfDayLocal(-3),
        due_date_at: atLocal(28, 18),
        goal_id: goals.objectives[0].id,
    });

    const cuisine = await Project.create({
        name: 'Rénovation de la cuisine',
        description: 'Devis plan de travail, plomberie et pose des meubles',
        area_id: areas.Maison.id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(40, 18),
    });

    const bretagne = await Project.create({
        name: 'Vacances en Bretagne',
        description: 'Hébergement, itinéraire côtier et logistique',
        area_id: areas.Maison.id,
        user_id: userId,
        status: 'planned',
        due_date_at: atLocal(55, 18),
    });

    const marathon = await Project.create({
        name: 'Marathon de printemps',
        description: 'Plan de préparation sur 12 semaines',
        area_id: areas['Santé'].id,
        user_id: userId,
        status: 'in_progress',
        due_date_at: atLocal(60, 18),
        goal_id: goals.objectives[1].id,
    });

    const portugais = await Project.create({
        name: 'Apprendre le portugais',
        description: 'Cours hebdomadaires et vocabulaire quotidien',
        area_id: areas.Apprendre.id,
        user_id: userId,
        status: 'in_progress',
        goal_id: goals.objectives[2].id,
    });

    const podcast = await Project.create({
        name: 'Podcast design produit',
        description: 'Série de notes audio en pause pour le trimestre',
        area_id: areas.Apprendre.id,
        user_id: userId,
        status: 'paused',
    });

    return {
        refonte,
        tarifs,
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
            title: 'Tailwind CSS : utilitaires et tokens de design',
            description:
                'Framework CSS utilitaire utilisé pour les nouveaux composants du site client.',
            site_name: 'GitHub',
            kind: 'repo',
            github_stars: 85400,
            github_language: 'TypeScript',
            note: 'Référence pour la grille de la page Tarifs',
        },
        {
            url: 'https://fr.wikipedia.org/wiki/Syst%C3%A8me_de_design',
            title: 'Système de design · Wikipédia',
            description:
                'Principes de cohérence, composants réutilisables et documentation vivante.',
            site_name: 'Wikipédia',
            kind: 'article',
            note: 'À relire avant la revue de composants',
        },
        {
            url: 'https://example.com/guide-accessibilite-contrastes',
            title: 'Guide pratique des contrastes WCAG AA',
            description:
                'Checklist rapide pour valider la lisibilité des boutons et badges.',
            site_name: 'Example Design',
            kind: 'article',
            note: 'Vérifier le contraste du mode clair',
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
            name: 'Relancer le plombier pour la date d’intervention',
            project_id: projects.cuisine.id,
            area_id: areas.Maison.id,
            due_date: endOfDayLocal(-3),
            priority: 2,
            estimated_minutes: 15,
        },
        ['appel', 'en-attente']
    );
    await add(
        {
            name: 'Valider les textes de la page d’accueil',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(-2),
            priority: 2,
            estimated_minutes: 45,
        },
        ['rapide']
    );
    await add(
        {
            name: 'Envoyer la facture d’acompte au client',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(-1),
            priority: 1,
            estimated_minutes: 20,
        },
        ['rapide']
    );

    // --- Due today (8, with 3 timed) ---
    const todayTimed1 = await add(
        {
            name: 'Point design hebdomadaire avec Lucas',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            due_date: atLocal(0, 9, 30),
            due_has_time: true,
            priority: 2,
            estimated_minutes: 60,
        },
        ['appel']
    );
    const todayTimed2 = await add(
        {
            name: 'Finaliser la grille des tarifs annuels',
            project_id: projects.tarifs.id,
            area_id: areas.Travail.id,
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
            name: 'Appeler l’artisan pour les façades de cuisine',
            project_id: projects.cuisine.id,
            area_id: areas.Maison.id,
            due_date: atLocal(0, 16, 30),
            due_has_time: true,
            priority: 1,
            estimated_minutes: 20,
        },
        ['appel']
    );

    const todayUntimed1 = await add(
        {
            name: 'Compresser les visuels hero du site',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(0),
            priority: 1,
            estimated_minutes: 30,
        },
        ['rapide']
    );
    const todayUntimed2 = await add(
        {
            name: 'Préparer les 3 questions du test utilisateur',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(0),
            priority: 1,
            estimated_minutes: 45,
        },
        ['code']
    );
    const todayUntimed3 = await add(
        {
            name: 'Acheter des ampoules LED chaudes et du café',
            area_id: areas.Maison.id,
            due_date: endOfDayLocal(0),
            priority: 0,
            estimated_minutes: 25,
        },
        ['courses']
    );
    const todayUntimed4 = await add(
        {
            name: 'Réviser les verbes irréguliers au présent',
            project_id: projects.portugais.id,
            area_id: areas.Apprendre.id,
            due_date: endOfDayLocal(0),
            priority: 0,
            estimated_minutes: 20,
            goal_id: goals.objectives[2].id,
        },
        ['lecture']
    );
    await add(
        {
            name: 'Sortie fractionnée 8 × 400 m avec Sophie',
            project_id: projects.marathon.id,
            area_id: areas['Santé'].id,
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
            name: 'Confirmer le devis du plan de travail en quartz',
            project_id: projects.cuisine.id,
            area_id: areas.Maison.id,
            due_date: endOfDayLocal(1),
            priority: 2,
            estimated_minutes: 30,
        },
        ['en-attente']
    );
    await add(
        {
            name: 'Revue des contrastes sur le thème clair',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(1),
            priority: 1,
            estimated_minutes: 45,
        },
        ['code/frontend']
    );
    await add(
        {
            name: 'Réserver deux leçons de portugais pour la semaine prochaine',
            project_id: projects.portugais.id,
            area_id: areas.Apprendre.id,
            due_date: endOfDayLocal(2),
            priority: 0,
            estimated_minutes: 15,
        },
        ['rapide']
    );
    await add(
        {
            name: 'Comparer les gîtes près de Crozon',
            project_id: projects.bretagne.id,
            area_id: areas.Maison.id,
            due_date: endOfDayLocal(3),
            priority: 1,
            estimated_minutes: 60,
        },
        []
    );
    await add(
        {
            name: 'Sortie longue 16 km endurance fondamentale',
            project_id: projects.marathon.id,
            area_id: areas['Santé'].id,
            due_date: endOfDayLocal(4),
            priority: 1,
            estimated_minutes: 105,
            goal_id: goals.keyResults[1].id,
        },
        []
    );

    // --- Lancement de l'app v2 timeline tasks (5 tasks spread over 4 weeks + 3 blocks) ---
    const tlAudit = await add(
        {
            name: 'Audit des écrans iOS et Android',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            start_date: startOfDayLocal(-2),
            due_date: endOfDayLocal(3),
            priority: 2,
            estimated_minutes: 120,
        },
        ['code']
    );
    const tlProto = await add(
        {
            name: 'Prototype interactif du nouveau onboarding',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            start_date: startOfDayLocal(4),
            due_date: endOfDayLocal(10),
            priority: 2,
            estimated_minutes: 120,
        },
        ['code/frontend']
    );
    const tlQa = await add(
        {
            name: 'Recette complète hors ligne avec Lucas',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            start_date: startOfDayLocal(11),
            due_date: endOfDayLocal(17),
            priority: 1,
            estimated_minutes: 90,
        },
        ['code']
    );
    const tlStore = await add(
        {
            name: 'Préparer les captures Play Store et notes de version',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
            start_date: startOfDayLocal(18),
            due_date: endOfDayLocal(22),
            priority: 1,
            estimated_minutes: 60,
        },
        []
    );
    await add(
        {
            name: 'Déploiement progressif v2.0 (10 % puis 100 %)',
            project_id: projects.appV2.id,
            area_id: areas.Travail.id,
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
            name: 'Mettre à jour la fiche matériel de course',
            project_id: projects.marathon.id,
            area_id: areas['Santé'].id,
            week_of: thisWeekStart,
            priority: 0,
            estimated_minutes: 20,
        },
        ['rapide']
    );
    await add(
        {
            name: 'Préparer la liste des prises électriques de la cuisine',
            project_id: projects.cuisine.id,
            area_id: areas.Maison.id,
            week_of: nextWeekStart,
            priority: 1,
            estimated_minutes: 30,
        },
        []
    );
    await add(
        {
            name: 'Écrire l’étude de cas de la refonte client',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            in_view_at: new Date(),
            priority: 0,
            estimated_minutes: 90,
        },
        ['lecture']
    );
    await add(
        {
            name: 'Réserver les billets de train pour Quimper',
            project_id: projects.bretagne.id,
            area_id: areas.Maison.id,
            month_of: thisMonthStart,
            priority: 1,
            estimated_minutes: 30,
        },
        []
    );
    await add(
        {
            name: 'Renouveler la carte de bibliothèque municipale',
            area_id: areas.Apprendre.id,
            month_of: nextMonthStart,
            priority: 0,
            estimated_minutes: 15,
        },
        ['rapide']
    );
    await add(
        {
            name: 'Trier les photos de l’année dernière',
            area_id: areas.Maison.id,
            priority: 0,
            estimated_minutes: 60,
        },
        []
    );

    // --- Recurring tasks (2) ---
    await add(
        {
            name: 'Vider la boîte de réception et trier les captures',
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(0),
            recurrence_type: 'daily',
            recurrence_interval: 1,
            priority: 0,
            estimated_minutes: 15,
        },
        ['rapide']
    );
    await add(
        {
            name: 'Revue hebdomadaire et plan de la semaine',
            area_id: areas.Travail.id,
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
            name: 'Préparer la présentation client du mardi',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(2),
            priority: 2,
            estimated_minutes: 90,
        },
        []
    );
    await add({
        name: 'Exporter les écrans Figma en haute définition',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 1,
        status: Task.STATUS.DONE,
        completed_at: atLocal(-1, 16),
    });
    await add({
        name: 'Rédiger le déroulé des 5 diapositives clés',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 2,
    });
    await add({
        name: 'Vérifier les chiffres de conversion avant envoi',
        parent_task_id: parent1.id,
        project_id: projects.refonte.id,
        order: 3,
    });

    const parent2 = await add(
        {
            name: 'Organiser le week-end en Bretagne avec Marc',
            project_id: projects.bretagne.id,
            area_id: areas.Maison.id,
            due_date: endOfDayLocal(5),
            priority: 1,
            estimated_minutes: 45,
        },
        []
    );
    await add({
        name: 'Lister 3 randonnées côtières accessibles',
        parent_task_id: parent2.id,
        project_id: projects.bretagne.id,
        order: 1,
        status: Task.STATUS.DONE,
        completed_at: atLocal(0, 8, 30),
    });
    await add({
        name: 'Vérifier les horaires des marées',
        parent_task_id: parent2.id,
        project_id: projects.bretagne.id,
        order: 2,
    });

    const parent3 = await add(
        {
            name: 'Mettre en place le suivi des allergies et ordonnances',
            area_id: areas['Santé'].id,
            due_date: endOfDayLocal(6),
            priority: 0,
            estimated_minutes: 30,
        },
        []
    );
    await add({
        name: 'Prendre rendez-vous chez le médecin traitant',
        parent_task_id: parent3.id,
        order: 1,
    });
    await add({
        name: 'Scanner la carte de mutuelle',
        parent_task_id: parent3.id,
        order: 2,
    });

    // --- Link tasks (2) ---
    await add(
        {
            name: 'Lire : Architecture des systèmes de design modernes',
            project_id: projects.refonte.id,
            area_id: areas.Apprendre.id,
            source: 'web',
            source_url: 'https://example.com/architecture-design-systems',
            priority: 0,
            estimated_minutes: 25,
        },
        ['lecture']
    );
    await add(
        {
            name: 'Regarder : Typographie fluide et lisibilité sur mobile',
            project_id: projects.tarifs.id,
            area_id: areas.Apprendre.id,
            source: 'web',
            source_url: 'https://example.com/typographie-fluide-mobile',
            priority: 0,
            estimated_minutes: 35,
        },
        ['lecture']
    );

    // --- Completed yesterday / today (6 more, plus 2 subtasks above = 8) ---
    const completedSpecs = [
        ['Envoyer les mesures exactes de la cuisine', projects.cuisine.id, -1],
        [
            'Mettre à jour les icônes de la barre latérale',
            projects.appV2.id,
            -1,
        ],
        ['Corriger l’alignement des cartes sur mobile', projects.tarifs.id, -1],
        [
            'Faire le plein d’eau et préparer la tenue de course',
            projects.marathon.id,
            -1,
        ],
        ['Relire la leçon 3 de grammaire portugaise', projects.portugais.id, 0],
        ['Répondre au message du syndic sur le badge parking', null, 0],
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

    // --- Task with needs_when: true (shown in Inbox > Taches a classer) ---
    await add(
        {
            name: 'Installer la nouvelle étagère murale du salon',
            project_id: projects.cuisine.id,
            area_id: areas.Maison.id,
            needs_when: true,
            estimated_minutes: 45,
        },
        []
    );

    // --- Task pushed back 3 times in last 30 days (for Review) ---
    const pushedTask = await add(
        {
            name: 'Rédiger la note de rétrospective design Q4',
            project_id: projects.refonte.id,
            area_id: areas.Travail.id,
            due_date: endOfDayLocal(2),
            priority: 1,
            estimated_minutes: 45,
        },
        ['en-attente']
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
        body: `J’ai préparé les trois variantes du parcours d’inscription avec @[${people['Lucas Bernard'].name}](person:${people['Lucas Bernard'].uid}).`,
        mentionedPersonUids: [people['Lucas Bernard'].uid],
    });
    await commentsService.addComment(userId, todayTimed1.uid, {
        body: 'Pensez à vérifier la taille des cibles tactiles (48 dp minimum) sur Android.',
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
        'Vérifier les horaires de la déchèterie samedi matin',
        'Demander à Sophie le nom de son podcast sur la course à pied',
        'Comparer les tarifs des billets de train pour Porto en mai',
        'Rassembler les justificatifs pour la mutuelle avant fin du mois',
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
                label: 'Travail profond',
            },
        ],
    });
}

async function seedCadenceHabits(userId) {
    const startsOn = dayStr(-45);

    const { habit: water } = await cadenceHabitsWrite.createHabit(userId, {
        name: "Boire 2 L d'eau",
        description: 'Hydratation régulière tout au long de la journée',
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
        name: 'Courir',
        description: '3 sorties hebdomadaires (endurance ou fractionné)',
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
        name: 'Méditer 10 min',
        description: 'Respiration calme le matin avant d’ouvrir les écrans',
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
        name: 'Lire 20 pages',
        description: 'Lecture papier le soir avant de dormir',
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
        name: "Pas d'écran après 22 h",
        description: 'Poser le téléphone en dehors de la chambre',
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

    return {
        habits: [water, run, meditate, read, screens],
        entryCount,
    };
}

async function seedNotes(userId, projects, tags, people, refTask) {
    const notesData = [
        {
            title: 'Architecture du site client',
            project_id: projects.refonte.id,
            content: [
                '- Objectif principal : clarifier la proposition de valeur dès le premier écran',
                '  - Accroche en une phrase simple',
                '  - Preuve sociale avant la grille tarifaire',
                '  - Voir aussi [[Nouvelle page Tarifs : notes]]',
                '- Pages',
                '  - Accueil',
                '    - Hero, trois bénéfices, témoignages',
                '    - Un seul appel à l’action par écran',
                '  - Tarifs',
                '    - Comparatif en trois colonnes, FAQ en dessous',
                '  - Ressources',
                '    - Guides, études de cas, page presse',
                '- Points techniques',
                '  - [x] Choisir le générateur statique',
                '  - [ ] Chargement rapide des visuels hero',
                '  - [ ] Mode sombre respecté sur toutes les pages',
                `  - Revoir avec @[${people['Lucas Bernard'].name}](person:${people['Lucas Bernard'].uid})`,
                `  - Tâche liée : [[task:${refTask.name}]]`,
                '- Questions ouvertes',
                '  - Faut-il un blog dès la mise en ligne ?',
                '  - Qui valide les textes juridiques ?',
            ].join('\n'),
        },
        {
            title: 'Nouvelle page Tarifs : notes',
            project_id: projects.tarifs.id,
            content: [
                '- Structure en 3 colonnes',
                '  - Essentiel : usage individuel',
                '  - Équipe : partage et rôles',
                '  - Sur-mesure : auto-hébergement',
                '- Références : [[Architecture du site client]]',
            ].join('\n'),
        },
        {
            title: 'Plan cuisine : comparatif des devis',
            project_id: projects.cuisine.id,
            content: [
                '- Menuisier A',
                '  - Pose comprise, délai 5 semaines',
                '  - Plan de travail en quartz en option',
                '- Menuisier B',
                '  - Meubles sur mesure, hors raccordement plomberie',
                '- Prochaine étape : valider les cotes après visite',
            ].join('\n'),
        },
        {
            title: 'Portugais : verbes et tournures utiles',
            project_id: projects.portugais.id,
            tag: 'lecture',
            content: [
                '- Différence ser / estar',
                '  - ser : caractéristique durable',
                '  - estar : état passager ou localisation',
                '- Futur proche : ir + infinitif',
                '  - Vou viajar em maio',
            ].join('\n'),
        },
        {
            title: 'Idées d’itinéraire en Bretagne',
            project_id: projects.bretagne.id,
            content: [
                '- Presqu’île de Crozon',
                '  - Pointe de Pen-Hir et sentier côtier',
                '  - Marché de Morgat le samedi matin',
                '- Logistique',
                '  - Coordonner les dates avec Marc',
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
            account: 'perso',
            thread_id: 'thr_newsletter_design_01',
            from_name: 'Revue Design Hebdo',
            from_address: 'bonjour@example.com',
            subject: 'Numéro 142 : systèmes de grille et typographie',
            received_at: atLocal(0, 7, 45).toISOString(),
            summary:
                'Newsletter hebdomadaire sur les grilles responsives, sans action attendue.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_newsletter_design_01',
            options: ['archive', 'task', 'later', 'dismiss'],
            recommended: 'archive',
            excerpt:
                'Cette semaine : retours d’expérience sur les grilles fluides et la hiérarchie visuelle sur mobile.',
        },
        {
            account: 'perso',
            thread_id: 'thr_facture_internet_02',
            from_name: 'Fibre & Co',
            from_address: 'facturation@example.com',
            subject: 'Votre facture mensuelle est disponible (39,90 EUR)',
            received_at: atLocal(-1, 18, 10).toISOString(),
            summary:
                'Facture de connexion internet à régler avant la fin de la semaine.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_facture_internet_02',
            options: ['task', 'later', 'archive', 'dismiss'],
            recommended: 'task',
            suggestion: {
                kind: 'task',
                task_name: 'Payer la facture Fibre & Co (39,90 EUR)',
                due_date: dayStr(3),
            },
            excerpt:
                'Bonjour Camille, votre facture de 39,90 EUR est disponible dans votre espace client.',
        },
        {
            account: 'pro',
            thread_id: 'thr_rdv_client_03',
            from_name: 'Claire Dubois',
            from_address: 'claire.dubois@example.com',
            subject: 'Invitation : Point maquettes page Tarifs',
            received_at: atLocal(0, 8, 20).toISOString(),
            summary:
                'Proposition de créneau jeudi à 10 h 30 pour valider la page Tarifs.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_rdv_client_03',
            options: ['event', 'task', 'later', 'dismiss'],
            recommended: 'event',
            suggestion: {
                kind: 'event',
                task_name: 'Point maquettes page Tarifs avec Claire',
                due_date: dayStr(2),
                event: {
                    title: 'Point maquettes page Tarifs',
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
                    location: 'Visio',
                },
            },
            excerpt:
                'Est-ce que jeudi à 10 h 30 te convient pour passer en revue les dernières maquettes ?',
        },
        {
            account: 'pro',
            thread_id: 'thr_reponse_devis_04',
            from_name: 'Atelier Bois & Quartz',
            from_address: 'contact@example.com',
            subject: 'Re : Disponibilité pour la prise de cotes cuisine',
            received_at: atLocal(-1, 15, 5).toISOString(),
            summary:
                'Le menuisier propose deux créneaux la semaine prochaine pour passer.',
            gmail_url:
                'https://mail.google.com/mail/u/0/#inbox/thr_reponse_devis_04',
            options: ['draft', 'task', 'later', 'dismiss'],
            recommended: 'draft',
            draft_excerpt:
                'Bonjour, mardi à 14 h me convient parfaitement. Voici le code d’accès…',
            draft: {
                body: 'Bonjour,\n\nMardi prochain à 14 h me convient parfaitement pour la prise de cotes.\nMerci et à mardi,\nCamille',
            },
            excerpt:
                'Nous pouvons passer mardi à 14 h ou mercredi à 9 h 30 selon vos disponibilités.',
        },
    ];

    for (const card of mailCards) {
        await mailService.proposeMail(user, card);
    }

    const decisionRes = await decisionsService.proposeDecisions(user, {
        kind: 'assistant_ops',
        kind_label: 'Décisions assistant',
        items: [
            {
                key: 'renew_cloud_sub_2026',
                title: 'Renouveler l’abonnement stockage photo annuel ?',
                context: 'Échéance dans 5 jours · 29,99 EUR/an',
                body: 'L’espace utilisé est de 68 Go sur 100 Go. Le renouvellement automatique est actif.',
                choices: [
                    { id: 'keep', label: 'Garder', tone: 'primary' },
                    { id: 'cancel', label: 'Résilier', tone: 'danger' },
                ],
                recommended: 'keep',
                reason: 'Espace utilisé régulièrement pour les sauvegardes.',
            },
            {
                key: 'docker_postgres_minor_update',
                title: 'Appliquer la mise à jour mineure du serveur Postgres',
                context: 'Maintenance serveur · redémarrage de 20 s',
                body: 'Correctif de sécurité mineur disponible pour le conteneur de base de données.',
                choices: [
                    { id: 'update_tonight', label: 'Ce soir', tone: 'primary' },
                    { id: 'skip', label: 'Reporter' },
                ],
                recommended: 'update_tonight',
                reason: 'Correctif mineur sans changement de schéma.',
            },
            {
                key: 'family_bretagne_dates',
                title: 'Bloquer le week-end du 22 mai pour la Bretagne ?',
                context: 'Question de Marc · hébergement disponible',
                body: 'Le gîte près de Morgat reste libre sur ce créneau jusqu’à demain soir.',
                choices: [
                    { id: 'confirm_may', label: 'Confirmer', tone: 'primary' },
                    { id: 'propose_june', label: 'Proposer juin' },
                ],
                recommended: 'confirm_may',
                reason: 'Créneau compatible avec le plan d’entraînement.',
            },
        ],
    });

    return {
        mailCount: mailCards.length,
        decisionCount: decisionRes.created + decisionRes.updated,
    };
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

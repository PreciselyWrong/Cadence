'use strict';

const dailyPlanService = require('./service');
const dailyPlanAi = require('./ai');
const briefService = require('./brief/service');
const { generateBrief } = require('./brief/generate');
const decisions = require('./brief/decisions');
const contexts = require('./brief/contexts');
const { getSafeTimezone } = require('../../utils/timezone-utils');
const { UnauthorizedError, ValidationError } = require('../../shared/errors');

function requireUser(req) {
    if (!req.currentUser)
        throw new UnauthorizedError('Authentication required');
    return req.currentUser;
}

// The brief date of the URL, as the user's local day.
function briefDateOf(user, date) {
    return dailyPlanService.resolvePlanDate(
        date,
        getSafeTimezone(user.timezone)
    );
}

function requireIdempotencyKey(body) {
    if (typeof body?.idempotency_key !== 'string' || !body.idempotency_key) {
        throw new ValidationError('idempotency_key is required');
    }
}

const dailyPlanController = {
    async get(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanService.getPlan(user, req.query.date, req.query)
            );
        } catch (err) {
            next(err);
        }
    },

    async candidates(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanService.getCandidates(user, {
                    suggestedLimit: dailyPlanService.parseSuggestedLimit(
                        req.query.suggested_limit
                    ),
                    scopeQuery: req.query,
                })
            );
        } catch (err) {
            next(err);
        }
    },

    async getRanking(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.getRanking(user));
        } catch (err) {
            next(err);
        }
    },

    async saveRanking(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.saveRanking(user, req.body?.order));
        } catch (err) {
            next(err);
        }
    },

    async getSuggestionSettings(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.getSuggestionSettings(user));
        } catch (err) {
            next(err);
        }
    },

    async saveSuggestionSettings(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanService.saveSuggestionSettings(user, req.body)
            );
        } catch (err) {
            next(err);
        }
    },

    async getDayHours(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.getDayHours(user));
        } catch (err) {
            next(err);
        }
    },

    async getFocusBlocks(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.getFocusBlocks(user));
        } catch (err) {
            next(err);
        }
    },

    async saveFocusBlocks(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.saveFocusBlocks(user, req.body));
        } catch (err) {
            next(err);
        }
    },

    async saveDayHours(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.saveDayHours(user, req.body));
        } catch (err) {
            next(err);
        }
    },

    async getBriefSettings(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await briefService.getBriefSettings(user));
        } catch (err) {
            next(err);
        }
    },

    async saveBriefSettings(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await briefService.saveBriefSettings(user, req.body));
        } catch (err) {
            next(err);
        }
    },

    async getBrief(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await briefService.getBrief(user, req.params.date));
        } catch (err) {
            next(err);
        }
    },

    async getBriefStatus(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await briefService.getBriefStatus(user));
        } catch (err) {
            next(err);
        }
    },

    // A decision on one proposal of the brief (refuse a date, ignore, feedback).
    async recordBriefDecision(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await decisions.recordDecision(user, {
                    ...(req.body || {}),
                    brief_date: briefDateOf(user, req.params.date),
                })
            );
        } catch (err) {
            next(err);
        }
    },

    // An answer to a question of the brief: a linked context on the target,
    // plus the decision. Both are idempotent on idempotency_key.
    async answerBriefQuestion(req, res, next) {
        try {
            const user = requireUser(req);
            const body = req.body || {};
            requireIdempotencyKey(body);
            const target = body.target;
            if (
                target === null ||
                typeof target !== 'object' ||
                typeof body.question_key !== 'string' ||
                body.question_key === ''
            ) {
                throw new ValidationError(
                    'question_key and target are required'
                );
            }
            const answer = contexts.answerText(body.answer);
            const context = await contexts.createContext(user, {
                scope: target.scope,
                target_ref: target.ref,
                text: answer,
            });
            const decision = await decisions.recordDecision(user, {
                brief_date: briefDateOf(user, req.params.date),
                kind: 'question',
                target_type: context.scope,
                target_ref: context.target_ref,
                proposal: { question_key: body.question_key, answer },
                decision: 'accepted',
                idempotency_key: body.idempotency_key,
            });
            res.json({ context, decision });
        } catch (err) {
            next(err);
        }
    },

    async listBriefContexts(req, res, next) {
        try {
            const user = requireUser(req);
            res.json({
                contexts: await contexts.listContexts(user, req.query),
            });
        } catch (err) {
            next(err);
        }
    },

    async updateBriefContext(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await contexts.updateContext(
                    user,
                    req.params.uid,
                    req.body || {}
                )
            );
        } catch (err) {
            next(err);
        }
    },

    async deleteBriefContext(req, res, next) {
        try {
            const user = requireUser(req);
            await contexts.deleteContext(user, req.params.uid);
            res.status(204).end();
        } catch (err) {
            next(err);
        }
    },

    // Regenerate: a new version of the day's brief, then the same payload as GET.
    async regenerateBrief(req, res, next) {
        try {
            const user = requireUser(req);
            await generateBrief(user, req.params.date, { reason: 'manual' });
            res.json(await briefService.getBrief(user, req.params.date));
        } catch (err) {
            next(err);
        }
    },

    async replace(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanService.replaceItems(
                    user,
                    req.params.date,
                    req.body?.items
                )
            );
        } catch (err) {
            next(err);
        }
    },

    async start(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.startPlan(user, req.params.date));
        } catch (err) {
            next(err);
        }
    },

    async clear(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanService.clearPlan(user, req.params.date));
        } catch (err) {
            next(err);
        }
    },

    async carryOver(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanService.carryOver(
                    user,
                    req.params.date,
                    req.body?.task_uids
                )
            );
        } catch (err) {
            next(err);
        }
    },

    async aiDraft(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanAi.draftDay(user.id, {
                    date: req.body?.date,
                    mode: req.body?.mode,
                })
            );
        } catch (err) {
            next(err);
        }
    },

    async aiEstimates(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(
                await dailyPlanAi.estimateTasks(user.id, req.body?.task_uids)
            );
        } catch (err) {
            next(err);
        }
    },

    async aiWrapUp(req, res, next) {
        try {
            const user = requireUser(req);
            res.json(await dailyPlanAi.wrapUpDay(user.id, req.params.date));
        } catch (err) {
            next(err);
        }
    },
};

module.exports = dailyPlanController;

package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Annulation d'une action : elle défait l'écriture locale, ou retire l'appel tant qu'il n'est pas parti. */
typealias BriefUndo = suspend () -> Unit

/** Écritures de tâches du brief, celles du dépôt (outbox, hors ligne compris). */
internal interface BriefTaskWrites {
    suspend fun complete(uid: String)
    suspend fun reopen(uid: String)
    suspend fun write(uid: String, change: TaskChange)
}

/** File des appels différés ([DeferredCall]) ; [cancel] retire un appel encore en attente et dit s'il y était (faux : il est déjà parti). */
internal interface BriefQueue {
    suspend fun enqueue(call: DeferredCall)
    suspend fun cancel(key: String): Boolean
}

/** Plan du jour côté serveur, en ligne seulement : sert à défaire un report déjà arrivé. */
internal fun interface BriefPlanWrites {
    suspend fun removeFromPlan(date: LocalDate, taskUids: List<String>)
}

/**
 * Actions du brief, sans Android : chaque geste écrit la tâche (si besoin) puis met sa décision en file, et rend
 * l'annulation du bouton « Annuler ». Une décision de déplacement est gardée avec la tâche ; un refus ou un avis
 * n'écrit que la file.
 */
internal class BriefActions(
    private val tasks: BriefTaskWrites,
    private val queue: BriefQueue,
    private val zone: suspend () -> ZoneId,
    private val plan: BriefPlanWrites = BriefPlanWrites { _, _ -> },
    private val newKey: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun complete(uid: String): BriefUndo {
        tasks.complete(uid)
        return { tasks.reopen(uid) }
    }

    /** « Déplacer » : l'échéance change tout de suite, la décision « acceptée » part ensuite. */
    suspend fun move(date: LocalDate, move: MoveDto, task: TaskItem): BriefUndo {
        val target = LocalDate.parse(move.to)
        tasks.write(task.uid, PlanningChanges.moveToDay(task, target, zone()))
        val key = newKey()
        queue.enqueue(
            BriefRequests.decision(
                date = date,
                idempotencyKey = key,
                kind = "move",
                decision = "accepted",
                targetType = "task",
                targetRef = task.uid,
                fingerprint = move.proposalKey,
                proposal = BriefRequests.proposalOf(MoveProposal(move.from, move.to)),
                label = "Résumé : déplacement accepté",
            ),
        )
        return {
            queue.cancel(BriefRequests.decisionKey(key))
            tasks.write(task.uid, PlanningChanges.restore(task, zone()))
        }
    }

    /** « Pas cette date » : le serveur ne propose plus ce jour pour cette tâche. */
    suspend fun refuseMove(date: LocalDate, move: MoveDto): BriefUndo {
        val key = newKey()
        queue.enqueue(
            BriefRequests.decision(
                date = date,
                idempotencyKey = key,
                kind = "move",
                decision = "refused",
                targetType = "task",
                targetRef = move.taskUid,
                fingerprint = move.proposalKey,
                proposal = BriefRequests.proposalOf(MoveProposal(move.from, move.to)),
                label = "Résumé : date refusée",
            ),
        )
        return { queue.cancel(BriefRequests.decisionKey(key)) }
    }

    /** Oui, Non ou un texte libre : le contexte lié et la décision partent ensemble, dans un seul appel. */
    suspend fun answer(date: LocalDate, question: QuestionDto, answer: String): BriefUndo {
        val key = newKey()
        queue.enqueue(
            BriefRequests.answer(
                date = date,
                idempotencyKey = key,
                questionKey = question.key,
                scope = question.target.scope,
                ref = question.target.ref,
                answer = answer,
                label = "Résumé : réponse",
            ),
        )
        return { queue.cancel(BriefRequests.answerKey(key)) }
    }

    /** « Utile » ou « Bruit » : un avis sur un type de carte, qui compte pour la réduction du bruit. */
    suspend fun feedback(date: LocalDate, card: AnticipateDto, vote: String): BriefUndo {
        val key = newKey()
        queue.enqueue(
            BriefRequests.decision(
                date = date,
                idempotencyKey = key,
                kind = "feedback",
                decision = "accepted",
                targetType = "card",
                targetRef = card.key,
                fingerprint = card.key,
                proposal = feedbackProposal(card.type, vote),
                label = "Résumé : avis",
            ),
        )
        return { queue.cancel(BriefRequests.decisionKey(key)) }
    }

    /**
     * « Reporter à demain » (bilan du soir) : ajoute les tâches au plan de demain, sans toucher à leur échéance.
     * Annuler retire l'appel s'il n'est pas parti, sinon retire les tâches du plan de demain (en ligne).
     */
    suspend fun carryOver(tomorrow: LocalDate, taskUids: List<String>): BriefUndo {
        val key = newKey()
        queue.enqueue(BriefRequests.carryOver(tomorrow, key, taskUids, label = "Bilan du soir : report à demain"))
        return {
            if (!queue.cancel(BriefRequests.carryKey(key))) plan.removeFromPlan(tomorrow, taskUids)
        }
    }

    /** « Choisir une date » : l'échéance change tout de suite (l'heure fixe est gardée) ; annuler remet l'ancienne. */
    suspend fun setDue(task: TaskItem, day: LocalDate): BriefUndo {
        tasks.write(task.uid, PlanningChanges.moveToDay(task, day, zone()))
        return { tasks.write(task.uid, PlanningChanges.restore(task, zone())) }
    }

    /** « Plus tard » : l'étiquette `#someday`, sans toucher à l'échéance ; annuler la retire si la tâche ne l'avait pas. */
    suspend fun later(task: TaskItem): BriefUndo {
        tasks.write(task.uid, TaskChange(later = true))
        return { if (!task.someday) tasks.write(task.uid, TaskChange(later = false)) }
    }

    /** « Abandonner » : statut annulé ; annuler remet le statut d'avant. */
    suspend fun abandon(task: TaskItem): BriefUndo {
        tasks.write(task.uid, TaskChange(status = TaskStatus.CANCELLED))
        return { tasks.write(task.uid, TaskChange(status = task.status)) }
    }

    private fun feedbackProposal(cardType: String, vote: String): JsonObject = buildJsonObject {
        put("card_type", cardType)
        put("vote", vote)
    }
}

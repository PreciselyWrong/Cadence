package ch.nicolab.cadence.tasks.planning

import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.LocalDate
import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Une écriture du plan d'un jour : une opération de `PATCH /api/v1/daily-plan/:date` (docs/20-daily-plan.md). Elle n'écrit
 * que le plan : jamais l'échéance, l'estimation ni un autre champ de la tâche.
 */
internal sealed interface PlanEdit {
    /** Le jour dont l'URL reçoit l'appel. */
    val day: LocalDate
    val uid: String
    val label: String
}

/** Ajoute la tâche au jour, en fin de liste, sans heure. Sans effet si elle y est déjà. */
internal data class AddTask(override val day: LocalDate, override val uid: String) : PlanEdit {
    override val label: String = "Plan du jour : ajout"
}

/** Retire la tâche du jour. Sans effet si elle n'y est pas. */
internal data class RemoveTask(override val day: LocalDate, override val uid: String) : PlanEdit {
    override val label: String = "Plan du jour : retrait"
}

/** Reporte la ligne de la tâche sur [to] (sans heure, même durée) ; si [to] la porte déjà, sa ligne là-bas reste. */
internal data class MoveTask(override val day: LocalDate, override val uid: String, val to: LocalDate) : PlanEdit {
    override val label: String = "Plan du jour : report"
}

/** Pose un créneau : heure de début et durée en minutes ; ajoute la ligne si elle manque. */
internal data class SlotTask(override val day: LocalDate, override val uid: String, val start: Int, val duration: Int) : PlanEdit {
    override val label: String = "Plan du jour : créneau"
}

/** Retire l'heure de la ligne, la ligne reste. */
internal data class UnslotTask(override val day: LocalDate, override val uid: String) : PlanEdit {
    override val label: String = "Plan du jour : créneau retiré"
}

/** Change la durée de la ligne seulement. */
internal data class ResizeTask(override val day: LocalDate, override val uid: String, val duration: Int) : PlanEdit {
    override val label: String = "Plan du jour : durée"
}

private const val DEFAULT_DURATION_MINUTES = 30

/** Appel différé qui porte l'écriture, sous la clé [key] (une clé par écriture : rien ne se remplace). */
internal fun PlanEdit.call(key: String): DeferredCall = DeferredCall(
    key = key,
    method = "PATCH",
    path = "/api/v1/daily-plan/$day",
    body = buildJsonObject { put("ops", JsonArray(listOf(op()))) },
    label = label,
)

private fun PlanEdit.op(): JsonObject = buildJsonObject {
    put("task_uid", uid)
    when (val edit = this@op) {
        is AddTask -> put("op", "add")
        is RemoveTask -> put("op", "remove")
        is MoveTask -> {
            put("op", "move")
            put("to_date", edit.to.toString())
        }
        is SlotTask -> {
            put("op", "slot")
            put("start_minute", edit.start)
            put("duration_minutes", edit.duration)
        }
        is UnslotTask -> put("op", "unslot")
        is ResizeTask -> {
            put("op", "resize")
            put("duration_minutes", edit.duration)
        }
    }
}

/** Le plan local après [edit], comme le serveur l'écrit (les seuls jours gardés sur l'appareil : aujourd'hui, demain). */
internal fun List<PlanEntry>.applying(edit: PlanEdit): List<PlanEntry> = when (edit) {
    is AddTask -> if (line(edit.day, edit.uid) != null) this else this + PlanEntry(edit.uid, edit.day, null, null)
    is RemoveTask -> filterNot { it.matches(edit.day, edit.uid) }
    is MoveTask -> {
        val line = line(edit.day, edit.uid)
        if (line == null) {
            this
        } else {
            val rest = filterNot { it.matches(edit.day, edit.uid) }
            if (rest.any { it.matches(edit.to, edit.uid) }) rest else rest + PlanEntry(edit.uid, edit.to, null, line.durationMinutes)
        }
    }
    is SlotTask -> if (line(edit.day, edit.uid) == null) {
        this + PlanEntry(edit.uid, edit.day, edit.start, edit.duration)
    } else {
        map { if (it.matches(edit.day, edit.uid)) it.copy(startMinute = edit.start, durationMinutes = edit.duration) else it }
    }
    is UnslotTask -> map { if (it.matches(edit.day, edit.uid)) it.copy(startMinute = null) else it }
    is ResizeTask -> map { if (it.matches(edit.day, edit.uid)) it.copy(durationMinutes = edit.duration) else it }
}

/**
 * Les écritures qui défont [this] à partir du plan [before] (celui d'avant l'écriture). Un déplacement se défait par le
 * déplacement retour, suivi du créneau que la ligne avait.
 */
internal fun PlanEdit.inverse(before: List<PlanEntry>): List<PlanEdit> {
    val prior = before.firstOrNull { it.matches(day, uid) }
    return when (this) {
        is AddTask -> listOf(RemoveTask(day, uid))
        is RemoveTask -> listOfNotNull(prior?.let { AddTask(day, uid) }, prior?.let { slotOf(it) })
        is MoveTask -> listOfNotNull(MoveTask(to, uid, day), prior?.let { slotOf(it) })
        is SlotTask -> when {
            prior == null -> listOf(RemoveTask(day, uid))
            prior.startMinute != null -> listOfNotNull(slotOf(prior))
            else -> listOfNotNull(UnslotTask(day, uid), prior.durationMinutes?.let { ResizeTask(day, uid, it) })
        }
        is UnslotTask -> listOfNotNull(prior?.let { slotOf(it) })
        is ResizeTask -> listOfNotNull(prior?.durationMinutes?.let { ResizeTask(day, uid, it) })
    }
}

private fun PlanEdit.slotOf(line: PlanEntry): PlanEdit? =
    line.startMinute?.let { SlotTask(day, uid, it, line.durationMinutes ?: DEFAULT_DURATION_MINUTES) }

private fun PlanEntry.matches(day: LocalDate, uid: String) = this.day == day && this.uid == uid

private fun List<PlanEntry>.line(day: LocalDate, uid: String): PlanEntry? = firstOrNull { it.matches(day, uid) }

/** Annule une écriture du plan (rend le plan local d'avant, et défait ce qui est déjà parti sur le serveur). */
internal typealias PlanUndo = suspend () -> Unit

/**
 * Écritures du plan : chacune change le plan local d'abord (lu par Aujourd'hui), puis part en file (appel différé,
 * dans l'ordre). Une écriture pas encore partie s'annule en retirant son appel ; une écriture partie est défaite par son
 * inverse, envoyé à son tour.
 */
internal class PlanEdits(
    private val read: () -> List<PlanEntry>,
    private val write: (List<PlanEntry>) -> Unit,
    private val defer: suspend (DeferredCall) -> Unit,
    private val cancel: suspend (String) -> Boolean,
    private val newKey: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun apply(edits: List<PlanEdit>): PlanUndo {
        if (edits.isEmpty()) return {}
        var entries = read()
        val steps = edits.map { edit ->
            val before = entries
            entries = entries.applying(edit)
            Step(edit, before, "plan-edit:${newKey()}")
        }
        write(entries)
        steps.forEach { defer(it.edit.call(it.key)) }
        return { undo(steps) }
    }

    private suspend fun undo(steps: List<Step>) {
        var entries = read()
        for (step in steps.asReversed()) {
            val inverse = step.edit.inverse(step.before)
            for (edit in inverse) entries = entries.applying(edit)
            if (!cancel(step.key)) inverse.forEach { defer(it.call("plan-edit:${newKey()}")) }
        }
        write(entries)
    }

    private class Step(val edit: PlanEdit, val before: List<PlanEntry>, val key: String)
}

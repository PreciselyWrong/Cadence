package ch.nicolab.cadence.tasks.project

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.sync.DeferredCall
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** Préfixe de la clé d'appel : une tâche n'a qu'une conversion en attente, et sa clé la désigne. */
private const val CONVERSION_KEY_PREFIX = "task-to-project:"

/**
 * Une tâche peut devenir un projet sauf si le serveur le refuse (400) : série, occurrence, sous-tâche ou tâche
 * d'un fichier TODO.md. Le menu ne propose donc pas l'action pour ces cas.
 */
fun canBecomeProject(task: TaskItem): Boolean =
    !task.isRecurring && !task.virtual && task.parentTaskUid == null && !task.fileBacked

/** `POST /api/v1/task/:uid/to-project`, gardé dans la file d'appels différés jusqu'à l'envoi. */
internal fun projectConversionCall(uid: String, name: String) = DeferredCall(
    key = CONVERSION_KEY_PREFIX + uid,
    method = "POST",
    path = "/api/v1/task/$uid/to-project",
    body = null,
    label = "Transformer en projet : $name",
)

/** Tâches dont la conversion attend encore dans la file : elles restent masquées jusqu'à l'envoi ou le refus. */
internal fun pendingConversionUids(keys: List<String>): Set<String> =
    keys.filter { it.startsWith(CONVERSION_KEY_PREFIX) }.map { it.removePrefix(CONVERSION_KEY_PREFIX) }.toSet()

/** Jours écoulés depuis la dernière activité, comptés en jours civils du fuseau du compte ; jamais négatifs. */
fun inactiveDays(lastActivity: Instant, today: LocalDate, zone: ZoneId): Int {
    val day = lastActivity.atZone(zone).toLocalDate()
    return ChronoUnit.DAYS.between(day, today).toInt().coerceAtLeast(0)
}

package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Une modification de la fiche : le changement à écrire, et le jour à déplacer si la tâche est récurrente. */
internal class EditResult(val change: TaskChange, val moveDate: LocalDate?)

/**
 * Traduit un choix de la fiche en [TaskChange] ne portant que ce qui a réellement changé, avec les
 * règles de l'écriture serveur : effacer est explicite, une heure seule garde le jour prévu, et le
 * jour d'une tâche récurrente passe par un déplacement avec choix de portée.
 */
internal object TaskEdits {
    fun due(task: TaskItem, date: LocalDate?, time: LocalTime?, zone: ZoneId): EditResult {
        val originalTime = task.dueDate?.takeIf { task.dueHasTime }?.let { instantTime(it, zone) }
        val dateChanged = date != task.dueDay
        val timeChanged = time != originalTime
        if (!dateChanged && !timeChanged) return EditResult(TaskChange(), null)
        val moveDate = date.takeIf { task.isRecurring && dateChanged }
        val change = when {
            dateChanged && date == null -> TaskChange(clearDue = true)
            moveDate != null -> TaskChange(dueTime = if (timeChanged) time?.let(::wireTime) else null)
            else -> TaskChange(dueDate = date, dueTime = time?.let(::wireTime))
        }
        return EditResult(change, moveDate)
    }

    fun start(task: TaskItem, date: LocalDate?, time: LocalTime?, zone: ZoneId): TaskChange {
        val originalTime = task.startDate?.takeIf { task.startHasTime }?.let { instantTime(it, zone) }
        val dateChanged = date != task.startDay
        val changed = dateChanged || time != originalTime
        if (!changed) return TaskChange()
        return TaskChange(
            clearStart = dateChanged && date == null,
            startDate = date,
            startTime = time?.takeIf { date != null }?.let(::wireTime),
        )
    }

    fun project(task: TaskItem, uid: String?): TaskChange = when {
        uid == task.projectUid -> TaskChange()
        uid == null -> TaskChange(clearProject = true)
        else -> TaskChange(projectUid = uid)
    }

    fun estimate(task: TaskItem, minutes: Int?): TaskChange = when {
        minutes == task.estimatedMinutes -> TaskChange()
        minutes == null -> TaskChange(clearEstimate = true)
        else -> TaskChange(estimatedMinutes = minutes)
    }

    /** Titre et note : un titre vide n'est jamais écrit. */
    fun text(task: TaskItem, title: String, note: String): TaskChange = TaskChange(
        name = title.trim().takeIf { it.isNotEmpty() && it != task.name },
        note = note.trim().takeIf { it != task.note.orEmpty() },
    )
}

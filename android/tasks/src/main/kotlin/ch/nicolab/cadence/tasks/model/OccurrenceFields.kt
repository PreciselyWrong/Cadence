package ch.nicolab.cadence.tasks.model

/**
 * Les champs d'une tâche récurrente qui se modifient pour une occurrence ou pour la série : titre, note,
 * priorité, heure, durée, projet, étiquettes et statut en cours. Terminer, la règle de répétition, le début
 * et l'entonnoir de revue appartiennent à la série et ne demandent pas la portée.
 */
object OccurrenceFields {
    fun isScoped(change: TaskChange): Boolean = scoped(change) != TaskChange()

    /** Seulement les champs qui demandent la portée. */
    fun scoped(change: TaskChange): TaskChange = TaskChange(
        name = change.name,
        note = change.note,
        priority = change.priority,
        clearPriority = change.clearPriority,
        status = change.status?.takeUnless { TaskStatus.isClosed(it) },
        dueDate = change.dueDate,
        dueTime = change.dueTime,
        projectUid = change.projectUid,
        clearProject = change.clearProject,
        tagUids = change.tagUids,
        estimatedMinutes = change.estimatedMinutes,
        clearEstimate = change.clearEstimate,
    )

    /** Ce qui reste du changement une fois les champs à portée écartés. */
    fun rest(change: TaskChange): TaskChange = change.copy(
        name = null,
        note = null,
        priority = null,
        clearPriority = false,
        status = change.status?.takeIf { TaskStatus.isClosed(it) },
        dueDate = null,
        dueTime = null,
        projectUid = null,
        clearProject = false,
        tagUids = null,
        estimatedMinutes = null,
        clearEstimate = false,
    )

    /** Un décalage de jour seul : le serveur le déplace en ligne (`move-occurrence`). */
    fun isDateOnly(change: TaskChange): Boolean {
        val scoped = scoped(change)
        return scoped.dueDate != null && scoped == TaskChange(dueDate = scoped.dueDate)
    }
}

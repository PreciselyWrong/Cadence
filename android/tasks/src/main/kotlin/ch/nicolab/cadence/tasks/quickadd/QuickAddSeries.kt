package ch.nicolab.cadence.tasks.quickadd

/**
 * Une série de tâches ajoutées l'une après l'autre dans la saisie rapide. Le projet de la dernière tâche
 * suit sur la suivante tant que la série dure ; étiquettes, priorité et date ne suivent pas.
 */
data class QuickAddSeries(
    val added: Int = 0,
    val projectUid: String? = null,
    val lastAt: Long = 0L,
) {
    fun isActive(now: Long): Boolean = (added > 0 || projectUid != null) && now - lastAt < IDLE_MS

    /** Projet à proposer d'office pour la prochaine tâche. */
    fun carriedProject(now: Long): String? = projectUid.takeIf { isActive(now) }

    /** Une tâche vient d'être enregistrée dans [projectUid] (null : sans projet). */
    fun saved(projectUid: String?, now: Long): QuickAddSeries = when {
        !isActive(now) -> QuickAddSeries(1, projectUid, now)
        projectUid != this.projectUid -> QuickAddSeries(1, projectUid, now)
        else -> copy(added = added + 1, lastAt = now)
    }

    /** La dernière tâche a été annulée : elle ne compte plus, le projet reste proposé. */
    fun undone(now: Long): QuickAddSeries = if (isActive(now)) copy(added = (added - 1).coerceAtLeast(0), lastAt = now) else this

    /** L'utilisateur a retiré la pastille du projet : la suite se fait sans projet. */
    fun projectRemoved(now: Long): QuickAddSeries = if (isActive(now)) copy(projectUid = null, lastAt = now) else this

    /** De la frappe : la série ne s'éteint que sur une vraie pause. */
    fun touched(now: Long): QuickAddSeries = if (isActive(now)) copy(lastAt = now) else this

    companion object {
        /** Sans rien taper ni enregistrer pendant ce délai, la série prend fin. */
        const val IDLE_MS = 2 * 60 * 1000L
    }
}

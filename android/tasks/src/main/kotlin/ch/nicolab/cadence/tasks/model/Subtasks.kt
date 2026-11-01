package ch.nicolab.cadence.tasks.model

/** Règles des sous-tâches sans Android : ce qui s'affiche pendant l'annulation, et un nom acceptable. */
object Subtasks {
    /** Retire les sous-tâches en attente de suppression (« Annuler » encore possible). */
    fun visible(all: List<TaskItem>, hidden: Set<String>): List<TaskItem> = all.filter { it.uid !in hidden }

    /** Nom saisi rogné ; un nom vide ne renomme rien. */
    fun cleanName(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() }
}

package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.TaskItem

/** Ce que le fichier TODO.md possède pour une tâche qui en vient : le reste s'édite dans Cadence. */
internal enum class FileOwnedField { TEXT, PROJECT, DELETE }

/**
 * Une tâche reflétant un fichier TODO.md garde son texte (titre et note), son projet et sa suppression
 * au fichier, qui reste la source de vérité. Ses autres champs s'éditent comme ceux d'une tâche ordinaire.
 */
internal object FileBackedActions {
    /** Vrai si [field] ne se change que dans le fichier. Un nouveau champ doit être décidé ici. */
    fun ownsField(task: TaskItem, field: FileOwnedField): Boolean = task.fileBacked && when (field) {
        FileOwnedField.TEXT, FileOwnedField.PROJECT, FileOwnedField.DELETE -> true
    }

    /** Les gestes qui touchent un champ du fichier (projet, suppression) sont retirés. */
    fun allowsSwipe(task: TaskItem, action: SwipeAction): Boolean = when (action) {
        SwipeAction.MOVE_PROJECT -> !ownsField(task, FileOwnedField.PROJECT)
        SwipeAction.DELETE -> !ownsField(task, FileOwnedField.DELETE)
        else -> true
    }

    /** Réglage de balayage effectif : les actions interdites sont retirées, le reste est inchangé. */
    fun swipeConfig(task: TaskItem, config: SwipeConfig): SwipeConfig {
        if (!task.fileBacked) return config
        fun keep(action: SwipeAction) = if (allowsSwipe(task, action)) action else SwipeAction.NONE
        return SwipeConfig(keep(config.rightShort), keep(config.rightLong), keep(config.leftShort), keep(config.leftLong))
    }
}

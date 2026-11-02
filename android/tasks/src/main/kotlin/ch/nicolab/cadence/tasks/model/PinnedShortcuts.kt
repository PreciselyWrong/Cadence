package ch.nicolab.cadence.tasks.model

/** Élément épinglé (`pin_to_sidebar`), montré tout en haut de l'écran Tâches comme en tête de la barre latérale du web. */
data class PinnedShortcut(
    val kind: Kind,
    val uid: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
) {
    enum class Kind { PROJECT, NOTE }
}

object PinnedShortcuts {
    /** Projets puis notes épinglés, dans l'ordre de leurs listes, comme le bloc « Épinglés » du web. */
    fun of(projects: List<ProjectItem>, notes: List<NoteItem>): List<PinnedShortcut> =
        projects.filter { it.pinToSidebar }.map { PinnedShortcut(PinnedShortcut.Kind.PROJECT, it.uid, it.name, it.icon, it.color) } +
            notes.filter { it.pinned }.map { PinnedShortcut(PinnedShortcut.Kind.NOTE, it.uid, noteName(it)) }

    private fun noteName(note: NoteItem): String =
        note.title.trim().ifEmpty { note.content.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty() }
}

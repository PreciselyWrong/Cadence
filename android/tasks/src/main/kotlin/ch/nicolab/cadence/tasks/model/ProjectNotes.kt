package ch.nicolab.cadence.tasks.model

/** Notes rattachées à un projet, pour sa page : les épinglées d'abord, sinon l'ordre de la liste des notes. */
object ProjectNotes {
    fun of(notes: List<NoteItem>, projectUid: String): List<NoteItem> =
        notes.filter { it.projectUid == projectUid }.sortedByDescending { it.pinned }
}

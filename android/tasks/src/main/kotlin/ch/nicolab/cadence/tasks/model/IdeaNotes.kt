package ch.nicolab.cadence.tasks.model

/** Note tirée d'une idée de l'Inbox : sa première ligne fait le titre, la suite le contenu. */
object IdeaNotes {
    fun change(text: String): NoteChange {
        val lines = text.trim().lines()
        return NoteChange(title = lines.first().trim(), content = lines.drop(1).joinToString("\n").trim())
    }
}

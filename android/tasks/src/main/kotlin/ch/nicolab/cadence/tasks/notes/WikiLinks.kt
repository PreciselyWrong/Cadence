package ch.nicolab.cadence.tasks.notes

import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.TaskItem

/** Lien interne `[[titre]]` entre notes, trouvé à [start] ; [end] est l'index juste après les `]]`. */
data class WikiLink(val title: String, val end: Int)

object WikiLinks {
    /** Le lien `[[…]]` qui commence à [start], ou null : titre vide, non fermé, sur deux lignes ou imbriqué. */
    fun at(source: String, start: Int): WikiLink? {
        if (!source.startsWith("[[", start)) return null
        val close = source.indexOf("]]", start + 2)
        if (close < 0) return null
        val raw = source.substring(start + 2, close)
        if (raw.isBlank() || raw.contains('\n') || raw.contains('[')) return null
        return WikiLink(raw.trim(), close + 2)
    }

    /** La tâche d'un lien `[[task:Nom]]` : même nom sans casse ni espaces aux bords, une ouverte d'abord (comme le serveur). */
    fun findTask(name: String, tasks: List<TaskItem>): TaskItem? {
        val wanted = name.trim()
        val same = tasks.filter { !it.virtual && it.name.trim().equals(wanted, ignoreCase = true) }
        return same.firstOrNull { !it.isClosed } ?: same.maxByOrNull { it.completedAt ?: java.time.Instant.EPOCH }
    }

    /** La note dont le titre égale [title] sans tenir compte de la casse ni des espaces aux bords. */
    fun findNote(title: String, notes: List<NoteItem>): NoteItem? {
        val wanted = title.trim()
        return notes.firstOrNull { it.title.trim().equals(wanted, ignoreCase = true) }
    }
}

/**
 * Les notes et tâches de l'appareil, pour lire les liens d'un texte : une cible inconnue se lit en puce « + » qui la
 * crée (`docs/44-notes-links.md`), une case `[[task:Nom]]` suit la tâche.
 */
class ContentTargets(private val notes: List<NoteItem>, private val tasks: List<TaskItem>) {
    fun task(name: String): TaskItem? = WikiLinks.findTask(name, tasks)

    /** La puce vise une note ou une tâche (par nom) qui n'existe pas sur l'appareil. */
    fun missing(run: MdRun): Boolean {
        run.wiki?.let { return WikiLinks.findNote(it, notes) == null }
        val ref = run.ref as? ContentRef.Task ?: return false
        return ref.uid == null && ref.name != null && task(ref.name) == null
    }
}

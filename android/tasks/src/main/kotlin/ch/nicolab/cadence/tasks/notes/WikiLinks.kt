package ch.nicolab.cadence.tasks.notes

import ch.nicolab.cadence.tasks.model.NoteItem

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

    /** La note dont le titre égale [title] sans tenir compte de la casse ni des espaces aux bords. */
    fun findNote(title: String, notes: List<NoteItem>): NoteItem? {
        val wanted = title.trim()
        return notes.firstOrNull { it.title.trim().equals(wanted, ignoreCase = true) }
    }
}

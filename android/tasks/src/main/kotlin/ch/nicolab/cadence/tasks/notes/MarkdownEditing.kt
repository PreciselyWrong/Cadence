package ch.nicolab.cadence.tasks.notes

/** Texte et position du curseur (ou de la sélection), sans dépendance à Compose. */
data class TextEdit(val text: String, val selStart: Int, val selEnd: Int = selStart) {
    constructor(text: String, cursor: Int) : this(text, cursor, cursor)
}

/** Aides de saisie : continuer une liste à la touche Entrée, préfixer une ligne, entourer une sélection. */
object MarkdownEditing {
    private val listLine = Regex("""^(\s*)([-*+]|(\d{1,9})[.)])\s+(\[[ xX]\]\s+)?(.*)$""")
    private val anyPrefix = Regex("""^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d{1,9}[.)]\s+)""")

    /**
     * Si [after] résulte d'un retour à la ligne tapé juste après [before] dans une liste, renvoie le texte
     * avec l'élément suivant déjà amorcé ; sur un élément vide, la puce est retirée et la liste se termine.
     * Null quand rien n'est à corriger.
     */
    fun continueList(before: TextEdit, after: TextEdit): TextEdit? {
        val cursor = before.selStart
        val typedNewline = before.selStart == before.selEnd &&
            after.text.length == before.text.length + 1 &&
            after.selStart == cursor + 1 && after.selEnd == cursor + 1 &&
            after.text.getOrNull(cursor) == '\n'
        if (!typedNewline) return null
        val lineStart = before.text.lastIndexOf('\n', cursor - 1) + 1
        val match = listLine.matchEntire(before.text.substring(lineStart, cursor)) ?: return null
        val indent = match.groupValues[1]
        val box = match.groupValues[4].isNotEmpty()
        if (match.groupValues[5].isBlank()) {
            val text = before.text.substring(0, lineStart) + before.text.substring(cursor)
            return TextEdit(text, lineStart)
        }
        val marker = match.groupValues[3].takeIf { it.isNotEmpty() }?.let { "${it.toInt() + 1}${match.groupValues[2].last()}" }
            ?: match.groupValues[2]
        val insert = "\n$indent$marker ${if (box) "[ ] " else ""}"
        val text = before.text.substring(0, cursor) + insert + before.text.substring(cursor)
        return TextEdit(text, cursor + insert.length)
    }

    /** Ajoute [prefix] au début de la ligne du curseur, remplace un autre préfixe, ou le retire s'il y est déjà. */
    fun togglePrefix(edit: TextEdit, prefix: String): TextEdit {
        val lineStart = edit.text.lastIndexOf('\n', edit.selStart - 1) + 1
        val lineEnd = edit.text.indexOf('\n', edit.selStart).let { if (it < 0) edit.text.length else it }
        val line = edit.text.substring(lineStart, lineEnd)
        val existing = anyPrefix.find(line)
        val indent = existing?.groupValues?.get(1).orEmpty()
        val existingPrefix = existing?.groupValues?.get(2).orEmpty()
        val body = line.substring(indent.length + existingPrefix.length)
        val newLine = if (existingPrefix == prefix) indent + body else indent + prefix + body
        val delta = newLine.length - line.length
        val text = edit.text.substring(0, lineStart) + newLine + edit.text.substring(lineEnd)
        return TextEdit(text, (edit.selStart + delta).coerceAtLeast(lineStart))
    }

    /** Entoure la sélection de [marker] ; sans sélection, insère la paire et place le curseur entre les deux. */
    fun wrap(edit: TextEdit, marker: String): TextEdit {
        val start = minOf(edit.selStart, edit.selEnd)
        val end = maxOf(edit.selStart, edit.selEnd)
        val selected = edit.text.substring(start, end)
        val text = edit.text.substring(0, start) + marker + selected + marker + edit.text.substring(end)
        return if (selected.isEmpty()) {
            TextEdit(text, start + marker.length)
        } else {
            TextEdit(text, start + marker.length, end + marker.length)
        }
    }
}

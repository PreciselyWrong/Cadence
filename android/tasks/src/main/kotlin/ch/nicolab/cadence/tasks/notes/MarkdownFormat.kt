package ch.nicolab.cadence.tasks.notes

/** Préfixes de ligne de la barre de mise en forme. */
enum class LineKind { BULLET, NUMBER, TASK, QUOTE }

/**
 * Commandes de mise en forme, portage de `frontend/components/Note/editor/markdownFormat.ts` : texte et sélection
 * en entrée ([TextEdit]), un remplacement et la nouvelle sélection en sortie ([TextChange]). Elles marchent dans
 * une puce : les commandes de ligne gardent le retrait et la puce, les blocs (tableaux, code) se placent dessous.
 */
object MarkdownFormat {
    private val LIST_MARKER = Regex("""^(\s*)((?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s+)?""")
    private val LINE_PREFIX = Regex("""^(\s*)(>\s?)?((?:[-*+]|\d+[.)])\s+)?(\[[ xX]\]\s+)?""")
    private val HEADING = Regex("""^(#{1,6})\s+""")
    private val URL_ONLY = Regex("""^https?://\S+$""")

    private fun lineStart(doc: String, pos: Int) = if (pos == 0) 0 else doc.lastIndexOf('\n', pos - 1) + 1

    private fun lineEnd(doc: String, pos: Int) = doc.indexOf('\n', pos).let { if (it == -1) doc.length else it }

    private fun leading(line: String) = line.takeWhile { it.isWhitespace() }

    private fun replaceLines(sel: TextEdit, map: (List<String>) -> List<String>): TextChange {
        val start = lineStart(sel.text, sel.selStart)
        // Une sélection qui finit au tout début d'une ligne la laisse de côté.
        val last = if (sel.selEnd > sel.selStart && sel.text[sel.selEnd - 1] == '\n') sel.selEnd - 1 else sel.selEnd
        val end = lineEnd(sel.text, maxOf(last, start))
        val insert = map(sel.text.substring(start, end).split("\n")).joinToString("\n")
        return TextChange(start, end, insert, start + insert.length, start + insert.length)
    }

    /** Entoure la sélection de [open]/[close], ou l'en libère ; sans sélection, le curseur se place entre les deux. */
    fun toggleWrap(sel: TextEdit, open: String, close: String = open): TextChange {
        val doc = sel.text
        val from = sel.selStart
        val to = sel.selEnd
        val selected = doc.substring(from, to)
        if (selected.length > open.length + close.length && selected.startsWith(open) && selected.endsWith(close)) {
            val inner = selected.substring(open.length, selected.length - close.length)
            return TextChange(from, to, inner, from, from + inner.length)
        }
        if (from >= open.length && doc.substring(from - open.length, from) == open && doc.startsWith(close, to)) {
            return TextChange(from - open.length, to + close.length, selected, from - open.length, to - open.length)
        }
        return TextChange(from, to, "$open$selected$close", from + open.length, to + open.length)
    }

    /** Pose le niveau de titre de la ligne, ou le retire quand elle l'a déjà ; une puce reste devant les `#`. */
    fun toggleHeading(sel: TextEdit, level: Int): TextChange = replaceLines(sel) { lines ->
        lines.map { line ->
            val lead = LIST_MARKER.find(line)?.value ?: leading(line)
            val rest = line.substring(lead.length)
            val current = HEADING.find(rest)
            val text = if (current != null) rest.substring(current.value.length) else rest
            if (current != null && current.groupValues[1].length == level) lead + text
            else "$lead${"#".repeat(level)} $text"
        }
    }

    /** Un seul bouton de titre : texte → H1 → H2 → H3 → texte, sur la ligne du curseur. */
    fun cycleHeading(sel: TextEdit): TextChange {
        val line = sel.text.substring(lineStart(sel.text, sel.selStart), lineEnd(sel.text, sel.selStart))
        val lead = LIST_MARKER.find(line)?.value ?: leading(line)
        val level = HEADING.find(line.substring(lead.length))?.groupValues?.get(1)?.length ?: 0
        return if (level >= 3) toggleHeading(sel, 3) else toggleHeading(sel, level + 1)
    }

    private fun prefixFor(kind: LineKind, index: Int) = when (kind) {
        LineKind.BULLET -> "- "
        LineKind.NUMBER -> "${index + 1}. "
        LineKind.TASK -> "- [ ] "
        LineKind.QUOTE -> "> "
    }

    private fun hasKind(line: String, kind: LineKind): Boolean {
        val m = LINE_PREFIX.find(line)!!
        val quote = m.groups[2]
        val marker = m.groups[3]?.value
        val box = m.groups[4]
        return when (kind) {
            LineKind.QUOTE -> quote != null
            LineKind.TASK -> box != null
            else -> marker != null && box == null && (kind == LineKind.NUMBER) == marker.any { it.isDigit() }
        }
    }

    /** Les lignes choisies deviennent une liste (puces, numéros, cases) ou une citation, ou redeviennent du texte. */
    fun toggleLinePrefix(sel: TextEdit, kind: LineKind): TextChange = replaceLines(sel) { lines ->
        val filled = lines.filter { it.isNotBlank() }
        val remove = filled.isNotEmpty() && filled.all { hasKind(it, kind) }
        var index = 0
        lines.map { line ->
            if (line.isBlank() && lines.size > 1) return@map line
            val m = LINE_PREFIX.find(line)!!
            val indent = m.groupValues[1]
            val quote = m.groupValues[2]
            val marker = m.groupValues[3]
            val box = m.groupValues[4]
            val text = line.substring(m.value.length)
            if (kind == LineKind.QUOTE) {
                val body = "$marker$box$text"
                return@map if (remove) "$indent$body" else "$indent> $body"
            }
            if (remove) "$indent$quote$text" else "$indent$quote${prefixFor(kind, index++)}$text"
        }
    }

    /** Le retrait d'un bloc (tableau, code) qui reste dans la puce du curseur : la largeur de sa puce. */
    private fun blockIndent(doc: String, pos: Int): String {
        val line = doc.substring(lineStart(doc, pos), lineEnd(doc, pos))
        LIST_MARKER.find(line)?.let { return " ".repeat(it.value.length) }
        return leading(line)
    }

    /** Insère [lines] en bloc après la ligne du curseur, dans la même puce, avec les lignes vides qu'il faut. */
    private fun insertBlock(sel: TextEdit, lines: List<String>, caretLine: Int, caretColumn: Int): TextChange {
        val doc = sel.text
        val to = sel.selEnd
        val end = lineEnd(doc, to)
        val indent = blockIndent(doc, to)
        val currentLine = doc.substring(lineStart(doc, to), end)
        val before = if (currentLine.isBlank()) "" else "\n\n"
        val after = if (end < doc.length && doc.getOrNull(end + 1) != '\n') "\n" else ""
        val block = lines.map { indent + it }
        val from = if (currentLine.isBlank()) lineStart(doc, to) else end
        val insert = before + block.joinToString("\n") + after
        val caret = from + before.length + block.take(caretLine).sumOf { it.length + 1 } + indent.length + caretColumn
        return TextChange(from, end, insert, caret, caret)
    }

    /** Code en ligne pour une sélection d'une ligne, bloc ``` sur plusieurs lignes, bloc vide sans sélection. */
    fun toggleCode(sel: TextEdit): TextChange {
        val selected = sel.text.substring(sel.selStart, sel.selEnd)
        if (selected.isNotEmpty() && !selected.contains('\n')) return toggleWrap(sel, "`")
        if (selected.isEmpty()) return insertBlock(sel, listOf("```", "", "```"), 1, 0)
        return replaceLines(sel) { lines ->
            val indent = leading(lines[0])
            listOf("$indent```") + lines + "$indent```"
        }
    }

    /** `[sélection](url)` avec « url » sélectionné, prêt à être remplacé ; une adresse choisie devient la cible. */
    fun insertLink(sel: TextEdit): TextChange {
        val from = sel.selStart
        val selected = sel.text.substring(from, sel.selEnd)
        if (URL_ONLY.matches(selected)) return TextChange(from, sel.selEnd, "[]($selected)", from + 1, from + 1)
        val text = selected.ifEmpty { "link" }
        val urlAt = from + text.length + 3
        return TextChange(from, sel.selEnd, "[$text](url)", urlAt, urlAt + 3)
    }

    /** Remplace la sélection par [text], curseur après. */
    fun insertText(sel: TextEdit, text: String): TextChange {
        val at = sel.selStart + text.length
        return TextChange(sel.selStart, sel.selEnd, text, at, at)
    }

    private fun tableRow(cells: List<String>) = "| ${cells.joinToString(" | ")} |"

    /** Un tableau [rows] × [cols] (l'en-tête compte pour une rangée), curseur dans la première cellule d'en-tête. */
    fun insertTable(sel: TextEdit, rows: Int, cols: Int, headerLabel: (Int) -> String = { "Column ${it + 1}" }): TextChange {
        val r = rows.coerceIn(1, 20)
        val c = cols.coerceIn(1, 12)
        val header = List(c) { headerLabel(it) }
        val lines = listOf(tableRow(header), tableRow(header.map { "---" })) + List(r - 1) { tableRow(List(c) { " " }) }
        return insertBlock(sel, lines, 0, 2)
    }
}

package ch.nicolab.cadence.tasks.notes

/** Texte et position du curseur (ou de la sélection), sans dépendance à Compose. */
data class TextEdit(val text: String, val selStart: Int, val selEnd: Int = selStart) {
    constructor(text: String, cursor: Int) : this(text, cursor, cursor)
}

/**
 * Un remplacement dans le texte et la sélection qui suit, dans le nouveau texte : le `TextEdit` du web
 * (`frontend/components/Note/editor/markdownFormat.ts`). La sélection d'entrée est un [TextEdit] (texte, début, fin).
 */
data class TextChange(val from: Int, val to: Int, val insert: String, val anchor: Int, val head: Int) {
    fun applyTo(doc: String): String = doc.substring(0, from) + insert + doc.substring(to)

    /** Le texte et la sélection après le remplacement. */
    fun result(doc: String): TextEdit = TextEdit(applyTo(doc), minOf(anchor, head), maxOf(anchor, head))
}

/** Une puce du plan (`docs/45-outliner.md`) ; lignes en base 0. */
class OutlineItem internal constructor(
    /** Première ligne de la puce. */
    val line: Int,
    contentEnd: Int,
    end: Int,
    /** Largeur du retrait (tabulation = 4). */
    val indent: Int,
    /** `- `, `* `, `1. ` avec les espaces qui suivent. */
    val marker: String,
    /** `[ ] `, `[x] ` ou vide. */
    val box: String,
    /** Colonne où commence le texte (après la puce et la case). */
    val textStart: Int,
    val text: String,
    val parent: Int?,
    val children: MutableList<Int>,
    val depth: Int,
) {
    /** Dernière ligne de son propre contenu (texte, suites, blocs), avant son premier enfant. */
    var contentEnd: Int = contentEnd
        internal set

    /** Dernière ligne de la puce avec tous ses descendants. */
    var end: Int = end
        internal set
}

/** Le texte lu en plan : [owner] est la puce la plus profonde de chaque ligne, [code] les lignes d'un bloc de code. */
class OutlineDoc(val lines: List<String>, val items: List<OutlineItem>, val owner: List<Int?>, val code: List<Boolean>)

/** Zoom et replis connus de l'éditeur, pour Entrée, la sortie de retrait et le retour arrière. */
data class OutlineOptions(
    /** Zoom : la puce de cette ligne est la racine, rien n'en sort. */
    val rootLine: Int? = null,
    /** Puces repliées (par première ligne) : Entrée à leur fin ajoute une sœur après les enfants cachés. */
    val folded: (Int) -> Boolean = { false },
)

/**
 * Le plan sous le Markdown, portage de `frontend/components/Note/editor/outline.ts` (mêmes règles, mêmes cas de
 * test) : les puces en arbre et les éditions du plan (couper, retrait, sortie, déplacer, case, fusion) en fonctions
 * pures sur le texte, qui reste la seule source de vérité.
 */
object NoteOutline {
    private val ITEM = Regex("""^(\s*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))(\[[ xX]\](?:[ \t]+|$))?""")
    private val FENCE = Regex("""^\s*(`{3,}|~{3,})""")
    private val NOT_LAZY = Regex("""^\s*(#{1,6}\s|>|```|~~~|\|)""")
    private val HR = Regex("""^\s*([-*_])(\s*\1){2,}\s*$""")
    private val PROSE_BLOCK = Regex("""^\s*(#{1,6}\s|>|\|)""")
    private val TABLE_ROW = Regex("""^\s*\|""")
    private val ONLY_TASK_LINK = Regex("""^\s*\[\[\s*task:[^\[\]\n]+\]\]\s*$""", RegexOption.IGNORE_CASE)

    /** Une puce qui commence par `[[task:Nom]]` : sa case suit la tâche en lecture. */
    val TASK_ITEM_LINK = Regex("""^\s*\[\[\s*task:\s*([^\[\]\n]+?)\s*\]\]""", RegexOption.IGNORE_CASE)

    private fun width(ws: String) = ws.sumOf { if (it == '\t') 4 else 1 }

    private fun leading(line: String) = line.takeWhile { it.isWhitespace() }

    private fun contentColumn(item: OutlineItem) = item.indent + item.marker.length

    /** `slice` de JavaScript pour des index positifs : vide quand [b] précède [a]. */
    private fun String.cut(a: Int, b: Int = length): String {
        val start = a.coerceIn(0, length)
        val end = b.coerceIn(0, length)
        return if (end <= start) "" else substring(start, end)
    }

    fun parse(doc: String): OutlineDoc {
        val lines = doc.split("\n")
        val items = mutableListOf<OutlineItem>()
        val owner = MutableList<Int?>(lines.size) { null }
        val code = MutableList(lines.size) { false }
        val stack = mutableListOf<Int>()
        var fenceMark: String? = null
        var fenceOwner: Int? = null
        // Les lignes vides attendent que la ligne remplie suivante dise à qui elles sont.
        val pendingBlank = mutableListOf<Int>()
        var lastFilledOwned = false

        fun claim(line: Int, item: Int?) {
            owner[line] = item
            if (item == null) return
            var i: Int? = item
            while (i != null) {
                items[i].end = maxOf(items[i].end, line)
                i = items[i].parent
            }
            val it = items[item]
            if (it.children.isEmpty()) it.contentEnd = line
        }

        fun flushBlanks(item: Int?) {
            for (b in pendingBlank) {
                owner[b] = item
                if (item != null) claim(b, item)
            }
            pendingBlank.clear()
        }

        fun pop() = stack.removeAt(stack.lastIndex)

        lines.forEachIndexed { n, line ->
            val mark = fenceMark
            if (mark != null) {
                code[n] = true
                flushBlanks(fenceOwner)
                claim(n, fenceOwner)
                val m = FENCE.find(line)
                if (m != null && m.groupValues[1][0] == mark[0] && m.groupValues[1].length >= mark.length) fenceMark = null
                return@forEachIndexed
            }
            if (line.isBlank()) {
                pendingBlank += n
                return@forEachIndexed
            }
            val ws = width(leading(line))
            val m = if (!HR.containsMatchIn(line)) ITEM.find(line) else null
            if (m != null) {
                val indent = width(m.groupValues[1])
                while (stack.isNotEmpty() && indent <= items[stack.last()].indent) pop()
                val parent = stack.lastOrNull()
                flushBlanks(parent)
                val raw = m.groupValues[2]
                val marker = if (raw.endsWith(' ') || raw.endsWith('\t')) raw else "$raw "
                val boxRaw = m.groups[3]?.value
                val box = if (boxRaw != null) "[${if (boxRaw[1] == ' ') ' ' else 'x'}] " else ""
                val index = items.size
                items += OutlineItem(
                    line = n, contentEnd = n, end = n, indent = indent, marker = marker, box = box,
                    textStart = m.value.length, text = line.substring(m.value.length), parent = parent,
                    children = mutableListOf(), depth = stack.size,
                )
                if (parent != null) items[parent].children += index
                stack += index
                claim(n, index)
                lastFilledOwned = true
                return@forEachIndexed
            }
            // Suite de la puce ouverte la plus profonde dont elle atteint la colonne de texte ; une ligne de
            // paragraphe juste après le texte d'une puce compte aussi (suite paresseuse).
            while (stack.isNotEmpty() && ws < contentColumn(items[stack.last()])) {
                val top = stack.last()
                val lazy = pendingBlank.isEmpty() && lastFilledOwned && !NOT_LAZY.containsMatchIn(line) &&
                    !code.getOrElse(n - 1) { false } && owner.getOrNull(n - 1) == top
                if (lazy) break
                pop()
            }
            val item = stack.lastOrNull()
            flushBlanks(item)
            claim(n, item)
            lastFilledOwned = item != null
            val f = FENCE.find(line)
            if (f != null) {
                code[n] = true
                fenceMark = f.groupValues[1]
                fenceOwner = item
            }
        }
        return OutlineDoc(lines, items, owner, code)
    }

    /** La puce dont la première ligne est [line], ou -1. */
    fun itemAtLine(outline: OutlineDoc, line: Int): Int = outline.items.indexOfFirst { it.line == line }

    fun lineOf(doc: String, pos: Int): Int {
        var n = 0
        for (i in 0 until minOf(pos, doc.length)) if (doc[i] == '\n') n++
        return n
    }

    fun lineStarts(lines: List<String>): List<Int> {
        val starts = ArrayList<Int>(lines.size)
        var at = 0
        for (l in lines) {
            starts += at
            at += l.length + 1
        }
        return starts
    }

    private data class Caret(val line: Int, val col: Int)

    private fun toCaret(doc: String, pos: Int): Caret {
        val line = lineOf(doc, pos)
        return Caret(line, pos - (if (pos == 0) 0 else doc.lastIndexOf('\n', pos - 1) + 1))
    }

    /** Réécrit les lignes [from]..[to] par [next], la sélection suivant [map] (ancienne ligne, colonne → nouvelles). */
    private fun rewrite(
        outline: OutlineDoc,
        from: Int,
        to: Int,
        next: List<String>,
        sel: TextEdit,
        map: (Caret) -> Caret,
    ): TextChange {
        val starts = lineStarts(outline.lines)
        val start = starts[from]
        val end = starts[to] + outline.lines[to].length
        val insert = next.joinToString("\n")
        val nextStarts = lineStarts(next)
        fun place(pos: Int): Int {
            val c = toCaret(sel.text, pos)
            if (c.line < from || c.line > to) return if (pos < start) pos else pos - (end - start) + insert.length
            val m = map(c)
            val idx = m.line - from
            val len = next.getOrNull(idx)?.length ?: 0
            return start + (nextStarts.getOrNull(idx) ?: 0) + m.col.coerceIn(0, len)
        }
        return TextChange(start, end, insert, place(sel.selStart), place(sel.selEnd))
    }

    private fun shiftLine(line: String, delta: Int): String {
        if (line.isBlank()) return line
        if (delta >= 0) return " ".repeat(delta) + line
        val cut = minOf(-delta, leading(line).length)
        return line.substring(cut)
    }

    private fun shiftedCol(line: String, col: Int, delta: Int): Int {
        if (line.isBlank()) return col
        if (delta >= 0) return col + delta
        return maxOf(0, col - minOf(-delta, leading(line).length))
    }

    /** Une touche prise en charge sans rien changer. */
    fun noop(sel: TextEdit) = TextChange(sel.selStart, sel.selStart, "", sel.selStart, sel.selEnd)

    fun isNoop(edit: TextChange, sel: TextEdit) =
        edit.insert.isEmpty() && edit.from == edit.to && edit.anchor == sel.selStart && edit.head == sel.selEnd

    private fun isZoomRoot(options: OutlineOptions, line: Int) = options.rootLine != null && options.rootLine == line

    private fun lastSelectedLine(sel: TextEdit): Int {
        val to = sel.selEnd
        val lastPos = if (to > sel.selStart && sel.text[to - 1] == '\n') to - 1 else to
        return lineOf(sel.text, lastPos)
    }

    /** Les puces de premier rang que touche la sélection (aucune dans une autre). */
    private fun selectedItems(outline: OutlineDoc, sel: TextEdit): List<Int> {
        val first = lineOf(sel.text, sel.selStart)
        val last = lastSelectedLine(sel)
        val touched = outline.items.indices.filter { outline.items[it].line in first..last }.toMutableList()
        // Un curseur sur une ligne de suite agit sur sa puce.
        val owner = outline.owner[first]
        if (owner != null && outline.items[owner].line < first) touched.add(0, owner)
        val set = touched.toSet()
        return touched.filter { i ->
            var p = outline.items[i].parent
            while (p != null) {
                if (p in set) return@filter false
                p = outline.items[p].parent
            }
            true
        }
    }

    private fun siblings(outline: OutlineDoc, index: Int): Pair<Int?, Int?> {
        val item = outline.items[index]
        val list = if (item.parent == null) outline.items.indices.filter { outline.items[it].parent == null }
        else outline.items[item.parent].children
        val at = list.indexOf(index)
        return (if (at > 0) list[at - 1] else null) to (if (at >= 0 && at < list.size - 1) list[at + 1] else null)
    }

    private fun inCode(outline: OutlineDoc, sel: TextEdit) = outline.code[lineOf(sel.text, sel.selStart)]

    /** Retrait : les puces choisies, avec leurs enfants, deviennent enfants de la puce du dessus. Null hors liste. */
    fun indentItems(sel: TextEdit): TextChange? {
        val outline = parse(sel.text)
        if (inCode(outline, sel)) return null
        val picked = selectedItems(outline, sel)
        if (picked.isEmpty()) return null
        val first = outline.items[picked[0]]
        val prev = siblings(outline, picked[0]).first ?: return noop(sel)
        val target = outline.items[prev]
        val delta = contentColumn(target) - first.indent
        val lastLine = picked.maxOf { outline.items[it].end }
        val block = outline.lines.subList(first.line, lastLine + 1)
        return rewrite(outline, first.line, lastLine, block.map { shiftLine(it, delta) }, sel) { c ->
            Caret(c.line, shiftedCol(outline.lines[c.line], c.col, delta))
        }
    }

    /** Sortie de retrait : la puce (et ses enfants) quitte son parent et se place juste après ; ses sœurs suivantes restent. */
    fun outdentItems(sel: TextEdit, options: OutlineOptions = OutlineOptions()): TextChange? {
        val outline = parse(sel.text)
        if (inCode(outline, sel)) return null
        val picked = selectedItems(outline, sel)
        if (picked.isEmpty()) return null
        val first = outline.items[picked[0]]
        val parentIndex = first.parent ?: return noop(sel)
        val parent = outline.items[parentIndex]
        if (isZoomRoot(options, parent.line)) return noop(sel)
        val sameParent = picked.all { outline.items[it].parent == first.parent }
        val lastLine = picked.maxOf { outline.items[it].end }
        val delta = parent.indent - first.indent
        val block = outline.lines.subList(first.line, lastLine + 1).map { shiftLine(it, delta) }
        if (!sameParent || lastLine >= parent.end) {
            return rewrite(outline, first.line, lastLine, block, sel) { c ->
                Caret(c.line, shiftedCol(outline.lines[c.line], c.col, delta))
            }
        }
        val rest = outline.lines.subList(lastLine + 1, parent.end + 1)
        val moved = lastLine - first.line + 1
        return rewrite(outline, first.line, parent.end, rest + block, sel) { c ->
            if (c.line > lastLine) Caret(c.line - moved, c.col)
            else Caret(c.line + rest.size, shiftedCol(outline.lines[c.line], c.col, delta))
        }
    }

    /** Déplace la puce et ses enfants à la place de la sœur du dessus ([dir] -1) ou du dessous (1). */
    fun moveItem(sel: TextEdit, dir: Int): TextChange? {
        val outline = parse(sel.text)
        if (inCode(outline, sel)) return null
        val index = outline.owner[lineOf(sel.text, sel.selStart)] ?: return null
        val (prev, next) = siblings(outline, index)
        val other = (if (dir < 0) prev else next) ?: return noop(sel)
        val (a, b) = if (dir < 0) outline.items[other] to outline.items[index] else outline.items[index] to outline.items[other]
        val upper = outline.lines.subList(a.line, a.end + 1)
        val gap = outline.lines.subList(a.end + 1, b.line)
        val lower = outline.lines.subList(b.line, b.end + 1)
        return rewrite(outline, a.line, b.end, lower + gap + upper, sel) { c ->
            when {
                c.line <= a.end -> Caret(c.line + lower.size + gap.size, c.col)
                c.line < b.line -> Caret(c.line + lower.size - upper.size, c.col)
                else -> Caret(c.line - b.line + a.line, c.col)
            }
        }
    }

    private val NUMBERED = Regex("""^(\d+)([.)])(\s*)$""")

    private fun nextMarker(marker: String): String {
        val num = NUMBERED.find(marker) ?: return "${marker.trim()} "
        return "${num.groupValues[1].toLong() + 1}${num.groupValues[2]} "
    }

    /**
     * Entrée. Dans une puce : la coupe au curseur (le texte après devient la puce suivante et garde les enfants) ;
     * en fin de puce ouverte à enfants, ajoute un premier enfant ; sur une puce vide, sort d'un niveau ou quitte la
     * liste au premier niveau. Sur une ligne de prose, en fait une puce et ouvre la suivante. Null là où l'Entrée du
     * Markdown s'applique (code, tableaux, titres, lignes vides) ou avec une sélection.
     */
    fun splitItem(sel: TextEdit, options: OutlineOptions = OutlineOptions()): TextChange? {
        val doc = sel.text
        val from = sel.selStart
        if (sel.selEnd != from) return null
        val outline = parse(doc)
        val caret = toCaret(doc, from)
        if (outline.code[caret.line]) return null
        val lineText = outline.lines[caret.line]
        val index = outline.owner[caret.line]
        val starts = lineStarts(outline.lines)
        val lineStart = starts[caret.line]
        fun lineEnd(n: Int) = starts[n] + outline.lines[n].length
        fun insertAt(pos: Int, text: String) = TextChange(pos, pos, text, pos + text.length, pos + text.length)

        if (index == null) {
            if (lineText.isBlank() || PROSE_BLOCK.containsMatchIn(lineText) || HR.containsMatchIn(lineText)) return null
            val ws = leading(lineText)
            val head = lineText.cut(ws.length, caret.col).trimEnd()
            val after = lineText.cut(caret.col).trimStart()
            val first = "$ws- $head\n$ws- "
            return TextChange(lineStart, lineStart + lineText.length, first + after, lineStart + first.length, lineStart + first.length)
        }

        val item = outline.items[index]
        if (TABLE_ROW.containsMatchIn(lineText)) return null
        val isRoot = isZoomRoot(options, item.line)
        val folded = options.folded(item.line)
        val box = if (item.box.isNotEmpty()) "[ ] " else ""
        val siblingPrefix = " ".repeat(item.indent) + nextMarker(item.marker) + box
        val childIndent = if (item.children.isNotEmpty()) outline.items[item.children[0]].indent else contentColumn(item)
        val childPrefix = " ".repeat(childIndent) + "- " + box
        val firstChild = { insertAt(lineEnd(item.contentEnd), "\n$childPrefix") }
        val nextSibling = { insertAt(lineEnd(item.end), "\n$siblingPrefix") }

        if (caret.line != item.line) {
            // Ligne de suite : Entrée à la fin de la dernière ligne propre ouvre la puce suivante, ailleurs c'est
            // un retour à la ligne dans la puce.
            if (caret.line == item.contentEnd && caret.col == lineText.length) {
                return if (isRoot || (item.children.isNotEmpty() && !folded)) firstChild() else nextSibling()
            }
            return softBreak(sel)
        }

        if (caret.col < item.textStart) return null
        val text = lineText.cut(item.textStart)
        val before = lineText.cut(item.textStart, caret.col)
        val after = lineText.cut(caret.col)

        if (isRoot) {
            // La puce zoomée est le titre de la page : Entrée ajoute un premier enfant avec le texte après le curseur.
            val kept = doc.cut(lineEnd(item.line), lineEnd(item.contentEnd))
            val caretPos = from + kept.length + 1 + childPrefix.length
            return TextChange(from, lineEnd(item.contentEnd), "$kept\n$childPrefix${after.trimStart()}", caretPos, caretPos)
        }

        if (text.isBlank() && item.children.isEmpty() && item.contentEnd == item.line) {
            if (item.parent != null) return outdentItems(sel, options) ?: noop(sel)
            // Quitter la liste : la puce vide devient une ligne vide.
            return TextChange(lineStart, lineStart + lineText.length, "", lineStart, lineStart)
        }

        if (caret.col == item.textStart) {
            // Au début : une puce vide au-dessus, le curseur reste avec le texte.
            val prefix = lineText.cut(0, item.textStart).replaceFirst(Regex("""\[[xX]\]"""), "[ ]")
            val caretPos = lineStart + prefix.length + 1 + item.textStart
            return TextChange(lineStart, lineStart, "$prefix\n", caretPos, caretPos)
        }

        if (caret.col >= lineText.length) {
            if (item.children.isNotEmpty() && !folded) return firstChild()
            if (item.contentEnd > item.line && !folded) return insertAt(lineEnd(item.line), "\n" + " ".repeat(contentColumn(item)))
            return nextSibling()
        }

        // Au milieu : le texte après le curseur devient la puce suivante et garde les enfants.
        val first = lineText.cut(0, item.textStart) + before.trimEnd()
        val second = siblingPrefix + after.trimStart()
        val caretPos = lineStart + first.length + 1 + siblingPrefix.length
        return TextChange(lineStart, lineStart + lineText.length, "$first\n$second", caretPos, caretPos)
    }

    /** Retour à la ligne dans la puce, la ligne suivante alignée sur son texte. */
    fun softBreak(sel: TextEdit): TextChange? {
        val outline = parse(sel.text)
        val line = lineOf(sel.text, sel.selStart)
        if (outline.code[line]) return null
        val index = outline.owner[line] ?: return null
        val insert = "\n" + " ".repeat(contentColumn(outline.items[index]))
        val at = sel.selStart + insert.length
        return TextChange(sel.selStart, sel.selEnd, insert, at, at)
    }

    /**
     * Retour arrière juste au début du texte d'une puce : retire d'abord la case ; supprime une puce vide ; fusionne
     * une puce sans enfants avec la ligne du dessus ; quitte la liste quand rien n'est au-dessus. Null ailleurs.
     */
    fun backspaceItem(sel: TextEdit, options: OutlineOptions = OutlineOptions()): TextChange? {
        if (sel.selStart != sel.selEnd) return null
        val outline = parse(sel.text)
        val caret = toCaret(sel.text, sel.selStart)
        val index = outline.owner[caret.line]
        if (index == null || outline.code[caret.line]) return null
        val item = outline.items[index]
        if (item.line != caret.line || caret.col != item.textStart) return null
        val starts = lineStarts(outline.lines)
        val lineStart = starts[caret.line]
        if (isZoomRoot(options, item.line)) return noop(sel)
        if (item.box.isNotEmpty()) {
            val boxAt = lineStart + item.indent + item.marker.length
            return TextChange(boxAt, boxAt + item.box.length, "", boxAt, boxAt)
        }
        if (item.children.isNotEmpty() || item.contentEnd > item.line) return noop(sel)
        val above = if (caret.line > 0) caret.line - 1 else null
        val canMerge = above != null &&
            outline.lines[above].isNotBlank() &&
            !outline.code[above] &&
            outline.owner[above] != null &&
            !(options.rootLine != null && above < options.rootLine)
        if (canMerge) {
            val join = starts[above!!] + outline.lines[above].length
            return TextChange(join, lineStart + item.textStart, "", join, join)
        }
        // Rien au-dessus : la puce devient une ligne simple.
        return TextChange(lineStart, lineStart + item.textStart, "", lineStart, lineStart)
    }

    /** Case : aucune → `[ ]` → `[x]` → `[ ]` sur les puces choisies ; une ligne simple devient `- [ ]`. */
    fun toggleItemBox(sel: TextEdit): TextChange? {
        val outline = parse(sel.text)
        if (inCode(outline, sel)) return null
        val first = lineOf(sel.text, sel.selStart)
        val last = lastSelectedLine(sel)
        val deltas = HashMap<Int, Pair<Int, Int>>()
        val next = outline.lines.subList(first, last + 1).mapIndexed { k, line ->
            val n = first + k
            val item = outline.owner[n]?.let { outline.items[it] }
            if (item != null && item.line == n) {
                val at = item.indent + item.marker.length
                val box = when (item.box) {
                    "" -> "[ ] "
                    "[ ] " -> "[x] "
                    else -> "[ ] "
                }
                deltas[n] = at to (box.length - item.box.length)
                return@mapIndexed line.substring(0, at) + box + line.substring(at + item.box.length)
            }
            if (item != null || outline.code[n]) return@mapIndexed line
            if (line.isBlank() && first != last) return@mapIndexed line
            if (PROSE_BLOCK.containsMatchIn(line)) return@mapIndexed line
            val ws = leading(line)
            deltas[n] = ws.length to 6
            "$ws- [ ] ${line.substring(ws.length)}"
        }
        return rewrite(outline, first, last, next, sel) { c ->
            val d = deltas[c.line] ?: return@rewrite c
            Caret(c.line, if (c.col >= d.first) c.col + d.second else c.col)
        }
    }

    /** Ce qu'un repli cache : de la fin de la première ligne de la puce à la fin de son sous-arbre ; null sans rien dessous. */
    fun foldRange(doc: String, line: Int): IntRange? = foldRange(parse(doc), line)

    fun foldRange(outline: OutlineDoc, line: Int): IntRange? {
        val index = itemAtLine(outline, line)
        if (index < 0) return null
        val item = outline.items[index]
        var end = item.end
        while (end > item.line && outline.lines[end].isBlank()) end--
        if (end == item.line) return null
        val starts = lineStarts(outline.lines)
        return (starts[item.line] + outline.lines[item.line].length)..(starts[end] + outline.lines[end].length)
    }

    /** Une clé par puce qui survit aux éditions ailleurs : son texte et son rang parmi les puces de même texte. */
    fun itemKeys(outline: OutlineDoc): Map<Int, String> {
        val seen = HashMap<String, Int>()
        val keys = LinkedHashMap<Int, String>()
        for (item in outline.items) {
            val text = item.text.trim().lowercase()
            val n = seen[text] ?: 0
            seen[text] = n + 1
            keys[item.line] = "$text#$n"
        }
        return keys
    }

    /** Les premières lignes des puces, du haut jusqu'à celle de [line] comprise. */
    fun ancestorLines(outline: OutlineDoc, line: Int): List<Int> {
        val index = itemAtLine(outline, line)
        if (index < 0) return emptyList()
        val out = ArrayDeque<Int>()
        var i: Int? = index
        while (i != null) {
            out.addFirst(outline.items[i].line)
            i = outline.items[i].parent
        }
        return out.toList()
    }

    /** La puce de [line] et ses enfants en texte à part, sans retrait. */
    fun subtreeText(doc: String, line: Int): String? {
        val outline = parse(doc)
        val index = itemAtLine(outline, line)
        if (index < 0) return null
        val item = outline.items[index]
        return outline.lines.subList(item.line, item.end + 1).joinToString("\n") { shiftLine(it, -item.indent) }
    }

    /** Remet [text] (rendu par [subtreeText], modifié) à la place du sous-arbre de [line]. */
    fun replaceSubtree(doc: String, line: Int, text: String): String {
        val outline = parse(doc)
        val index = itemAtLine(outline, line)
        if (index < 0) return doc
        val item = outline.items[index]
        val next = text.split("\n").map { shiftLine(it, item.indent) }
        return (outline.lines.subList(0, item.line) + next + outline.lines.subList(item.end + 1, outline.lines.size)).joinToString("\n")
    }

    private val PLAIN_STEPS = listOf(
        Regex("""\[\[\s*task:\s*([^\[\]\n]+?)\]\]""", RegexOption.IGNORE_CASE) to "$1",
        Regex("""\[\[([^\[\]\n]+?)\]\]""") to "$1",
        Regex("""@\[([^\]\n]*)\]\(person:[0-9a-z-]+\)""", RegexOption.IGNORE_CASE) to "$1",
        Regex("""!?\[([^\]\n]*)\]\([^)\n]*\)""") to "$1",
        Regex("""(\*\*|__|~~|`)""") to "",
        Regex("""(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)""") to "$1$2",
        Regex("""[\[\]]""") to "",
        Regex("""\s+""") to " ",
    )

    /** Le texte d'une puce sans Markdown, comme nom de tâche (255 caractères au plus). */
    fun plainItemText(text: String): String =
        PLAIN_STEPS.fold(text) { acc, (regex, replacement) -> acc.replace(regex, replacement) }.trim().take(255)

    /** Une tâche liée tirée d'une puce : son nom et l'édition qui remplace le texte par `[[task:Nom]]`. */
    data class TaskFromItem(val name: String, val edit: TextChange)

    /** La puce du curseur devenue tâche liée (case gardée). Null hors puce, sur une puce vide ou déjà liée. */
    fun taskFromItem(sel: TextEdit): TaskFromItem? {
        val outline = parse(sel.text)
        val line = lineOf(sel.text, sel.selStart)
        val index = outline.owner[line]
        if (index == null || outline.code[line]) return null
        val item = outline.items[index]
        if (ONLY_TASK_LINK.containsMatchIn(item.text)) return null
        val name = plainItemText(item.text)
        if (name.isEmpty()) return null
        val starts = lineStarts(outline.lines)
        val from = starts[item.line] + item.textStart
        val to = starts[item.line] + outline.lines[item.line].length
        val insert = "[[task:$name]]"
        return TaskFromItem(name, TextChange(from, to, insert, from + insert.length, from + insert.length))
    }

    private val BLOCK_START = Regex("""^[\s#>|`~\-*+]""")

    /**
     * Ce que taper [text] sur une ligne vide de premier niveau doit insérer : `- ` d'abord, pour que chaque ligne
     * neuve soit une puce. Les débuts de blocs Markdown (titres, citations, tableaux, code, puce tapée) restent.
     */
    fun autoBullet(doc: String, pos: Int, text: String): String? {
        if (text.isEmpty() || BLOCK_START.containsMatchIn(text)) return null
        val outline = parse(doc)
        val line = lineOf(doc, pos)
        if (outline.lines[line] != "" || outline.code[line]) return null
        // Dans une puce (ligne vide de son contenu) : rien.
        if (outline.owner[line] != null) return null
        val above = if (line > 0) outline.lines[line - 1] else ""
        if (TABLE_ROW.containsMatchIn(above)) return null
        return "- $text"
    }
}

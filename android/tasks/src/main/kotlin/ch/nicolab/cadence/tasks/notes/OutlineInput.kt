package ch.nicolab.cadence.tasks.notes

/**
 * Le clavier du téléphone n'envoie pas de touches, seulement des textes successifs : on reconnaît ici Entrée, le
 * retour arrière et la frappe sur une ligne vide dans le passage d'un texte au suivant, pour leur appliquer les
 * règles du plan ([NoteOutline]), comme les touches du web.
 */
object OutlineInput {
    /**
     * Le texte à garder après une saisie qui fait passer le champ de [before] à [after] ; null quand la saisie
     * reste telle quelle (le champ garde alors la composition du clavier).
     */
    fun interpret(before: TextEdit, after: TextEdit, options: OutlineOptions = OutlineOptions()): TextEdit? {
        if (before.text == after.text) return null
        backspace(before, after, options)?.let { return it }
        val caret = minOf(before.selStart, after.selStart)
        val prefix = commonPrefix(before.text, after.text).coerceAtMost(caret)
        val suffix = commonSuffix(before.text, after.text, prefix)
        val oldMid = before.text.substring(prefix, before.text.length - suffix)
        val newMid = after.text.substring(prefix, after.text.length - suffix)
        val collapsedAfter = after.selStart == after.selEnd && after.selStart == prefix + newMid.length
        if (!collapsedAfter || oldMid.contains('\n')) return null
        if (newMid.endsWith('\n') && newMid.count { it == '\n' } == 1) {
            // Entrée, éventuellement avec la fin d'un mot que le clavier valide en même temps.
            val typed = newMid.dropLast(1)
            val middle = TextEdit(before.text.substring(0, prefix) + typed + before.text.substring(prefix + oldMid.length), prefix + typed.length)
            val edit = NoteOutline.splitItem(middle, options) ?: return null
            return if (NoteOutline.isNoop(edit, middle)) middle else edit.result(middle.text)
        }
        if (oldMid.isEmpty() && newMid.isNotEmpty() && !newMid.contains('\n') && before.selStart == before.selEnd && before.selStart == prefix) {
            val bullet = NoteOutline.autoBullet(before.text, prefix, newMid) ?: return null
            val text = before.text.substring(0, prefix) + bullet + before.text.substring(prefix)
            return TextEdit(text, prefix + bullet.length)
        }
        return null
    }

    /** Un seul caractère effacé juste avant un curseur seul : la règle du plan s'applique, ou la touche est sans effet. */
    private fun backspace(before: TextEdit, after: TextEdit, options: OutlineOptions): TextEdit? {
        val c = before.selStart
        val isBackspace = before.selEnd == c && c > 0 && after.selStart == c - 1 && after.selEnd == c - 1 &&
            after.text.length == before.text.length - 1 &&
            after.text == before.text.removeRange(c - 1, c)
        if (!isBackspace) return null
        val edit = NoteOutline.backspaceItem(before, options) ?: return null
        return if (NoteOutline.isNoop(edit, before)) before else edit.result(before.text)
    }

    private fun commonPrefix(a: String, b: String): Int {
        val max = minOf(a.length, b.length)
        var i = 0
        while (i < max && a[i] == b[i]) i++
        return i
    }

    private fun commonSuffix(a: String, b: String, prefix: Int): Int {
        val max = minOf(a.length, b.length) - prefix
        var i = 0
        while (i < max && a[a.length - 1 - i] == b[b.length - 1 - i]) i++
        return i
    }

    /**
     * Les premières lignes des puces repliées après une saisie : une ligne au-dessus du changement garde son numéro,
     * une ligne au-dessous suit les retours à la ligne ajoutés ou retirés, une ligne effacée perd son repli. Le
     * changement ne commence pas après [caret] (le curseur avant la saisie), ce qui lève l'ambiguïté des répétitions.
     */
    fun mapFoldedLines(before: String, after: String, folded: Set<Int>, caret: Int = Int.MAX_VALUE): Set<Int> {
        if (before == after || folded.isEmpty()) return folded
        val prefix = commonPrefix(before, after).coerceAtMost(caret)
        val suffix = commonSuffix(before, after, prefix)
        val oldEnd = before.length - suffix
        val removedBreak = before.substring(prefix, oldEnd).contains('\n')
        val delta = after.substring(prefix, after.length - suffix).count { it == '\n' } -
            before.substring(prefix, oldEnd).count { it == '\n' }
        val starts = NoteOutline.lineStarts(before.split("\n"))
        return folded.mapNotNull { line ->
            val start = starts.getOrNull(line) ?: return@mapNotNull null
            when {
                start < prefix -> line
                start == prefix -> if (removedBreak) null else line + delta
                start > oldEnd -> line + delta
                else -> null
            }
        }.toSet()
    }

    /** Les lignes des puces dont la clé ([NoteOutline.itemKeys]) est dans [keys]. */
    fun linesOfKeys(doc: String, keys: Collection<String>): Set<Int> {
        if (keys.isEmpty()) return emptySet()
        val wanted = keys.toSet()
        return NoteOutline.itemKeys(NoteOutline.parse(doc)).filterValues { it in wanted }.keys
    }

    /** Les clés des puces repliées de [lines] qui ont bien quelque chose à replier. */
    fun keysOfLines(doc: String, lines: Set<Int>): List<String> {
        if (lines.isEmpty()) return emptyList()
        val outline = NoteOutline.parse(doc)
        val keys = NoteOutline.itemKeys(outline)
        return lines.sorted().filter { NoteOutline.foldRange(outline, it) != null }.mapNotNull { keys[it] }
    }

    /** Ce que cachent les replis de [lines] dans [doc] : un intervalle [début, fin) par puce, sans les replis imbriqués. */
    fun hiddenRanges(doc: String, lines: Set<Int>): List<IntRange> {
        if (lines.isEmpty()) return emptyList()
        val outline = NoteOutline.parse(doc)
        val out = mutableListOf<IntRange>()
        for (line in lines.sorted()) {
            val range = NoteOutline.foldRange(outline, line) ?: continue
            if (out.isNotEmpty() && range.first < out.last().last) continue
            out += range
        }
        return out
    }

    /** La puce repliée qui cache [pos], par sa première ligne ; null si la position est visible. */
    fun foldHiding(doc: String, lines: Set<Int>, pos: Int): Int? {
        if (lines.isEmpty()) return null
        val outline = NoteOutline.parse(doc)
        return lines.sorted().firstOrNull { line ->
            NoteOutline.foldRange(outline, line)?.let { pos > it.first && pos <= it.last } == true
        }
    }

    /** La première ligne de la puce du curseur, ou null (hors puce, dans du code). */
    fun caretItemLine(sel: TextEdit): Int? {
        val outline = NoteOutline.parse(sel.text)
        val line = NoteOutline.lineOf(sel.text, sel.selStart)
        if (outline.code[line]) return null
        return outline.owner[line]?.let { outline.items[it].line }
    }

    /** La position de la fin de la ligne [line] de [doc]. */
    fun endOfLine(doc: String, line: Int): Int {
        val lines = doc.split("\n")
        val n = line.coerceIn(0, lines.lastIndex)
        return NoteOutline.lineStarts(lines)[n] + lines[n].length
    }

    private val MENTION = Regex("""(?:^|[\s(])@([^\s@\[\]()]{0,40})$""")
    private val WIKI = Regex("""\[\[([^\[\]\n]{0,60})$""")

    /** Un mot en cours de saisie qui ouvre un choix : `@nom` (personnes) ou `[[titre` (notes). */
    data class Trigger(val kind: Kind, val query: String, val start: Int, val end: Int) {
        enum class Kind { MENTION, NOTE }
    }

    /** Le choix à ouvrir pour le curseur seul de [sel] ; un `@` au milieu d'un mot (adresse e-mail) n'ouvre rien. */
    fun trigger(sel: TextEdit): Trigger? {
        if (sel.selStart != sel.selEnd) return null
        val before = sel.text.substring(0, sel.selStart)
        WIKI.find(before)?.let { m ->
            val query = m.groupValues[1]
            if (query.startsWith("task:", ignoreCase = true)) return null
            val close = if (sel.text.startsWith("]]", sel.selStart)) 2 else 0
            return Trigger(Trigger.Kind.NOTE, query, m.range.first, sel.selStart + close)
        }
        MENTION.find(before)?.let { m ->
            val query = m.groupValues[1]
            return Trigger(Trigger.Kind.MENTION, query, sel.selStart - query.length - 1, sel.selStart)
        }
        return null
    }

    /** `@[Nom](person:uid)`, comme `mentionToken` du web. */
    fun mentionToken(name: String, uid: String): String = "@[${name.replace(Regex("""[\[\]\n]"""), " ").trim()}](person:$uid)"

    /** Remplace le mot du choix par [token] suivi d'une espace, curseur après. */
    fun complete(sel: TextEdit, trigger: Trigger, token: String): TextEdit {
        val insert = "$token "
        val text = sel.text.substring(0, trigger.start) + insert + sel.text.substring(trigger.end)
        return TextEdit(text, trigger.start + insert.length)
    }
}

/**
 * Affichage d'un texte dont des intervalles sont cachés par des replis : chacun devient [PLACEHOLDER]. Les positions
 * passent d'un texte à l'autre ; une position cachée se lit au début de l'espace réservé.
 */
class FoldMapping(private val ranges: List<IntRange>) {
    fun transform(text: String): String {
        if (ranges.isEmpty()) return text
        val out = StringBuilder()
        var at = 0
        for (r in ranges) {
            out.append(text, at, r.first).append(PLACEHOLDER)
            at = r.last
        }
        return out.append(text, at, text.length).toString()
    }

    fun toTransformed(offset: Int): Int {
        var removed = 0
        for (r in ranges) {
            if (offset <= r.first) break
            if (offset < r.last) return r.first - removed
            removed += (r.last - r.first) - PLACEHOLDER.length
        }
        return offset - removed
    }

    fun toOriginal(offset: Int): Int {
        var removed = 0
        for (r in ranges) {
            val start = r.first - removed
            if (offset <= start) break
            if (offset < start + PLACEHOLDER.length) return r.first
            removed += (r.last - r.first) - PLACEHOLDER.length
        }
        return offset + removed
    }

    companion object {
        const val PLACEHOLDER = " …"
    }
}

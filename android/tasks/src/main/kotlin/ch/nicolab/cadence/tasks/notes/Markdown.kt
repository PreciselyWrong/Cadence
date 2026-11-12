package ch.nicolab.cadence.tasks.notes

import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.TextLinks

/** Segment de texte en ligne partageant un même style ; [link] est la cible d'un lien. */
data class MdRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val strike: Boolean = false,
    val link: String? = null,
    /** Titre de la note visée par un lien `[[titre]]` ; le texte est alors ce titre. */
    val wiki: String? = null,
    /** Lien interne vers une tâche, une personne ou une note par son uid (`docs/44-notes-links.md`). */
    val ref: ContentRef? = null,
)

/** Cible d'un lien interne autre que `[[titre]]` de note. */
sealed interface ContentRef {
    /** `[[task:Nom]]` (par nom) ou `/task/<uid>`. */
    data class Task(val name: String?, val uid: String?) : ContentRef

    /** `@[Nom](person:<uid>)` ou `/person/<uid>`. */
    data class Person(val uid: String) : ContentRef

    /** `/note/<uid>` ou `/notes/<uid>`. */
    data class Note(val uid: String) : ContentRef
}

/** Bloc markdown ; [line] est l'index (base 0) de sa première ligne dans le contenu source. */
sealed interface MdBlock {
    val line: Int

    data class Heading(override val line: Int, val level: Int, val text: String) : MdBlock
    data class Paragraph(override val line: Int, val text: String) : MdBlock
    data class Item(
        override val line: Int,
        val indent: Int,
        /** Null pour une puce, le numéro affiché pour une liste ordonnée. */
        val number: Int?,
        /** Null hors liste de cases ; sinon l'état coché. */
        val checked: Boolean?,
        val text: String,
    ) : MdBlock
    data class Quote(override val line: Int, val text: String) : MdBlock
    data class Code(override val line: Int, val text: String) : MdBlock
    data class Rule(override val line: Int) : MdBlock

    /** Tableau GFM : cellules en texte en ligne, l'en-tête à part. */
    data class Table(override val line: Int, val header: List<String>, val rows: List<List<String>>) : MdBlock
}

/**
 * Sous-ensemble de markdown utile aux notes : titres, listes (puces, numérotées, cases), citations,
 * code, filet, gras, italique, code en ligne, barré et liens. Rien d'autre n'est interprété :
 * un texte inconnu reste affiché tel quel.
 */
object Markdown {
    private val heading = Regex("""^(#{1,6})\s+(.*)$""")
    private val checkbox = Regex("""^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$""")
    private val bullet = Regex("""^(\s*)[-*+]\s+(.*)$""")
    private val ordered = Regex("""^(\s*)(\d{1,9})[.)]\s+(.*)$""")
    private val quote = Regex("""^>\s?(.*)$""")
    private val rule = Regex("""^\s*([-*_])(\s*\1){2,}\s*$""")
    private val fence = Regex("""^\s*(```|~~~)""")
    private val tableDelimiter = Regex("""^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$""")
    private val mention = Regex("""^@\[([^\]\n]*)\]\(person:([0-9a-z]{15})\)""")
    private val appPath = Regex("""^\((?:https?://[^\s/()]+)?/(note|notes|task|person)/([0-9a-z]{15})[0-9a-z-]*\)""")
    private const val TASK_PREFIX = "task:"

    fun parse(source: String): List<MdBlock> {
        val lines = source.split("\n").map { it.trimEnd('\r') }
        val blocks = mutableListOf<MdBlock>()
        var paragraph: MutableList<String>? = null
        var paragraphStart = 0
        fun endParagraph() {
            paragraph?.let { blocks += MdBlock.Paragraph(paragraphStart, it.joinToString("\n")) }
            paragraph = null
        }
        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            val block: MdBlock? = when {
                line.isBlank() -> null
                fence.containsMatchIn(line) -> {
                    var end = index + 1
                    while (end < lines.size && !fence.containsMatchIn(lines[end])) end++
                    val body = lines.subList(index + 1, minOf(end, lines.size)).joinToString("\n")
                    val code = MdBlock.Code(index, body)
                    endParagraph()
                    blocks += code
                    index = end + 1
                    continue
                }
                line.contains('|') && lines.getOrNull(index + 1)?.let { tableDelimiter.matches(it) && it.contains('-') } == true -> {
                    val header = cells(line)
                    var end = index + 2
                    val rows = mutableListOf<List<String>>()
                    while (end < lines.size && lines[end].contains('|') && lines[end].isNotBlank()) {
                        rows += cells(lines[end]).let { row -> List(header.size) { row.getOrElse(it) { "" } } }
                        end++
                    }
                    endParagraph()
                    blocks += MdBlock.Table(index, header, rows)
                    index = end
                    continue
                }
                rule.matches(line) -> MdBlock.Rule(index)
                heading.matchEntire(line) != null -> heading.matchEntire(line)!!.let {
                    MdBlock.Heading(index, it.groupValues[1].length, it.groupValues[2].trim())
                }
                checkbox.matchEntire(line) != null -> checkbox.matchEntire(line)!!.let {
                    MdBlock.Item(index, it.groupValues[1].length, null, it.groupValues[2] != " ", it.groupValues[3])
                }
                bullet.matchEntire(line) != null -> bullet.matchEntire(line)!!.let {
                    MdBlock.Item(index, it.groupValues[1].length, null, null, it.groupValues[2])
                }
                ordered.matchEntire(line) != null -> ordered.matchEntire(line)!!.let {
                    MdBlock.Item(index, it.groupValues[1].length, it.groupValues[2].toInt(), null, it.groupValues[3])
                }
                quote.matchEntire(line) != null -> MdBlock.Quote(index, quote.matchEntire(line)!!.groupValues[1])
                else -> {
                    if (paragraph == null) {
                        paragraph = mutableListOf()
                        paragraphStart = index
                    }
                    paragraph!!.add(line)
                    index++
                    continue
                }
            }
            endParagraph()
            if (block != null) blocks += block
            index++
        }
        endParagraph()
        return blocks
    }

    /** Segments stylés d'un texte en ligne, adjacents de même style fusionnés. */
    fun inline(text: String): List<MdRun> {
        val out = mutableListOf<MdRun>()
        scan(text, MdRun(""), out)
        return out.fold(mutableListOf()) { merged, run ->
            val last = merged.lastOrNull()
            if (last != null && last.copy(text = "") == run.copy(text = "") && run.link == null && run.wiki == null && run.ref == null) {
                merged[merged.lastIndex] = last.copy(text = last.text + run.text)
            } else {
                merged += run
            }
            merged
        }
    }

    /** Texte sans syntaxe pour les aperçus de carte : cases rendues par ☐ / ☑, puces par •. */
    fun preview(source: String, maxLines: Int): String = parse(source).asSequence().mapNotNull { block ->
        when (block) {
            is MdBlock.Heading -> plain(block.text)
            is MdBlock.Paragraph -> plain(block.text.replace('\n', ' '))
            is MdBlock.Item -> {
                val marker = when {
                    block.checked == true -> "☑ "
                    block.checked == false -> "☐ "
                    block.number != null -> "${block.number}. "
                    else -> "• "
                }
                marker + plain(block.text)
            }
            is MdBlock.Quote -> plain(block.text)
            is MdBlock.Code -> block.text.lineSequence().firstOrNull()
            is MdBlock.Rule -> null
            is MdBlock.Table -> block.header.joinToString(" · ") { plain(it) }
        }?.takeIf { it.isNotBlank() }
    }.take(maxLines).joinToString("\n")

    /** Cellules d'une ligne de tableau, sans les `|` des bords ; `\|` reste un caractère. */
    private fun cells(line: String): List<String> {
        val trimmed = line.trim().removePrefix("|").let { if (it.endsWith("|") && !it.endsWith("\\|")) it.dropLast(1) else it }
        return trimmed.split(Regex("""(?<!\\)\|""")).map { it.trim().replace("\\|", "|") }
    }

    private fun plain(text: String): String = inline(text).joinToString("") { it.text }

    private fun scan(source: String, style: MdRun, out: MutableList<MdRun>) {
        val buffer = StringBuilder()
        fun flush() {
            if (buffer.isNotEmpty()) {
                out += style.copy(text = buffer.toString())
                buffer.clear()
            }
        }
        var i = 0
        while (i < source.length) {
            val c = source[i]
            val handled: Int = when {
                c == '\\' && i + 1 < source.length && source[i + 1] in ESCAPABLE -> {
                    buffer.append(source[i + 1])
                    i + 2
                }
                c == '`' -> {
                    val end = source.indexOf('`', i + 1)
                    if (end > i + 1) {
                        flush()
                        out += style.copy(text = source.substring(i + 1, end), code = true)
                        end + 1
                    } else {
                        -1
                    }
                }
                source.startsWith("**", i) || source.startsWith("__", i) ->
                    pair(source, i, source.substring(i, i + 2), style.copy(bold = true), out, ::flush)
                source.startsWith("~~", i) -> pair(source, i, "~~", style.copy(strike = true), out, ::flush)
                (c == '*' || c == '_') && canOpenEmphasis(source, i) ->
                    pair(source, i, c.toString(), style.copy(italic = true), out, ::flush)
                source.startsWith("[[", i) && WikiLinks.at(source, i) != null -> wikiLink(source, i, style, out, ::flush)
                c == '@' && (i == 0 || !source[i - 1].isLetterOrDigit()) && mention.find(source.substring(i)) != null ->
                    mentionLink(source, i, style, out, ::flush)
                c == '[' -> markdownLink(source, i, style, out, ::flush)
                (c.isLetterOrDigit() || c == '+') && (i == 0 || !source[i - 1].isLetterOrDigit()) ->
                    bareLink(source, i, style, out, ::flush)
                else -> -1
            }
            if (handled >= 0) {
                i = handled
            } else {
                buffer.append(c)
                i++
            }
        }
        flush()
    }

    /** Un `_` en milieu de mot (snake_case) n'ouvre pas d'italique, ni un marqueur suivi d'un espace. */
    private fun canOpenEmphasis(source: String, i: Int): Boolean {
        val next = source.getOrNull(i + 1) ?: return false
        if (next.isWhitespace()) return false
        return source[i] == '*' || i == 0 || !source[i - 1].isLetterOrDigit()
    }

    private fun pair(
        source: String,
        start: Int,
        marker: String,
        inner: MdRun,
        out: MutableList<MdRun>,
        flush: () -> Unit,
    ): Int {
        val end = source.indexOf(marker, start + marker.length)
        if (end <= start + marker.length) return -1
        if (marker.length == 1 && marker == "_" && source.getOrNull(end + 1)?.isLetterOrDigit() == true) return -1
        flush()
        scan(source.substring(start + marker.length, end), inner, out)
        return end + marker.length
    }

    private fun markdownLink(source: String, start: Int, style: MdRun, out: MutableList<MdRun>, flush: () -> Unit): Int {
        val close = source.indexOf("](", start + 1)
        if (close < 0) return -1
        appPath.find(source.substring(close + 1))?.let { path ->
            val label = source.substring(start + 1, close)
            if (label.isEmpty()) return -1
            val uid = path.groupValues[2]
            val ref = when (path.groupValues[1]) {
                "task" -> ContentRef.Task(null, uid)
                "person" -> ContentRef.Person(uid)
                else -> ContentRef.Note(uid)
            }
            flush()
            out += style.copy(text = label, ref = ref)
            return close + 1 + path.value.length
        }
        val match = LinkExtractor.matches(source.substring(close + 2)).firstOrNull()
        if (match == null || match.range.first != 0) return -1
        val label = source.substring(start + 1, close)
        if (label.isEmpty()) return -1
        flush()
        val labelRuns = mutableListOf<MdRun>()
        scan(label, style, labelRuns)
        labelRuns.forEach { out += it.copy(link = match.url) }
        val after = close + 2 + match.range.last + 1
        return if (source.getOrNull(after) == ')') after + 1 else after
    }

    private fun wikiLink(source: String, start: Int, style: MdRun, out: MutableList<MdRun>, flush: () -> Unit): Int {
        val link = WikiLinks.at(source, start) ?: return -1
        flush()
        if (link.title.startsWith(TASK_PREFIX, ignoreCase = true)) {
            val name = link.title.substring(TASK_PREFIX.length).trim()
            if (name.isEmpty()) return -1
            out += style.copy(text = name, ref = ContentRef.Task(name, null))
        } else {
            out += style.copy(text = link.title, wiki = link.title)
        }
        return link.end
    }

    private fun mentionLink(source: String, start: Int, style: MdRun, out: MutableList<MdRun>, flush: () -> Unit): Int {
        val match = mention.find(source.substring(start)) ?: return -1
        flush()
        out += style.copy(text = "@" + match.groupValues[1], ref = ContentRef.Person(match.groupValues[2]))
        return start + match.value.length
    }

    private fun bareLink(source: String, start: Int, style: MdRun, out: MutableList<MdRun>, flush: () -> Unit): Int {
        val match = TextLinks.matches(source.substring(start)).firstOrNull()
        if (match == null || match.range.first != 0) return -1
        flush()
        out += style.copy(text = source.substring(start, start + match.range.last + 1), link = match.url)
        return start + match.range.last + 1
    }

    private const val ESCAPABLE = "\\`*_[]()#~>-+!"
}

/** Cases à cocher d'un contenu markdown : le contenu est la seule source de vérité de l'état. */
object MarkdownCheckbox {
    private val line = Regex("""^(\s*[-*+]\s+\[)([ xX])(\].*)$""", RegexOption.DOT_MATCHES_ALL)

    /** Bascule la case de la ligne [lineIndex] ; un contenu sans case à cet endroit revient inchangé. */
    fun toggle(content: String, lineIndex: Int): String {
        val lines = content.split("\n").toMutableList()
        val current = lines.getOrNull(lineIndex) ?: return content
        val match = line.matchEntire(current) ?: return content
        val next = if (match.groupValues[2] == " ") "x" else " "
        lines[lineIndex] = match.groupValues[1] + next + match.groupValues[3]
        return lines.joinToString("\n")
    }
}

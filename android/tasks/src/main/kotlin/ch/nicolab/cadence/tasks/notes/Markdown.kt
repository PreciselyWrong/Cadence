package ch.nicolab.cadence.tasks.notes

import ch.nicolab.cadence.tasks.links.LinkExtractor

/** Segment de texte en ligne partageant un même style ; [link] est la cible d'un lien. */
data class MdRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val strike: Boolean = false,
    val link: String? = null,
)

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
    private val fence = Regex("""^\s*```""")

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
            if (last != null && last.copy(text = "") == run.copy(text = "") && run.link == null) {
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
        }?.takeIf { it.isNotBlank() }
    }.take(maxLines).joinToString("\n")

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
                c == '[' -> markdownLink(source, i, style, out, ::flush)
                (c == 'h' || c == 'H') && (i == 0 || !source[i - 1].isLetterOrDigit()) ->
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

    private fun bareLink(source: String, start: Int, style: MdRun, out: MutableList<MdRun>, flush: () -> Unit): Int {
        val match = LinkExtractor.matches(source.substring(start)).firstOrNull()
        if (match == null || match.range.first != 0) return -1
        flush()
        out += style.copy(text = match.url, link = match.url)
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

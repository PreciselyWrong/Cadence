package ch.nicolab.cadence.tasks.ui

/**
 * Les descriptions d'événements viennent souvent de Google Agenda en HTML léger. Ce texte brut garde
 * les retours à la ligne, les puces et l'adresse de chaque lien (pour l'aperçu), sans interpréter de balise.
 */
internal object EventDescription {
    private val anchor = Regex("""<a\s[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>(.*?)</a>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    private val lineBreak = Regex("""<br\s*/?>|</p\s*>|</div\s*>|</li\s*>|</h[1-6]\s*>""", RegexOption.IGNORE_CASE)
    private val bullet = Regex("""<li[^>]*>""", RegexOption.IGNORE_CASE)
    private val tag = Regex("""<[^>]+>""")
    private val blankRun = Regex("""\n{3,}""")

    fun plain(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val withLinks = anchor.replace(raw) { match ->
            val href = match.groupValues[1]
            val label = match.groupValues[2].replace(tag, "").trim()
            if (label.isEmpty() || href.isEmpty() || label.contains(href)) label.ifEmpty { href } else "$label $href"
        }
        val text = withLinks
            .replace(lineBreak, "\n")
            .replace(bullet, "• ")
            .replace(tag, "")
            .replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&amp;", "&")
            .replace(blankRun, "\n\n")
            .trim()
        return text.ifEmpty { null }
    }
}

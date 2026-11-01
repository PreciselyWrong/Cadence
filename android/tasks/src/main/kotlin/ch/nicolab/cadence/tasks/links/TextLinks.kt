package ch.nicolab.cadence.tasks.links

/**
 * Repère ce qu'on peut toucher dans un texte libre : liens http(s), adresses mail (`mailto:`)
 * et numéros de téléphone (`tel:`). Un passage déjà pris par un lien plus fort (une url qui contient
 * un mail, par exemple) n'est pas repris une seconde fois.
 */
object TextLinks {
    private val phone = Regex("""(?<![\w+])(?:\+\d{1,3}|0)(?:[ .-]?\d){8,14}(?!\w)""")
    private val email = Regex("""[\w.%+-]+@[\w-]+(?:\.[\w-]+)+""")

    fun matches(text: String): List<LinkMatch> {
        val taken = LinkExtractor.matches(text).toMutableList()
        for (found in email.findAll(text)) addIfFree(taken, LinkMatch(found.range, "mailto:${found.value}"))
        for (found in phone.findAll(text)) {
            val digits = found.value.filter { it.isDigit() || it == '+' }
            addIfFree(taken, LinkMatch(found.range, "tel:$digits"))
        }
        return taken.sortedBy { it.range.first }
    }

    private fun addIfFree(taken: MutableList<LinkMatch>, candidate: LinkMatch) {
        if (taken.none { it.range.first <= candidate.range.last && candidate.range.first <= it.range.last }) {
            taken += candidate
        }
    }
}

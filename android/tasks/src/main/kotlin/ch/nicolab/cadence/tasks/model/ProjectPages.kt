package ch.nicolab.cadence.tasks.model

import java.time.Instant

/** Pages d'un projet (`docs/37-links.md`) : la section de sa page et son export en Markdown. Fonctions pures. */
object ProjectPages {
    /** Les pages du [projectUid], dans l'ordre de création : la plus ancienne d'abord. */
    fun of(links: List<LinkItem>, projectUid: String): List<LinkItem> =
        links.filter { it.projectUid == projectUid }.sortedWith(compareBy<LinkItem> { it.createdAt ?: Instant.MAX }.thenBy { it.uid })

    /**
     * Une ligne par page, dans l'ordre donné : `- [Titre](adresse) — note`. Le titre retombe sur le domaine ; la note
     * n'apparaît que si elle existe, sur la même ligne.
     */
    fun markdown(pages: List<LinkItem>): String = pages.joinToString("\n") { page ->
        val note = noteLine(page.note)
        "- [${escape(page.displayTitle)}](${page.url})" + (note?.let { " — $it" }.orEmpty())
    }

    /** La note tenue sur une ligne (espaces et sauts de ligne réduits) ; null si elle est vide. */
    fun noteLine(note: String?): String? = note?.replace(Regex("\\s+"), " ")?.trim()?.ifEmpty { null }

    private fun escape(text: String): String = (noteLine(text) ?: "").replace("[", "\\[").replace("]", "\\]")
}

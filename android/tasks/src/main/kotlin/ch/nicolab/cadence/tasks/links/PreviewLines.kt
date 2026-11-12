package ch.nicolab.cadence.tasks.links

/**
 * Lignes d'information des aperçus de dépôts, écrites comme le reste de l'appli en français (virgule décimale).
 * Fonctions pures, sans horloge ni locale système.
 */
object PreviewLines {
    /** Étoiles en forme courte : moins de mille telles quelles, sinon des milliers à une décimale (« 1,2 k », « 2 k »). */
    fun compactStars(stars: Int): String {
        if (stars < 1000) return stars.toString()
        val tenths = (stars + 50) / 100
        val whole = tenths / 10
        val decimal = tenths % 10
        return if (decimal == 0) "$whole k" else "$whole,$decimal k"
    }

    /**
     * Ligne d'un dépôt avec étoiles, « ★ 1,2 k · Rust · 2026-11-01 » ; le langage et la date manquants sont omis.
     * Null pour tout autre genre de page ou un dépôt sans étoiles connues.
     */
    fun statsLine(kind: String?, stars: Int?, language: String?, lastCommit: String?): String? {
        if (kind != "repo" || stars == null) return null
        val parts = listOfNotNull(
            "★ ${compactStars(stars)}",
            language?.trim()?.ifEmpty { null },
            lastCommit?.trim()?.take(DATE_LENGTH)?.ifEmpty { null },
        )
        return parts.joinToString(" · ")
    }

    private const val DATE_LENGTH = 10
}

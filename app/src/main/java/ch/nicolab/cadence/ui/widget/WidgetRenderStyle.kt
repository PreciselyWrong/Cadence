package ch.nicolab.cadence.ui.widget

/**
 * Contrat d'un style de rendu du widget.
 *
 * Un style décrit entièrement son apparence — fond, contenu, pastille d'icône, arrondi —
 * pour que le widget, son aperçu et sa configuration lisent la même source. Ajouter une
 * variante se limite à ajouter une entrée dans [all] et son libellé dans `HabitLabels`.
 *
 * Les couleurs sont des ARGB opaques : le réglage de transparence s'applique par-dessus,
 * il n'appartient pas au style.
 */
data class WidgetRenderStyle(
    val id: String,
    val surfaceArgb: Int,
    val contentArgb: Int,
    /** Teinte de la pastille qui porte l'icône, avant application de [badgeAlpha]. */
    val badgeArgb: Int,
    val badgeAlpha: Float,
    val cornerRadiusDp: Int,
    /** Vrai lorsque le fond est clair : le contenu passe alors en encre sombre. */
    val isLight: Boolean,
) {
    /** Pastille de sélection présentée dans la configuration. */
    val swatchArgb: Int get() = surfaceArgb

    companion object {
        const val DEFAULT_ID = "HALO"

        /**
         * Halo reste en tête : c'est la variante de référence, validée avant l'ouverture
         * du contrat aux styles suivants.
         */
        val all: List<WidgetRenderStyle> = listOf(
            WidgetRenderStyle("HALO", 0xFF171B2E.toInt(), 0xFFF7F8FC.toInt(), 0xFFFFFFFF.toInt(), .14f, 28, false),
            WidgetRenderStyle("OCEAN", 0xFF073B4C.toInt(), 0xFFF7F8FC.toInt(), 0xFFFFFFFF.toInt(), .14f, 28, false),
            WidgetRenderStyle("FOREST", 0xFF12372A.toInt(), 0xFFF7F8FC.toInt(), 0xFFFFFFFF.toInt(), .14f, 28, false),
            WidgetRenderStyle("AUBERGINE", 0xFF35155D.toInt(), 0xFFF7F8FC.toInt(), 0xFFFFFFFF.toInt(), .14f, 28, false),
            WidgetRenderStyle("CORAL", 0xFF6D2932.toInt(), 0xFFF7F8FC.toInt(), 0xFFFFFFFF.toInt(), .14f, 28, false),
            WidgetRenderStyle("MONO", 0xFFF7F8FC.toInt(), 0xFF172033.toInt(), 0xFFE9EDF5.toInt(), .72f, 28, true),
            // Variantes ouvertes après validation du Halo : elles jouent aussi sur
            // l'arrondi et la densité de la pastille, pas seulement sur la couleur.
            WidgetRenderStyle("SLATE", 0xFF2B303B.toInt(), 0xFFF2F4F8.toInt(), 0xFFFFFFFF.toInt(), .10f, 20, false),
            WidgetRenderStyle("SAND", 0xFFF2E7D5.toInt(), 0xFF3B2F1E.toInt(), 0xFFFFFFFF.toInt(), .62f, 20, true),
            WidgetRenderStyle("INK", 0xFF05070D.toInt(), 0xFFEDF0F7.toInt(), 0xFFFFFFFF.toInt(), .08f, 8, false),
        )

        val default: WidgetRenderStyle = all.first()

        fun byId(id: String?): WidgetRenderStyle = all.firstOrNull { it.id == id } ?: default
    }
}

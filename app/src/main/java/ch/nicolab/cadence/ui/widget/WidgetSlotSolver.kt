package ch.nicolab.cadence.ui.widget

import ch.nicolab.cadence.domain.WidgetSlotMode

/**
 * Disposition d'une ligne de widget : combien d'habitudes s'affichent, dans quelle
 * largeur, et combien restent derrière le compteur de débordement.
 */
data class WidgetSlotLayout(
    /** Largeur d'un emplacement, identique pour toutes les habitudes de la ligne. */
    val slotWidthDp: Float,
    /** Nombre d'habitudes réellement dessinées. */
    val visibleCount: Int,
    /** Habitudes masquées, résumées par un `+n` ; zéro lorsque tout tient. */
    val overflowCount: Int,
) {
    val showsOverflow: Boolean get() = overflowCount > 0
}

object WidgetSlotSolver {

    /** Marge horizontale de la ligne, retirée avant le découpage en emplacements. */
    private const val ROW_PADDING_DP = 20f

    /**
     * En mode `FLEXIBLE`, les habitudes présentes se partagent la largeur : une habitude
     * cochée élargit les autres. En mode `FIXED`, la largeur est découpée selon le nombre
     * maximum configuré, donc un emplacement garde toujours la même taille, quel que soit
     * le nombre d'habitudes restantes.
     */
    fun solve(
        availableWidthDp: Int,
        iconSizeDp: Int,
        habitCount: Int,
        maxHabitsPerRow: Int,
        mode: WidgetSlotMode,
    ): WidgetSlotLayout {
        val configuredMaximum = maxHabitsPerRow.coerceIn(1, 6)
        if (habitCount <= 0) return WidgetSlotLayout(availableWidthDp.toFloat(), 0, 0)

        val physical = WidgetCapacityCalculator.calculateCapacity(
            availableWidthDp = availableWidthDp,
            iconSizeDp = iconSizeDp,
            // Le mode fixe découpe la largeur pour le maximum configuré, pas pour les
            // habitudes du moment : c'est ce qui fige l'espacement.
            totalHabitsCount = if (mode == WidgetSlotMode.FIXED) configuredMaximum else habitCount,
            maxHabitsPerRow = configuredMaximum,
        )
        val slots = physical.coerceAtLeast(1)
        val slotWidthDp = (availableWidthDp - ROW_PADDING_DP).coerceAtLeast(1f) / slots

        // Ce que la configuration promet d'afficher, et ce que la largeur permet vraiment.
        val configuredCount = habitCount.coerceAtMost(configuredMaximum)
        val fitting = habitCount.coerceAtMost(slots)
        val cramped = configuredCount > fitting && slots > 1
        val visible = if (cramped) slots - 1 else fitting
        return WidgetSlotLayout(slotWidthDp, visible, configuredCount - visible)
    }
}

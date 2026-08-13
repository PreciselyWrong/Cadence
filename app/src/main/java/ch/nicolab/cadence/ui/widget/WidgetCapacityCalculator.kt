package ch.nicolab.cadence.ui.widget

object WidgetCapacityCalculator {

    fun calculateCapacity(
        availableWidthDp: Int,
        iconSizeDp: Int,
        showValues: Boolean,
        totalHabitsCount: Int,
        maxHabitsPerRow: Int = 6,
    ): Int {
        if (totalHabitsCount <= 0) return 0

        val rowPaddingDp = 24
        val itemSpacingDp = 8
        val plusBadgeWidthDp = 40

        val netWidth = (availableWidthDp - rowPaddingDp).coerceAtLeast(40)

        // La valeur est empilée sous l’icône : elle ne consomme plus de largeur.
        val itemWidthDp = (iconSizeDp + if (showValues) 14 else 8).coerceAtLeast(40)

        val maxWithoutPlus = (netWidth + itemSpacingDp) / (itemWidthDp + itemSpacingDp)
        val configuredMaximum = maxHabitsPerRow.coerceIn(1, 6)
        if (totalHabitsCount <= maxWithoutPlus.coerceAtMost(configuredMaximum)) {
            return totalHabitsCount.coerceIn(1, configuredMaximum)
        }

        val widthForPlus = netWidth - plusBadgeWidthDp - itemSpacingDp
        val maxWithPlus = (widthForPlus + itemSpacingDp) / (itemWidthDp + itemSpacingDp)

        return maxWithPlus.coerceIn(1, totalHabitsCount).coerceAtMost(configuredMaximum)
    }
}

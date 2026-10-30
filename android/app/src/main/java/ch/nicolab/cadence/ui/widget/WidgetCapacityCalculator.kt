package ch.nicolab.cadence.ui.widget

object WidgetCapacityCalculator {

    fun calculateCapacity(
        availableWidthDp: Int,
        iconSizeDp: Int,
        totalHabitsCount: Int,
        maxHabitsPerRow: Int = 6,
    ): Int {
        if (totalHabitsCount <= 0) return 0

        val rowPaddingDp = 24
        val netWidth = (availableWidthDp - rowPaddingDp).coerceAtLeast(40)
        val itemWidthDp = (iconSizeDp + 8).coerceAtLeast(40)
        val physicalCapacity = netWidth / itemWidthDp
        val configuredMaximum = maxHabitsPerRow.coerceIn(1, 6)
        return physicalCapacity.coerceIn(1, totalHabitsCount).coerceAtMost(configuredMaximum)
    }
}

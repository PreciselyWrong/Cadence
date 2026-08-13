package ch.nicolab.cadence.ui.widget

object WidgetCapacityCalculator {

    fun calculateCapacity(
        availableWidthDp: Int,
        iconSizeDp: Int,
        showValues: Boolean,
        totalHabitsCount: Int,
    ): Int {
        if (totalHabitsCount <= 0) return 0

        val rowPaddingDp = 24
        val itemSpacingDp = 8
        val plusBadgeWidthDp = 40

        val netWidth = (availableWidthDp - rowPaddingDp).coerceAtLeast(40)

        val itemWidthDp = if (showValues) {
            (iconSizeDp + 36).coerceAtLeast(50)
        } else {
            (iconSizeDp + 8).coerceAtLeast(36)
        }

        val maxWithoutPlus = (netWidth + itemSpacingDp) / (itemWidthDp + itemSpacingDp)
        if (totalHabitsCount <= maxWithoutPlus) {
            return totalHabitsCount.coerceAtLeast(1)
        }

        val widthForPlus = netWidth - plusBadgeWidthDp - itemSpacingDp
        val maxWithPlus = (widthForPlus + itemSpacingDp) / (itemWidthDp + itemSpacingDp)

        return maxWithPlus.coerceIn(1, totalHabitsCount)
    }
}

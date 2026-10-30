package ch.nicolab.cadence.ui.widget

data class WidgetTextVisibility(
    val showLabels: Boolean,
    val showValues: Boolean,
)

object WidgetLayoutCalculator {
    fun resolve(
        availableHeightDp: Int,
        iconSizeDp: Int,
        labelsEnabled: Boolean,
        valuesEnabled: Boolean,
        labelSizeSp: Int = 11,
        valueSizeSp: Int = 11,
    ): WidgetTextVisibility {
        var remaining = availableHeightDp - iconSizeDp - 16
        val showLabels = labelsEnabled && remaining >= labelSizeSp + 4
        if (showLabels) remaining -= labelSizeSp + 4
        val showValues = valuesEnabled && remaining >= valueSizeSp + 4
        return WidgetTextVisibility(showLabels, showValues)
    }
}

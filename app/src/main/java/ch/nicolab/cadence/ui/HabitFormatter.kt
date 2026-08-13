package ch.nicolab.cadence.ui

import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.MeasurementUnit
import java.util.Locale

object HabitFormatter {

    fun formatValue(valueMinor: Long, goalType: GoalType, unit: MeasurementUnit?): String {
        return when (goalType) {
            GoalType.BINARY -> if (valueMinor > 0) "1" else "0"
            GoalType.DURATION -> formatDuration(valueMinor, unit)
            GoalType.COUNT, GoalType.QUANTITY -> formatScaledQuantity(valueMinor, unit)
        }
    }

    fun formatProgress(
        progressMinor: Long,
        targetMinor: Long,
        goalType: GoalType,
        unit: MeasurementUnit?,
    ): String {
        if (goalType == GoalType.BINARY) {
            return if (progressMinor >= targetMinor && targetMinor > 0) "Fait" else "À faire"
        }

        val formattedProgress = formatValue(progressMinor, goalType, unit)
        val formattedTarget = formatValue(targetMinor, goalType, unit)
        val symbol = unitSymbolSuffix(unit, goalType)

        return "$formattedProgress / $formattedTarget$symbol"
    }

    fun formatCompactProgress(
        progressMinor: Long,
        targetMinor: Long,
        goalType: GoalType,
        unit: MeasurementUnit?,
    ): String {
        if (goalType == GoalType.BINARY) {
            return if (progressMinor >= targetMinor) "fait" else "0/1"
        }
        val formattedProgress = formatValue(progressMinor, goalType, unit)
        val formattedTarget = formatValue(targetMinor, goalType, unit)
        return "$formattedProgress/$formattedTarget"
    }

    private fun formatDuration(seconds: Long, unit: MeasurementUnit?): String {
        if (seconds == 0L) return "0 min"

        val unitId = unit?.id
        if (unitId == "seconds") {
            return "${seconds} s"
        }

        val totalMinutes = seconds / 60
        val remainingSeconds = seconds % 60

        if (remainingSeconds > 0) {
            return "${seconds} s"
        }

        val hours = totalMinutes / 60
        val mins = totalMinutes % 60

        return when {
            hours > 0 && mins > 0 -> "$hours h $mins min"
            hours > 0 -> "$hours h"
            else -> "$mins min"
        }
    }

    private fun formatScaledQuantity(valueMinor: Long, unit: MeasurementUnit?): String {
        val scale = unit?.scaleToCanonical ?: 1L
        if (scale <= 1L) {
            return valueMinor.toString()
        }
        val valDouble = valueMinor.toDouble() / scale
        return if (valDouble % 1.0 == 0.0) {
            valDouble.toLong().toString()
        } else {
            String.format(Locale.ROOT, "%.2f", valDouble)
                .dropLastWhile { it == '0' }
                .dropLastWhile { it == '.' || it == ',' }
        }
    }

    private fun unitSymbolSuffix(unit: MeasurementUnit?, goalType: GoalType): String {
        // Une durée porte déjà son unité (`1 h 5 min`) : la répéter donnerait `1 h min`.
        if (goalType == GoalType.DURATION) return ""
        val sym = unit?.symbol?.trim()
        if (sym.isNullOrEmpty()) return ""
        return " $sym"
    }
}

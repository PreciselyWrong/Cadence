package ch.nicolab.cadence.ui

import androidx.annotation.StringRes
import ch.nicolab.cadence.R
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.ui.widget.WidgetRenderStyle
import java.time.DayOfWeek

/**
 * Traduction unique des énumérations du domaine vers l'interface.
 * Le domaine reste en anglais; rien d'anglais ne doit atteindre l'écran.
 */
object HabitLabels {

    @StringRes
    fun goalType(value: GoalType): Int = when (value) {
        GoalType.BINARY -> R.string.form_goal_type_binary
        GoalType.COUNT -> R.string.form_goal_type_count
        GoalType.QUANTITY -> R.string.form_goal_type_quantity
        GoalType.DURATION -> R.string.form_goal_type_duration
    }

    @StringRes
    fun goalTypeShort(value: GoalType): Int = when (value) {
        GoalType.BINARY -> R.string.form_goal_type_binary_short
        GoalType.COUNT -> R.string.form_goal_type_count_short
        GoalType.QUANTITY -> R.string.form_goal_type_quantity_short
        GoalType.DURATION -> R.string.form_goal_type_duration_short
    }

    @StringRes
    fun period(value: PeriodType): Int = when (value) {
        PeriodType.DAY -> R.string.form_period_day
        PeriodType.WEEK -> R.string.form_period_week
        PeriodType.MONTH -> R.string.form_period_month
    }

    @StringRes
    fun periodShort(value: PeriodType): Int = when (value) {
        PeriodType.DAY -> R.string.form_period_day_short
        PeriodType.WEEK -> R.string.form_period_week_short
        PeriodType.MONTH -> R.string.form_period_month_short
    }

    @StringRes
    fun scheduleMode(value: ScheduleMode): Int = when (value) {
        ScheduleMode.EVERY_DAY -> R.string.form_schedule_every_day
        ScheduleMode.SELECTED_DAYS -> R.string.form_schedule_selected_days
        ScheduleMode.FLEXIBLE_PERIOD -> R.string.form_schedule_flexible
        ScheduleMode.INTERVAL_DAYS -> R.string.form_schedule_interval
    }

    @StringRes
    fun day(value: DayOfWeek): Int = when (value) {
        DayOfWeek.MONDAY -> R.string.day_monday
        DayOfWeek.TUESDAY -> R.string.day_tuesday
        DayOfWeek.WEDNESDAY -> R.string.day_wednesday
        DayOfWeek.THURSDAY -> R.string.day_thursday
        DayOfWeek.FRIDAY -> R.string.day_friday
        DayOfWeek.SATURDAY -> R.string.day_saturday
        DayOfWeek.SUNDAY -> R.string.day_sunday
    }

    @StringRes
    fun dayShort(value: DayOfWeek): Int = when (value) {
        DayOfWeek.MONDAY -> R.string.day_short_monday
        DayOfWeek.TUESDAY -> R.string.day_short_tuesday
        DayOfWeek.WEDNESDAY -> R.string.day_short_wednesday
        DayOfWeek.THURSDAY -> R.string.day_short_thursday
        DayOfWeek.FRIDAY -> R.string.day_short_friday
        DayOfWeek.SATURDAY -> R.string.day_short_saturday
        DayOfWeek.SUNDAY -> R.string.day_short_sunday
    }

    /** Styles de widget persistés par clé technique, affichés en français. */
    /** Libellé de chaque style du contrat de rendu, dans l'ordre où il est proposé. */
    private val WIDGET_STYLE_LABELS: Map<String, Int> = mapOf(
        "HALO" to R.string.widget_style_halo,
        "OCEAN" to R.string.widget_style_ocean,
        "FOREST" to R.string.widget_style_forest,
        "AUBERGINE" to R.string.widget_style_aubergine,
        "CORAL" to R.string.widget_style_coral,
        "MONO" to R.string.widget_style_mono,
        "SLATE" to R.string.widget_style_slate,
        "SAND" to R.string.widget_style_sand,
        "INK" to R.string.widget_style_ink,
    )

    val WIDGET_STYLES: List<Pair<WidgetRenderStyle, Int>> = WidgetRenderStyle.all.mapNotNull { style ->
        WIDGET_STYLE_LABELS[style.id]?.let { style to it }
    }
}

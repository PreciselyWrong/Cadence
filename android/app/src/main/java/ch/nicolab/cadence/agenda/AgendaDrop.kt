package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/** Pas d'accrochage d'un dépôt sur la grille horaire. */
const val DROP_STEP_MINUTES = 15
private const val MINUTES_PER_HOUR = 60
private const val MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
private val HOUR_MINUTE_WIRE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** Tâche proposée dans le bac « À planifier » : sans échéance ([overdueDays] = 0) ou en retard. */
data class TrayItem(
    val uid: String,
    val title: String,
    val colorArgb: Int?,
    val overdueDays: Int,
    val estimateMinutes: Int? = null,
)

/**
 * Bac « À planifier » : tâches ouvertes sans échéance ou échues avant [today], les plus en retard
 * d'abord. Une tâche récurrente en est exclue : la déplacer demande un périmètre (cette occurrence,
 * les suivantes), que le simple dépôt ne peut pas porter.
 */
fun trayItems(tasks: List<TaskItem>, projectColors: Map<String, Int?>, today: LocalDate): List<TrayItem> =
    tasks.asSequence()
        .filter { !it.isClosed && !it.isRecurring }
        .mapNotNull { task ->
            val overdue = task.dueDay?.let { ChronoUnit.DAYS.between(it, today).toInt() }
            when {
                task.dueDate == null -> TrayItem(task.uid, task.name, projectColors[task.projectUid], 0, task.estimatedMinutes)
                overdue != null && overdue > 0 -> TrayItem(task.uid, task.name, projectColors[task.projectUid], overdue, task.estimatedMinutes)
                else -> null
            }
        }
        .sortedWith(compareByDescending<TrayItem> { it.overdueDays }.thenBy { it.title.lowercase() })
        .toList()

/** Minute de la journée sous [yPx] (relatif au haut de la grille), arrondie au pas et bornée au jour. */
fun dropMinute(yPx: Float, hourHeightPx: Float, step: Int = DROP_STEP_MINUTES): Int {
    val raw = yPx / hourHeightPx * MINUTES_PER_HOUR
    val snapped = (raw / step).roundToInt() * step
    return snapped.coerceIn(0, MINUTES_PER_DAY - step)
}

fun dropDateTime(day: LocalDate, yPx: Float, hourHeightPx: Float): LocalDateTime =
    day.atTime(LocalTime.of(0, 0)).plusMinutes(dropMinute(yPx, hourHeightPx).toLong())

/**
 * Instant visé par un doigt relâché en ([x], [y]) (coordonnées de l'écran). La grille occupe le
 * rectangle ([left], [top], [width], [height]) ; son contenu a défilé de [scrollPx]. Null hors de la
 * grille ou au-dessus de la gouttière des heures.
 */
fun dropTarget(
    x: Float,
    y: Float,
    left: Float,
    top: Float,
    width: Float,
    height: Float,
    scrollPx: Float,
    hourHeightPx: Float,
    gutterPx: Float,
    days: List<LocalDate>,
): LocalDateTime? {
    if (days.isEmpty()) return null
    if (x < left + gutterPx || x >= left + width || y < top || y >= top + height) return null
    val columnWidth = (width - gutterPx) / days.size
    val column = ((x - left - gutterPx) / columnWidth).toInt().coerceIn(0, days.lastIndex)
    return dropDateTime(days[column], y - top + scrollPx, hourHeightPx)
}

/** Modification envoyée au dépôt de tâches : la voie normale de mise à jour, donc synchronisée. */
fun dropChange(at: LocalDateTime): TaskChange =
    TaskChange(dueDate = at.toLocalDate(), dueTime = at.toLocalTime().format(HOUR_MINUTE_WIRE))

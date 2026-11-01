package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/** Pas d'accrochage d'un dépôt sur la grille horaire. */
const val DROP_STEP_MINUTES = 15
private const val MINUTES_PER_HOUR = 60
private const val MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
private val HOUR_MINUTE_WIRE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Tâche proposée dans le bac « À planifier » : sans échéance ([pastDue] null) ou en retard, [pastDue]
 * étant alors son échéance. On affiche cette date, jamais un nombre de jours de retard.
 */
data class TrayItem(
    val uid: String,
    val title: String,
    val colorArgb: Int?,
    val pastDue: LocalDate?,
    val estimateMinutes: Int? = null,
    /** Tâche récurrente : l'enregistrement demande la portée (« cette tâche ou la série ? »). */
    val recurring: Boolean = false,
    /** Jour d'une occurrence à venir d'une série ; null pour la tâche enregistrée. */
    val occurrence: LocalDate? = null,
)

/**
 * Bac « À planifier » : tâches ouvertes sans échéance ou échues avant [today], les plus anciennes
 * échéances d'abord. Une tâche récurrente en est exclue : la déplacer demande un périmètre (cette
 * occurrence, les suivantes), que le simple dépôt ne peut pas porter. Une tâche mise de côté
 * (« Plus tard ») n'est jamais en retard ([TaskViews.isOverdue]) : datée, elle n'y figure pas.
 */
fun trayItems(tasks: List<TaskItem>, projectColors: Map<String, Int?>, today: LocalDate): List<TrayItem> =
    tasks.asSequence()
        .filter { !it.isClosed && !it.isRecurring }
        .mapNotNull { task ->
            when {
                task.dueDate == null -> TrayItem(task.uid, task.name, projectColors[task.projectUid], null, task.estimatedMinutes)
                TaskViews.isOverdue(task, today) -> TrayItem(task.uid, task.name, projectColors[task.projectUid], task.dueDay, task.estimatedMinutes)
                else -> null
            }
        }
        .sortedWith(compareBy<TrayItem, LocalDate?>(nullsLast()) { it.pastDue }.thenBy { it.title.lowercase() })
        .toList()

/** Minute de la journée sous [yPx] (relatif au haut de la grille), arrondie au pas et bornée au jour. */
fun dropMinute(yPx: Float, hourHeightPx: Float, step: Int = DROP_STEP_MINUTES): Int {
    val raw = yPx / hourHeightPx * MINUTES_PER_HOUR
    val snapped = (raw / step).roundToInt() * step
    return snapped.coerceIn(0, MINUTES_PER_DAY - step)
}

fun dropDateTime(day: LocalDate, yPx: Float, hourHeightPx: Float): LocalDateTime =
    day.atTime(LocalTime.of(0, 0)).plusMinutes(dropMinute(yPx, hourHeightPx).toLong())

/** Pas des créneaux vides : une case de la grille correspond à une demi-heure. */
const val SLOT_STEP_MINUTES = 30

/** Début du créneau de [day] touché à [yPx] : l'heure de la demi-heure en cours, jamais la suivante. */
fun slotDateTime(day: LocalDate, yPx: Float, hourHeightPx: Float): LocalDateTime {
    val minutes = (yPx / hourHeightPx * MINUTES_PER_HOUR / SLOT_STEP_MINUTES).toInt() * SLOT_STEP_MINUTES
    return day.atTime(LocalTime.of(0, 0)).plusMinutes(minutes.coerceIn(0, MINUTES_PER_DAY - SLOT_STEP_MINUTES).toLong())
}

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

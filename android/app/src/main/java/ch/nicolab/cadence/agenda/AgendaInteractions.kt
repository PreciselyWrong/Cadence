package ch.nicolab.cadence.agenda

import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

/** Au-delà de deux puces, la rangée des journées entières mange la grille : le reste passe derrière « +N ». */
const val ALL_DAY_MAX_ROWS = 2

/** Part de l'écran que la grille du mois ne dépasse pas : la liste du jour garde le reste. */
const val MONTH_GRID_SCREEN_FRACTION = 0.4f
private const val MONTH_CELL_MIN_DP = 36f
private const val MONTH_CELL_MAX_DP = 44f
private const val MINUTES_PER_HOUR = 60
private const val MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
private val WIRE_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** Puces visibles d'une colonne de journées entières, [hidden] éléments repliés derrière « +N ». */
data class AllDayCap(val visible: List<AgendaEntry>, val hidden: Int, val overflowing: Boolean)

fun capAllDay(entries: List<AgendaEntry>, expanded: Boolean, maxRows: Int = ALL_DAY_MAX_ROWS): AllDayCap {
    val overflowing = entries.size > maxRows
    return if (expanded || !overflowing) {
        AllDayCap(entries, hidden = 0, overflowing = overflowing)
    } else {
        AllDayCap(entries.take(maxRows), hidden = entries.size - maxRows, overflowing = true)
    }
}

/** Durée du bloc déposé : l'estimation de la tâche si elle existe, sinon le bloc minimal. */
fun dropBlockMinutes(estimateMinutes: Int?): Int = estimateMinutes?.takeIf { it > 0 } ?: MIN_BLOCK_MINUTES

/** Tâche d'une rangée de journée qu'on peut glisser sur la grille ; null pour une tâche faite, récurrente ou un autre élément. */
fun draggableTaskItem(entry: AgendaEntry): TrayItem? {
    if (entry !is AgendaEntry.Task || entry.done || entry.recurring) return null
    return TrayItem(
        uid = entry.uid,
        title = entry.title,
        colorArgb = entry.colorArgb,
        overdueDays = 0,
        estimateMinutes = entry.estimateMinutes,
    )
}

/** Modification qui ramène la tâche à sa date et son heure d'avant une planification (pour « Annuler »). */
fun restoreSchedule(task: TaskItem, zone: ZoneId): TaskChange {
    val due = task.dueDate ?: return TaskChange(clearDue = true)
    if (task.dueHasTime) {
        val at = LocalDateTime.ofInstant(due, zone)
        return TaskChange(dueDate = at.toLocalDate(), dueTime = at.toLocalTime().format(WIRE_TIME))
    }
    return TaskChange(dueDate = task.dueDay ?: due.atZone(zone).toLocalDate())
}

/**
 * Durée d'un bloc après avoir tiré son bord bas de [deltaPx] : arrondie au pas, jamais sous le bloc
 * minimal ni au-delà de minuit.
 */
fun resizedMinutes(
    startMinute: Int,
    baseMinutes: Int,
    deltaPx: Float,
    hourHeightPx: Float,
    step: Int = DROP_STEP_MINUTES,
    min: Int = MIN_BLOCK_MINUTES,
): Int {
    val raw = baseMinutes + deltaPx / hourHeightPx * MINUTES_PER_HOUR
    val snapped = (raw / step).roundToInt() * step
    return snapped.coerceIn(min, (MINUTES_PER_DAY - startMinute).coerceAtLeast(min))
}

/**
 * Repli du bandeau des jours pendant le défilement de la grille. [travel] cumule les glissements du
 * doigt dans le même sens (négatif = la grille avance) ; il repart de zéro quand le sens change.
 */
data class ScrollCollapse(val collapsed: Boolean = false, val travel: Float = 0f) {
    fun after(deltaY: Float, thresholdPx: Float): ScrollCollapse {
        if (deltaY == 0f) return this
        val sameDirection = travel == 0f || (travel < 0f) == (deltaY < 0f)
        val total = if (sameDirection) travel + deltaY else deltaY
        return when {
            !collapsed && total <= -thresholdPx -> ScrollCollapse(collapsed = true)
            collapsed && total >= thresholdPx -> ScrollCollapse(collapsed = false)
            else -> copy(travel = total)
        }
    }
}

/** Hauteur d'une case du mois : la grille ([rows] lignes plus l'en-tête) tient dans sa part de l'écran, sans devenir minuscule. */
fun monthCellDp(rows: Int, screenDp: Float, headerDp: Float): Float =
    ((screenDp * MONTH_GRID_SCREEN_FRACTION - headerDp) / rows).coerceIn(MONTH_CELL_MIN_DP, MONTH_CELL_MAX_DP)

package ch.nicolab.cadence.tasks.planning

import java.time.LocalDate

/**
 * Glisser une tâche dans Aujourd'hui : là où elle est lâchée décide de sa place. Entre deux lignes d'« À caser », elle
 * se range sans heure (même règle que [TodayReorder]) ; dans « Ma journée », elle prend un créneau du plan qui commence
 * à la fin de ce qui la précède, au quart d'heure, jamais avant maintenant. L'échéance ne bouge pas.
 */
internal object TodayDrop {
    /** Une ligne d'Aujourd'hui, réduite à ce qui compte pour le dépôt ; minutes du jour. */
    sealed interface Row {
        data object Late : Row
        data object ToPlaceTitle : Row
        data class ToPlace(val uid: String) : Row
        data object ToPlaceMore : Row
        data object DayTitle : Row
        data object PastFold : Row
        /** Tâche ou événement de la journée ; sans heure pour une journée entière. */
        data class DayItem(val start: Int?, val end: Int?) : Row
        data class Now(val minute: Int) : Row
        data class Free(val start: Int, val end: Int) : Row
    }

    sealed interface Target {
        /** Dans « À caser », devant [beforeUid] dans le plan du jour (en dernier sans lui). */
        data class Untimed(val beforeUid: String?) : Target

        /** Un créneau qui commence à [minute]. */
        data class At(val minute: Int) : Target
    }

    private const val QUARTER = 15
    private const val DAY_END = 24 * 60
    private const val DEFAULT_MINUTES = 30

    /**
     * Où tombe [dragged], lâchée entre [above] et [below] (null : bord de la liste). [toPlace] : les tâches d'« À caser »
     * dans l'ordre affiché, repliées comprises ; [planned] : celles que le plan du jour tient ; [duration] : sa durée.
     * Null : nulle part (parmi les échues).
     */
    fun target(
        above: Row?,
        below: Row?,
        dragged: String,
        toPlace: List<String>,
        planned: Set<String>,
        now: Int,
        duration: Int,
    ): Target? {
        val untimedFrom = when {
            below is Row.ToPlace -> toPlace.indexOf(below.uid)
            above is Row.ToPlace -> toPlace.indexOf(above.uid) + 1
            above == Row.ToPlaceTitle || below == Row.ToPlaceTitle -> 0
            above == Row.ToPlaceMore -> toPlace.size
            below == Row.DayTitle && !above.isDay() -> toPlace.size
            else -> null
        }
        if (untimedFrom != null) {
            val before = toPlace.drop(untimedFrom.coerceAtLeast(0)).firstOrNull { it != dragged && it in planned }
            return Target.Untimed(before)
        }
        if (!above.isDay() && !below.isDay()) return null
        val nextStart = (below as? Row.DayItem)?.start
        val after = when (above) {
            // Lâchée entre deux éléments qui se chevauchent : elle reste entre eux, au plus tard quand le suivant commence.
            is Row.DayItem -> above.end?.let(::ceilQuarter)?.let { end ->
                if (nextStart != null && above.start != null && end > nextStart) {
                    maxOf(ceilQuarter(above.start), floorQuarter(nextStart - duration))
                } else {
                    end
                }
            }
            is Row.Now -> ceilQuarter(above.minute)
            is Row.Free -> ceilQuarter(above.start)
            else -> null
        }
        val start = after ?: nextStart?.let { floorQuarter(it - duration) } ?: ceilQuarter(now)
        return Target.At(start.coerceAtLeast(ceilQuarter(now)).coerceAtMost(DAY_END - duration).coerceAtLeast(0))
    }

    /**
     * Les écritures du plan de [day] pour [uid] posée sur [target]. [line] : sa ligne du plan, s'il la tient ;
     * [dueHasTime] : son heure vient de l'échéance, que le plan ne retire pas. Rien si elle ne bouge pas.
     */
    fun writes(
        uid: String,
        target: Target,
        day: LocalDate,
        line: PlanEntry?,
        dueHasTime: Boolean,
        estimate: Int? = null,
    ): List<PlanEdit> = when (target) {
        is Target.Untimed -> when {
            line?.startMinute != null -> listOf(UnslotTask(day, uid), ReorderTask(day, uid, target.beforeUid))
            line != null -> listOf(ReorderTask(day, uid, target.beforeUid))
            dueHasTime -> emptyList()
            else -> listOf(AddTask(day, uid, target.beforeUid))
        }
        is Target.At -> if (line?.startMinute == target.minute) {
            emptyList()
        } else {
            val duration = line?.durationMinutes ?: estimate?.takeIf { it > 0 } ?: DEFAULT_MINUTES
            listOf(SlotTask(day, uid, target.minute, duration))
        }
    }

    private fun Row?.isDay(): Boolean =
        this == Row.DayTitle || this == Row.PastFold || this is Row.DayItem || this is Row.Now || this is Row.Free

    private fun ceilQuarter(minute: Int): Int = (minute + QUARTER - 1) / QUARTER * QUARTER

    private fun floorQuarter(minute: Int): Int = Math.floorDiv(minute, QUARTER) * QUARTER
}

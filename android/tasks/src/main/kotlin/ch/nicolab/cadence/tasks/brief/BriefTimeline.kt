package ch.nicolab.cadence.tasks.brief

/**
 * Géométrie de la frise du brief, sans Android : minutes après minuit -> fraction de la largeur sur l'axe 8 h - 22 h.
 * Une bande n'a pas de texte à l'intérieur : sa position suffit, le libellé vit sous la frise.
 */
internal object BriefTimeline {
    const val FIRST_MINUTE = 8 * 60
    const val LAST_MINUTE = 22 * 60

    /** Position d'une minute sur l'axe, bornée à [0, 1]. */
    fun fraction(minute: Int): Float = ((minute - FIRST_MINUTE).toFloat() / (LAST_MINUTE - FIRST_MINUTE)).coerceIn(0f, 1f)

    /** Gauche et largeur, en fractions, d'un intervalle [start, end] ; largeur nulle si l'intervalle est vide. */
    fun span(start: Int, end: Int): Pair<Float, Float> {
        val left = fraction(start)
        return left to (fraction(end) - left).coerceAtLeast(0f)
    }

    /** Vrai si l'événement à heure fixe chevauche une plage de travail : il tombe dans les heures protégées. */
    fun overlapsWork(event: EventDto, work: List<WorkDto>): Boolean {
        val start = event.startMinute ?: return false
        val end = event.endMinute ?: return false
        return work.any { block -> start < block.end && block.start < end }
    }

    /** Un événement est en conflit s'il est marqué comme tel par le moteur, ou s'il tombe dans les heures de travail. */
    fun isConflict(event: EventDto, work: List<WorkDto>): Boolean = event.conflict || overlapsWork(event, work)

    /** Part du créneau du soir occupée par le planifié, bornée à [0, 1] ; 0 sans capacité connue. */
    fun fill(planned: Int, capacity: Int?): Float {
        if (capacity == null || capacity <= 0) return 0f
        return (planned.toFloat() / capacity).coerceIn(0f, 1f)
    }

    /** Libellé de charge d'un jour : « 40 / 90 min », « 15 min de trop » quand le planifié dépasse la capacité. */
    fun load(planned: Int, capacity: Int?): LoadLabel = when {
        capacity == null -> LoadLabel.Plain(planned)
        planned > capacity -> LoadLabel.Over(planned - capacity)
        else -> LoadLabel.Ratio(planned, capacity)
    }
}

internal sealed interface LoadLabel {
    data class Plain(val minutes: Int) : LoadLabel
    data class Ratio(val planned: Int, val capacity: Int) : LoadLabel
    data class Over(val excess: Int) : LoadLabel
}

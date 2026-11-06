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

    /**
     * Charge d'un jour : les tâches seules face au temps libre, car les événements en sont déjà retirés. Un résumé plus
     * ancien n'a pas [LoadDto.taskMinutes] et retombe sur le planifié.
     */
    fun load(load: LoadDto): LoadLabel {
        val tasks = load.taskMinutes ?: load.plannedMinutes
        val capacity = load.capacityMinutes
        return when {
            capacity == null -> LoadLabel.Plain(load.plannedMinutes)
            tasks > capacity -> LoadLabel.Over(tasks, capacity)
            else -> LoadLabel.Ratio(tasks, capacity)
        }
    }
}

internal sealed interface LoadLabel {
    data class Plain(val minutes: Int) : LoadLabel
    data class Ratio(val planned: Int, val capacity: Int) : LoadLabel
    data class Over(val planned: Int, val capacity: Int) : LoadLabel
}

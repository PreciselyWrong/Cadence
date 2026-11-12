package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.PlanEntry

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

    /** Pas d'un glisser sur la frise : un quart d'heure, comme le calendrier du web. */
    const val STEP_MINUTES = 15

    /** Minutes que représente un déplacement de [fraction] de la largeur. */
    fun minutes(fraction: Float): Float = fraction * (LAST_MINUTE - FIRST_MINUTE)

    /** Début d'un bloc déplacé de [delta] minutes : au quart d'heure, le bloc entier reste sur l'axe. */
    fun moved(start: Int, duration: Int, delta: Float): Int =
        snap(start + delta).coerceIn(FIRST_MINUTE, (LAST_MINUTE - duration).coerceAtLeast(FIRST_MINUTE))

    /** Durée d'un bloc étiré de [delta] minutes par son bord droit : au quart d'heure, au moins un pas, fin sur l'axe. */
    fun resized(start: Int, duration: Int, delta: Float): Int =
        (snap(start + duration + delta) - start).coerceIn(STEP_MINUTES, (LAST_MINUTE - start).coerceAtLeast(STEP_MINUTES))

    private fun snap(minute: Float): Int = (Math.round(minute / STEP_MINUTES) * STEP_MINUTES)

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

/** Créneau d'une tâche sur la frise d'aujourd'hui (ligne du plan du jour) : se déplace et s'étire au doigt. */
internal data class TimelineSlot(val uid: String, val title: String, val start: Int, val duration: Int)

internal object BriefSlots {
    private const val DEFAULT_MINUTES = 30

    /** Créneaux de la frise : les lignes à heure du plan [plan] dont la tâche est connue, durée de la ligne sinon estimation. */
    fun of(plan: List<PlanEntry>, tasks: List<TaskItem>): List<TimelineSlot> {
        val byUid = tasks.associateBy { it.uid }
        return plan.mapNotNull { line ->
            val start = line.startMinute ?: return@mapNotNull null
            val task = byUid[line.uid] ?: return@mapNotNull null
            TimelineSlot(line.uid, task.name, start, line.durationMinutes ?: task.estimatedMinutes ?: DEFAULT_MINUTES)
        }
    }
}

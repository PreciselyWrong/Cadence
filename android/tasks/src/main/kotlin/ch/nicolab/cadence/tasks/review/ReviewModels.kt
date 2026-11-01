package ch.nicolab.cadence.tasks.review

import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.formatMinutes
import java.time.Instant
import java.time.LocalDate

/**
 * Étapes de la revue, dans l'ordre du web (`ReviewPage.tsx`) : ce qui est arrivé, ce qui glisse, ce qui
 * stagne, les idées dont la date est venue, les anciennes, puis la semaine. Chacune s'ouvre seule.
 */
enum class ReviewStep(val wire: String) {
    UNDECIDED("undecided"),
    PUSHED("pushed"),
    PROJECTS("projects"),
    LATER("later"),
    STALE("stale"),
    WEEK("week");

    val next: ReviewStep? get() = entries.getOrNull(ordinal + 1)

    companion object {
        /** Étape gardée entre deux sessions ; une valeur inconnue repart de la première. */
        fun restore(saved: String?): ReviewStep = entries.firstOrNull { it.wire == saved } ?: UNDECIDED
    }
}

data class ReviewCounts(
    val pushed: Int = 0,
    val undecided: Int = 0,
    val later: Int = 0,
    val reviewDue: Int = 0,
    val projects: Int = 0,
    val stale: Int = 0,
) {
    /** Compteur d'un onglet ; la semaine n'en a pas, « Plus tard » ne compte que les revues arrivées (un stock, pas une dette). */
    fun of(step: ReviewStep): Int? = when (step) {
        ReviewStep.UNDECIDED -> undecided
        ReviewStep.PUSHED -> pushed
        ReviewStep.PROJECTS -> projects
        ReviewStep.LATER -> reviewDue
        ReviewStep.STALE -> stale
        ReviewStep.WEEK -> null
    }
}

/** `GET /api/review` : [attentionTotal] compte une fois ce qui figure dans deux listes. */
data class ReviewSummary(
    val counts: ReviewCounts,
    val attentionTotal: Int,
    val decidedThisWeek: Int,
    val weekStart: LocalDate?,
)

/** Résumé des déplacements calculé par le serveur (`postponements.js`), jamais recalculé ici. */
data class PushSummary(
    val recentCount: Int,
    val totalCount: Int,
    val lastPostponedOn: LocalDate?,
    val lastPlannedFor: LocalDate?,
)

/** Tâche servie par une liste de revue : de quoi l'afficher même si l'appareil ne l'a pas encore reçue. */
data class ReviewTask(
    val uid: String,
    val name: String,
    val projectName: String? = null,
    val estimatedMinutes: Int? = null,
    val reviewOn: LocalDate? = null,
    val reviewedAt: Instant? = null,
    val reviewDue: Boolean = false,
    val push: PushSummary? = null,
    val lastActivityAt: Instant? = null,
)

data class ReviewInboxItem(val uid: String, val text: String, val createdAt: Instant?)

enum class ProjectReason(val wire: String) {
    NO_NEXT_ACTION("no_next_action"),
    QUIET("quiet"),
    PUSHED_TASKS("pushed_tasks"),
}

data class ReviewProject(
    val uid: String,
    val name: String,
    val reasons: List<ProjectReason>,
    val openTasks: Int,
    val lastActivityAt: Instant?,
)

data class ReviewPage<T>(val total: Int, val items: List<T>)

/** `GET /api/review/week` : tâches décidées pour la semaine, tâches en vue, temps prévu et disponible. */
data class ReviewWeek(
    val weekStart: LocalDate?,
    val committed: List<ReviewTask>,
    val inView: List<ReviewTask>,
    val plannedMinutes: Int,
    val unestimated: Int,
    val capacityMinutes: Int?,
)

enum class PostponementKind { POSTPONED, RESCHEDULED, UNSCHEDULED, ADVANCED, MISSED }

data class ScheduleChange(val kind: String, val from: LocalDate?, val to: LocalDate?, val at: LocalDate?)

/** `GET /api/task/:uid/postponements`, pour l'utilisateur seul. */
data class Postponements(
    val recentCount: Int,
    val totalCount: Int,
    val lastPostponedOn: LocalDate?,
    val changes: List<ScheduleChange>,
    val missedDays: List<LocalDate>,
) {
    /** La ligne grise n'apparaît qu'une fois la tâche déplacée au moins une fois. */
    val shown: Boolean get() = totalCount > 0
}

data class PostponementEntry(val kind: PostponementKind, val at: LocalDate, val from: LocalDate? = null, val to: LocalDate? = null)

/** Historique listé au toucher : ce que l'utilisateur a déplacé, du plus récent au plus ancien. */
object PostponementEntries {
    private val listed = mapOf(
        "postponed" to PostponementKind.POSTPONED,
        "rescheduled" to PostponementKind.RESCHEDULED,
        "unscheduled" to PostponementKind.UNSCHEDULED,
        "advanced" to PostponementKind.ADVANCED,
    )

    fun of(history: Postponements): List<PostponementEntry> {
        val changes = history.changes.mapNotNull { change ->
            val kind = listed[change.kind] ?: return@mapNotNull null
            change.at?.let { PostponementEntry(kind, it, change.from, change.to) }
        }
        val missed = history.missedDays.map { PostponementEntry(PostponementKind.MISSED, it) }
        return (changes + missed).sortedByDescending { it.at }
    }
}

object ReviewLists {
    /**
     * Retire d'une liste servie ce que le téléphone a déjà décidé ou fermé depuis : une décision locale
     * horodate `reviewed_at` plus tard que la valeur servie. La liste reste celle du serveur sinon.
     */
    fun pending(items: List<ReviewTask>, local: Map<String, TaskItem>): List<ReviewTask> = items.filter { item ->
        val task = local[item.uid] ?: return@filter true
        if (task.isClosed) return@filter false
        val decided = task.reviewedAt ?: return@filter true
        item.reviewedAt != null && !decided.isAfter(item.reviewedAt)
    }
}

object WeekCapacity {
    /** « 4 h 30 prévues / 6 h disponibles », ou le temps prévu seul sans capacité réglée. */
    fun line(plannedMinutes: Int, capacityMinutes: Int?): String {
        val planned = "${formatMinutes(plannedMinutes)} prévues"
        return if (capacityMinutes == null) planned else "$planned / ${formatMinutes(capacityMinutes)} disponibles"
    }

    fun over(plannedMinutes: Int, capacityMinutes: Int?): Boolean = capacityMinutes != null && plannedMinutes > capacityMinutes

    /** Choix proposés pour le temps disponible de la semaine, en minutes. */
    val presets: List<Int> = listOf(4, 6, 8, 10, 15, 20).map { it * 60 }
}

/**
 * « Aide-moi à choisir » : deux tâches face à face, le choix reste et rencontre la suivante ; « Aucune »
 * écarte les deux. Rien n'est écrit sur les tâches, il n'y a pas de score.
 */
data class ThisOrThat(val kept: String?, val queue: List<String>) {
    val pair: Pair<String, String>? get() = if (kept != null && queue.isNotEmpty()) kept to queue.first() else null

    /** Le dernier restant, une fois le duel terminé. */
    val winner: String? get() = if (queue.isEmpty()) kept else null

    fun pick(uid: String): ThisOrThat = ThisOrThat(uid, queue.drop(1))

    fun neither(): ThisOrThat = ThisOrThat(queue.getOrNull(1), queue.drop(2))

    companion object {
        fun start(uids: List<String>): ThisOrThat = ThisOrThat(uids.firstOrNull(), uids.drop(1))
    }
}

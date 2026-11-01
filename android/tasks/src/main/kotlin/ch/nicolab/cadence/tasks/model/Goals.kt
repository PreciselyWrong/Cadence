package ch.nicolab.cadence.tasks.model

import java.time.LocalDate

/** Horizon d'un objectif (`goals.horizon`) ; une valeur inconnue compte comme « saison », la valeur par défaut du serveur. */
enum class GoalHorizon(val wire: String) {
    MONTH("month"), QUARTER("quarter"), SEASON("season"), YEAR("year");

    companion object {
        fun fromWire(value: String?): GoalHorizon = entries.firstOrNull { it.wire == value } ?: SEASON
    }
}

/** Groupe de la liste d'envies : Avoir, Être, Faire. */
enum class GoalBucket(val wire: String) {
    HAVE("have"), BE("be"), DO("do");

    companion object {
        fun fromWire(value: String?): GoalBucket? = entries.firstOrNull { it.wire == value }
    }
}

/** État d'un objectif (`goals.status`) ; une valeur inconnue ou absente compte comme actif, comme sur le serveur. */
enum class GoalStatus(val wire: String) {
    ACTIVE("active"), ACHIEVED("achieved"), PAUSED("paused"), DROPPED("dropped");

    companion object {
        fun fromWire(value: String?): GoalStatus = entries.firstOrNull { it.wire == value } ?: ACTIVE
    }
}

/** Modification d'un objectif ou d'une envie : seuls les champs non null changent ; un pourquoi vide l'efface. */
data class GoalChange(
    val title: String? = null,
    val why: String? = null,
    val bucket: GoalBucket? = null,
    val status: GoalStatus? = null,
)

data class GoalItem(
    val uid: String,
    val title: String,
    val why: String? = null,
    val horizon: GoalHorizon = GoalHorizon.SEASON,
    val targetDate: LocalDate? = null,
    /** `active`, `achieved`, `paused` ou `dropped`. */
    val status: String? = null,
    val color: String? = null,
    val bucket: GoalBucket? = null,
    val areaUid: String? = null,
    /** Renseigné : ce but est un résultat clé de cet objectif (un seul niveau). */
    val parentGoalUid: String? = null,
) {
    val isKeyResult: Boolean get() = parentGoalUid != null
    val isWish: Boolean get() = bucket != null
    val isActive: Boolean get() = status == null || status == STATUS_ACTIVE
}

private const val STATUS_ACTIVE = "active"

/** Éléments terminés sur éléments comptés ; null de pourcentage tant que rien n'est lié. */
data class GoalProgress(val done: Int, val total: Int) {
    val fraction: Float get() = if (total == 0) 0f else done.toFloat() / total
    val percent: Int? get() = if (total == 0) null else Math.round(fraction * PERCENT)
}

private const val PERCENT = 100

data class KeyResultCard(val goal: GoalItem, val progress: GoalProgress)

/** Un objectif avec ses résultats clés ; sa progression compte ses éléments et ceux de ses résultats clés. */
data class ObjectiveCard(val goal: GoalItem, val progress: GoalProgress, val keyResults: List<KeyResultCard>)

data class GoalOverview(
    val objectives: List<ObjectiveCard>,
    /** Envies par groupe, dans l'ordre Avoir, Être, Faire ; un groupe vide est présent avec une liste vide. */
    val wishes: Map<GoalBucket, List<GoalItem>>,
    /** Tâches liées à chaque envie (hors abandonnées et sous-tâches) : les prochains pas vers elle. */
    val linkedTasks: Map<String, Int> = emptyMap(),
) {
    val isEmpty: Boolean get() = objectives.isEmpty() && wishes.values.all { it.isEmpty() }
}

/** Progression et regroupement des objectifs, calculés sur les tâches et projets déjà synchronisés. */
object Goals {
    /**
     * Part terminée des projets (terminés) et tâches (terminées ou archivées, hors sous-tâches) liés aux
     * [goalUids] ; les éléments abandonnés ne sont pas comptés, comme sur le serveur.
     */
    fun progress(goalUids: Set<String>, tasks: List<TaskItem>, projects: List<ProjectItem>): GoalProgress {
        var done = 0
        var total = 0
        for (project in projects) {
            if (project.goalUid !in goalUids) continue
            when (project.projectStatus) {
                ProjectStatus.CANCELLED -> Unit
                ProjectStatus.DONE -> { done++; total++ }
                else -> total++
            }
        }
        for (task in tasks) {
            if (task.goalUid !in goalUids || task.parentTaskUid != null) continue
            when (task.status) {
                TaskStatus.CANCELLED -> Unit
                TaskStatus.DONE, TaskStatus.ARCHIVED -> { done++; total++ }
                else -> total++
            }
        }
        return GoalProgress(done, total)
    }

    fun overview(goals: List<GoalItem>, tasks: List<TaskItem>, projects: List<ProjectItem>): GoalOverview {
        val byParent = goals.filter { it.isKeyResult && !it.isWish }.groupBy { it.parentGoalUid }
        val objectives = goals
            .filter { !it.isKeyResult && !it.isWish }
            .sortedWith(compareByDescending<GoalItem> { it.isActive }.thenBy { it.targetDate == null }.thenBy { it.targetDate }.thenBy { it.title.lowercase() })
            .map { objective ->
                val results = byParent[objective.uid].orEmpty().sortedBy { it.title.lowercase() }
                ObjectiveCard(
                    goal = objective,
                    progress = progress(setOf(objective.uid) + results.map { it.uid }, tasks, projects),
                    keyResults = results.map { KeyResultCard(it, progress(setOf(it.uid), tasks, projects)) },
                )
            }
        val wishes = GoalBucket.entries.associateWith { bucket ->
            goals.filter { it.bucket == bucket }.sortedBy { it.title.lowercase() }
        }
        val wishUids = goals.filter { it.isWish }.mapTo(HashSet()) { it.uid }
        val linkedTasks = tasks
            .filter { it.goalUid in wishUids && it.parentTaskUid == null && it.status != TaskStatus.CANCELLED }
            .groupingBy { it.goalUid!! }
            .eachCount()
        return GoalOverview(objectives, wishes, linkedTasks)
    }
}

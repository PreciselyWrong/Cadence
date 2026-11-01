package ch.nicolab.cadence.tasks.model

import java.text.Collator
import java.text.Normalizer
import java.time.LocalDate
import java.util.Locale

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

    /** Envie encore à vivre : active ou en pause ; réalisée ou abandonnée, elle quitte les groupes. */
    val isOpenWish: Boolean get() = isWish && (isActive || status == STATUS_PAUSED)
}

private const val STATUS_PAUSED = "paused"

private const val STATUS_ACTIVE = "active"

/** Éléments terminés sur éléments comptés ; null de pourcentage tant que rien n'est lié. */
data class GoalProgress(val done: Int, val total: Int) {
    val fraction: Float get() = if (total == 0) 0f else done.toFloat() / total
    val percent: Int? get() = if (total == 0) null else Math.round(fraction * PERCENT)
}

private const val PERCENT = 100

data class KeyResultCard(val goal: GoalItem, val progress: GoalProgress)

/**
 * Un objectif avec ses résultats clés ; sa progression compte ses éléments et ceux de ses résultats clés.
 * [nextStep] : la tâche ouverte à faire ensuite pour lui ou l'un de ses résultats clés ([Goals.nextStep]).
 */
data class ObjectiveCard(
    val goal: GoalItem,
    val progress: GoalProgress,
    val keyResults: List<KeyResultCard>,
    val nextStep: TaskItem? = null,
)

data class GoalOverview(
    /** Objectifs actifs, échéance la plus proche d'abord. */
    val objectives: List<ObjectiveCard>,
    /** Envies ouvertes (actives ou en pause) par groupe, dans l'ordre Avoir, Être, Faire ; un groupe vide est présent. */
    val wishes: Map<GoalBucket, List<GoalItem>>,
    /** Tâches liées à chaque envie (hors abandonnées et sous-tâches) : les prochains pas vers elle. */
    val linkedTasks: Map<String, Int> = emptyMap(),
    /** Objectifs en pause, atteints ou abandonnés : repliés en bas, jamais mêlés aux actifs. */
    val otherObjectives: List<ObjectiveCard> = emptyList(),
    /** Envies réalisées ou abandonnées, hors des groupes ouverts. */
    val doneWishes: List<GoalItem> = emptyList(),
    /** Prochain pas de chaque envie qui en a un. */
    val wishSteps: Map<String, TaskItem> = emptyMap(),
) {
    val isEmpty: Boolean
        get() = objectives.isEmpty() && otherObjectives.isEmpty() && doneWishes.isEmpty() && wishes.values.all { it.isEmpty() }

    val openWishCount: Int get() = wishes.values.sumOf { it.size }
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

    /**
     * Prochain pas vers les buts [goalUids] : parmi leurs tâches ouvertes de premier niveau, la plus proche échéance,
     * puis la plus ancienne (`created_at` ; une tâche pas encore renvoyée par le serveur est la plus récente), puis
     * l'ordre alphabétique. Même règle que le serveur (`next_task` de `GET /api/goals`).
     */
    fun nextStep(goalUids: Set<String>, tasks: List<TaskItem>): TaskItem? = tasks
        .filter { it.goalUid in goalUids && it.parentTaskUid == null && !TaskStatus.isClosed(it.status) }
        .minWithOrNull(
            compareBy<TaskItem> { it.dueDay == null }
                .thenBy { it.dueDay }
                .thenBy(nullsLast()) { it.extras["created_at"]?.let(::parseCreated) }
                .thenBy(byName) { it.name },
        )

    private fun parseCreated(raw: String): java.time.Instant? = runCatching { java.time.Instant.parse(raw) }.getOrNull()

    fun overview(goals: List<GoalItem>, tasks: List<TaskItem>, projects: List<ProjectItem>): GoalOverview {
        val byParent = goals.filter { it.isKeyResult && !it.isWish }.groupBy { it.parentGoalUid }
        val cards = goals
            .filter { !it.isKeyResult && !it.isWish }
            .sortedWith(compareBy<GoalItem> { it.targetDate == null }.thenBy { it.targetDate }.thenBy(byName) { it.title })
            .map { objective ->
                val results = byParent[objective.uid].orEmpty().sortedWith(compareBy(byName) { it.title })
                val uids = setOf(objective.uid) + results.map { it.uid }
                ObjectiveCard(
                    goal = objective,
                    progress = progress(uids, tasks, projects),
                    keyResults = results.map { KeyResultCard(it, progress(setOf(it.uid), tasks, projects)) },
                    nextStep = nextStep(uids, tasks),
                )
            }
        val (active, other) = cards.partition { it.goal.isActive }
        val allWishes = goals.filter { it.isWish }.sortedWith(compareBy(byName) { it.title })
        val (open, done) = allWishes.partition { it.isOpenWish }
        val wishes = GoalBucket.entries.associateWith { bucket -> open.filter { it.bucket == bucket } }
        val wishUids = allWishes.mapTo(HashSet()) { it.uid }
        val linkedTasks = tasks
            .filter { it.goalUid in wishUids && it.parentTaskUid == null && it.status != TaskStatus.CANCELLED }
            .groupingBy { it.goalUid!! }
            .eachCount()
        val wishSteps = open.mapNotNull { wish -> nextStep(setOf(wish.uid), tasks)?.let { wish.uid to it } }.toMap()
        return GoalOverview(active, wishes, linkedTasks, other, done, wishSteps)
    }

    /**
     * Ce qui correspond à [query] (titre ou note, sans tenir compte de la casse ni des accents). Un objectif reste
     * s'il correspond lui-même (avec tous ses résultats clés) ou si l'un de ses résultats clés correspond (seuls
     * ceux-là restent). Une requête vide rend l'aperçu tel quel.
     */
    fun filter(overview: GoalOverview, query: String): GoalOverview {
        val needle = fold(query.trim())
        if (needle.isEmpty()) return overview
        fun GoalItem.matches() = fold(title).contains(needle) || why?.let { fold(it).contains(needle) } == true
        fun List<ObjectiveCard>.keep() = mapNotNull { card ->
            when {
                card.goal.matches() -> card
                else -> card.keyResults.filter { it.goal.matches() }.takeIf { it.isNotEmpty() }?.let { card.copy(keyResults = it) }
            }
        }
        return overview.copy(
            objectives = overview.objectives.keep(),
            otherObjectives = overview.otherObjectives.keep(),
            wishes = overview.wishes.mapValues { (_, list) -> list.filter { it.matches() } },
            doneWishes = overview.doneWishes.filter { it.matches() },
        )
    }

    /** Minuscules sans accents : « Écrire » se trouve avec « ecrire ». */
    internal fun fold(text: String): String =
        Normalizer.normalize(text.lowercase(Locale.ROOT), Normalizer.Form.NFD).replace(DIACRITICS, "")

    private val DIACRITICS = Regex("\\p{Mn}+")

    /** Ordre alphabétique français : « Écrire » se range avec les E, pas après le Z. */
    private val collator: Collator = Collator.getInstance(Locale.FRENCH).apply { strength = Collator.SECONDARY }
    private val byName: Comparator<String> = Comparator { a, b -> collator.compare(a, b) }
}

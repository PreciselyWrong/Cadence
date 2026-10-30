package ch.nicolab.cadence.domain

import java.time.Clock
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

enum class LearnedAnswerKind { NO, YES, QUANTITY, DURATION, STANDARD_DRINKS }

data class LearnedQuestionSettings(
    val habitId: String,
    val enabled: Boolean,
    val askAt: LocalTime = DEFAULT_ASK_AT,
    val thresholdPercent: Int = DEFAULT_THRESHOLD_PERCENT,
    val mutedWeekdays: Set<DayOfWeek> = emptySet(),
    /** Aucune question pour un jour couvert par une pause ou un voyage ; désactivé, la question reste posée. */
    val silentDuringPauses: Boolean = true,
) {
    init {
        require(habitId.isNotBlank()) { "Habit id cannot be blank" }
        require(thresholdPercent in 1..100) { "Threshold must be a percentage" }
    }

    companion object {
        val DEFAULT_ASK_AT: LocalTime = LocalTime.of(9, 0)
        const val DEFAULT_THRESHOLD_PERCENT = 50

        /**
         * Une activité libre ou une abstinence ont une absence de saisie ambiguë (rien fait ou
         * rien noté ?), d'où une question active d'office. Un objectif classique se lit déjà
         * par son statut, donc reste silencieux.
         */
        fun defaultsFor(habit: HabitDefinition): LearnedQuestionSettings =
            LearnedQuestionSettings(
                habitId = habit.id,
                enabled = habit.goal.isTracker || habit.goal.isAbstinence,
            )
    }
}

enum class LearnedQuestionOutcome { NO, YES, AMOUNT, DISMISSED }

data class LearnedQuestionRecord(
    val habitId: String,
    val date: LocalDate,
    val outcome: LearnedQuestionOutcome,
    val valueMinor: Long? = null,
    val recordedAt: Instant,
) {
    init {
        require(habitId.isNotBlank()) { "Habit id cannot be blank" }
        require(
            if (outcome == LearnedQuestionOutcome.AMOUNT) valueMinor != null && valueMinor > 0
            else valueMinor == null,
        ) { "Only an amount carries a value" }
    }
}

/** Données structurées ; l'interface formate la phrase « 9 jeudis sur 12 » via strings.xml. */
data class LearnedEvidence(val weekday: DayOfWeek, val hits: Int, val observed: Int)

data class LearnedQuestion(
    val habitId: String,
    /** Le jour interrogé, c'est-à-dire hier. */
    val date: LocalDate,
    val weekday: DayOfWeek,
    val evidence: LearnedEvidence,
    val answerKinds: List<LearnedAnswerKind>,
    /** Unité de l'objectif pour QUANTITY, DURATION et YES ; null pour l'alcool. */
    val unit: MeasurementUnit?,
    val usualMinuteOfDay: Int?,
    val askAt: LocalTime,
)

sealed interface LearnedAnswer {
    data object No : LearnedAnswer

    data object Yes : LearnedAnswer

    /** Quantité dans l'échelle stockée de l'habitude (secondes pour une durée, verres standards pour l'alcool). */
    data class Amount(val valueMinor: Long) : LearnedAnswer {
        init {
            require(valueMinor > 0) { "Amount must be positive" }
        }
    }
}

/** Ce qu'une réponse écrit dans les données existantes. */
sealed interface LearnedAnswerWrite {
    /** « Non » : le domaine n'a pas de saisie nulle ; seule la réponse est conservée. */
    data object None : LearnedAnswerWrite

    data class Entry(val valueMinor: Long) : LearnedAnswerWrite

    data class AlcoholConsumption(val standardDrinks: Int?) : LearnedAnswerWrite
}

class QuestionPlanner(
    private val clock: Clock,
    private val weeks: Int = LearnedPatternDetector.DEFAULT_WEEKS,
    private val minObservedWeeks: Int = DEFAULT_MIN_OBSERVED_WEEKS,
) {
    companion object {
        /** En dessous, quelques semaines suffisent à décrire une habitude récente comme régulière. */
        const val DEFAULT_MIN_OBSERVED_WEEKS = 4

        fun answerKinds(goal: HabitGoal, profile: AbstinenceProfile): List<LearnedAnswerKind> = when {
            profile == AbstinenceProfile.ALCOHOL ->
                listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS)
            // Une occurrence d'abstinence se compte par saisie : aucune quantité à demander.
            goal.isAbstinence -> listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES)
            else -> when (goal.goalType) {
                GoalType.BINARY -> listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES)
                GoalType.COUNT -> listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.QUANTITY)
                GoalType.QUANTITY -> listOf(LearnedAnswerKind.NO, LearnedAnswerKind.QUANTITY)
                GoalType.DURATION -> listOf(LearnedAnswerKind.NO, LearnedAnswerKind.DURATION)
            }
        }
    }

    /** Propose la question de hier, ou rien si une condition la rend superflue ou non fiable. */
    fun plan(
        habit: HabitDefinition,
        profile: AbstinenceProfile,
        logs: List<ObservedLog>,
        pauses: List<HabitPause>,
        settings: LearnedQuestionSettings,
        records: List<LearnedQuestionRecord>,
        today: LocalDate = LocalDate.now(clock),
    ): LearnedQuestion? {
        require(settings.habitId == habit.id) { "Settings belong to another habit" }
        val yesterday = today.minusDays(1)
        if (!settings.enabled || !habit.active || habit.archived) return null
        if (yesterday < habit.startsOn) return null
        if (yesterday.dayOfWeek in settings.mutedWeekdays) return null
        if (records.any { it.habitId == habit.id && it.date == yesterday }) return null
        if (settings.silentDuringPauses && pauses.any { it.includes(yesterday) }) return null
        if (logs.any { it.localDate == yesterday }) return null
        val earliest = logs.minOfOrNull { it.localDate } ?: return null
        val trackingSince = maxOf(habit.startsOn, earliest)
        val share = LearnedPatternDetector
            .detect(logs, yesterday, trackingSince, pauses, weeks)
            .share(yesterday.dayOfWeek)
        if (!share.reaches(settings.thresholdPercent, minObservedWeeks)) return null
        return LearnedQuestion(
            habitId = habit.id,
            date = yesterday,
            weekday = yesterday.dayOfWeek,
            evidence = LearnedEvidence(yesterday.dayOfWeek, share.hits, share.observed),
            answerKinds = answerKinds(habit.goal, profile),
            unit = if (profile == AbstinenceProfile.ALCOHOL) null else habit.goal.unit,
            usualMinuteOfDay = share.usualMinuteOfDay,
            askAt = settings.askAt,
        )
    }

    /** Régularité affichée dans les réglages : fenêtre de [weeks] semaines se terminant aujourd'hui. */
    fun pattern(
        habit: HabitDefinition,
        logs: List<ObservedLog>,
        pauses: List<HabitPause>,
        today: LocalDate = LocalDate.now(clock),
    ): LearnedPattern {
        val trackingSince = logs.minOfOrNull { it.localDate }?.let { maxOf(habit.startsOn, it) } ?: habit.startsOn
        return LearnedPatternDetector.detect(logs, today, trackingSince, pauses, weeks)
    }

    fun resolve(question: LearnedQuestion, answer: LearnedAnswer): LearnedAnswerWrite {
        val kinds = question.answerKinds
        val alcohol = LearnedAnswerKind.STANDARD_DRINKS in kinds
        return when (answer) {
            LearnedAnswer.No -> {
                require(LearnedAnswerKind.NO in kinds) { "No is not offered for this question" }
                LearnedAnswerWrite.None
            }
            LearnedAnswer.Yes -> {
                require(LearnedAnswerKind.YES in kinds) { "Yes is not offered for this question" }
                if (alcohol) LearnedAnswerWrite.AlcoholConsumption(null)
                else LearnedAnswerWrite.Entry(question.unit?.scaleToCanonical ?: 1L)
            }
            is LearnedAnswer.Amount -> {
                require(
                    kinds.any { it == LearnedAnswerKind.QUANTITY || it == LearnedAnswerKind.DURATION || it == LearnedAnswerKind.STANDARD_DRINKS },
                ) { "An amount is not offered for this question" }
                if (alcohol) {
                    require(answer.valueMinor <= Int.MAX_VALUE) { "Standard drinks exceed the stored range" }
                    LearnedAnswerWrite.AlcoholConsumption(answer.valueMinor.toInt())
                } else {
                    LearnedAnswerWrite.Entry(answer.valueMinor)
                }
            }
        }
    }

    fun record(question: LearnedQuestion, answer: LearnedAnswer): LearnedQuestionRecord {
        // Valider d'abord : une réponse hors de la question ne doit rien enregistrer.
        resolve(question, answer)
        val (outcome, value) = when (answer) {
            LearnedAnswer.No -> LearnedQuestionOutcome.NO to null
            LearnedAnswer.Yes -> LearnedQuestionOutcome.YES to null
            is LearnedAnswer.Amount -> LearnedQuestionOutcome.AMOUNT to answer.valueMinor
        }
        return LearnedQuestionRecord(
            habitId = question.habitId,
            date = question.date,
            outcome = outcome,
            valueMinor = value,
            recordedAt = clock.instant(),
        )
    }

    fun dismissal(question: LearnedQuestion): LearnedQuestionRecord =
        LearnedQuestionRecord(
            habitId = question.habitId,
            date = question.date,
            outcome = LearnedQuestionOutcome.DISMISSED,
            recordedAt = clock.instant(),
        )
}

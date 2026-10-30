package ch.nicolab.cadence.domain

import java.time.Clock
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class QuestionPlannerTest {
    private val now = Instant.parse("2026-10-30T08:00:00Z")
    private val planner = QuestionPlanner(Clock.fixed(now, ZoneId.of("Europe/Zurich")))
    private val today = LocalDate.of(2026, 10, 30)
    private val yesterday = LocalDate.of(2026, 10, 29)

    /** Lundi antérieur à la fenêtre de 12 semaines : fixe le début du suivi sans compter comme saisie de la fenêtre. */
    private val anchor = LocalDate.of(2026, 7, 27)

    private val trackerGoal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT, direction = GoalDirection.TRACK_ONLY)
    private val abstinenceGoal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, MeasurementUnit.COUNT, direction = GoalDirection.AT_MOST)
    private val durationTrackerGoal = HabitGoal(0, PeriodType.DAY, GoalType.DURATION, MeasurementUnit.MINUTES, direction = GoalDirection.TRACK_ONLY)

    private fun habitWith(
        goal: HabitGoal,
        startsOn: LocalDate = LocalDate.of(2026, 1, 1),
        active: Boolean = true,
        archived: Boolean = false,
    ) = HabitDefinition(
        id = "h",
        startsOn = startsOn,
        active = active,
        archived = archived,
        goal = goal,
        schedule = HabitSchedule(),
    )

    private val habit = habitWith(trackerGoal)
    private val settings = LearnedQuestionSettings(habitId = "h", enabled = true)

    /** Jeudis en remontant depuis le 22 octobre 2026. */
    private fun thursdays(count: Int): List<LocalDate> =
        (0 until count).map { LocalDate.of(2026, 10, 22).minusWeeks(it.toLong()) }

    /** [thursdayHits] jeudis saisis sur les 12 jeudis de la fenêtre, plus l'ancre. */
    private fun history(thursdayHits: Int): List<ObservedLog> =
        thursdays(thursdayHits).map { ObservedLog(it) } + ObservedLog(anchor)

    private fun plan(
        logs: List<ObservedLog> = history(9),
        habit: HabitDefinition = this.habit,
        profile: AbstinenceProfile = AbstinenceProfile.NONE,
        pauses: List<HabitPause> = emptyList(),
        settings: LearnedQuestionSettings = this.settings,
        records: List<LearnedQuestionRecord> = emptyList(),
    ) = planner.plan(habit, profile, logs, pauses, settings, records, today)

    private fun question(
        kinds: List<LearnedAnswerKind>,
        unit: MeasurementUnit? = MeasurementUnit.COUNT,
    ) = LearnedQuestion(
        habitId = "h",
        date = yesterday,
        weekday = DayOfWeek.THURSDAY,
        evidence = LearnedEvidence(DayOfWeek.THURSDAY, 9, 12),
        answerKinds = kinds,
        unit = unit,
        usualMinuteOfDay = null,
        askAt = LocalTime.of(9, 0),
    )

    @Test fun `asks about a weekday the habit is usually logged with its evidence and answer kinds`() {
        val question = requireNotNull(plan())

        assertEquals(yesterday, question.date)
        assertEquals(DayOfWeek.THURSDAY, question.weekday)
        assertEquals(LearnedEvidence(DayOfWeek.THURSDAY, 9, 12), question.evidence)
        assertEquals(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.QUANTITY), question.answerKinds)
        assertEquals(MeasurementUnit.COUNT, question.unit)
        assertEquals(LocalTime.of(9, 0), question.askAt)
    }

    @Test fun `fifty percent of observed weeks asks and five of twelve does not`() {
        assertNotNull(plan(logs = history(6)))
        assertNull(plan(logs = history(5)))
    }

    @Test fun `threshold is honoured exactly`() {
        val strict = LearnedQuestionSettings(habitId = "h", enabled = true, thresholdPercent = 75)

        assertNotNull(plan(logs = history(9), settings = strict))
        assertNull(plan(logs = history(8), settings = strict))
    }

    @Test fun `fewer than four observed weeks does not ask and four does`() {
        val threeWeeks = thursdays(3).map { ObservedLog(it) }
        val fourWeeks = thursdays(4).map { ObservedLog(it) }

        assertNull(plan(logs = threeWeeks))
        assertNotNull(plan(logs = fourWeeks))
    }

    @Test fun `logged yesterday does not ask`() {
        assertNull(plan(logs = history(9) + ObservedLog(yesterday)))
    }

    @Test fun `pause covering yesterday does not ask`() {
        assertNull(plan(pauses = listOf(HabitPause.skip(yesterday, PauseReason.REST))))
    }

    @Test fun `pause covering yesterday asks when silence during pauses is off`() {
        val awake = settings.copy(silentDuringPauses = false)

        assertNotNull(plan(settings = awake, pauses = listOf(HabitPause.skip(yesterday, PauseReason.REST))))
    }

    @Test fun `silence during pauses is on by default`() {
        assertEquals(true, settings.silentDuringPauses)
    }

    @Test fun `pause earlier in the window shrinks observed weeks`() {
        val logs = listOf(
            LocalDate.of(2026, 9, 17),
            LocalDate.of(2026, 9, 24),
            LocalDate.of(2026, 10, 1),
            LocalDate.of(2026, 10, 8),
        ).map { ObservedLog(it) } + ObservedLog(anchor)
        val pauses = listOf(HabitPause(LocalDate.of(2026, 8, 6), LocalDate.of(2026, 9, 11)))

        assertNull(plan(logs = logs))

        val question = requireNotNull(plan(logs = logs, pauses = pauses))
        assertEquals(LearnedEvidence(DayOfWeek.THURSDAY, 4, 6), question.evidence)
    }

    @Test fun `muted weekday does not ask`() {
        assertNull(plan(settings = settings.copy(mutedWeekdays = setOf(DayOfWeek.THURSDAY))))
    }

    @Test fun `existing answer or dismissal for yesterday does not ask`() {
        val answered = LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.NO, recordedAt = now)
        val dismissed = LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.DISMISSED, recordedAt = now)

        assertNull(plan(records = listOf(answered)))
        assertNull(plan(records = listOf(dismissed)))
    }

    @Test fun `record for another date does not block the question`() {
        val other = LearnedQuestionRecord("h", LocalDate.of(2026, 10, 28), LearnedQuestionOutcome.NO, recordedAt = now)

        assertNotNull(plan(records = listOf(other)))
    }

    @Test fun `archived habit does not ask`() {
        assertNull(plan(habit = habitWith(trackerGoal, archived = true)))
    }

    @Test fun `inactive habit does not ask`() {
        assertNull(plan(habit = habitWith(trackerGoal, active = false)))
    }

    @Test fun `disabled settings do not ask`() {
        assertNull(plan(settings = settings.copy(enabled = false)))
    }

    @Test fun `yesterday before the start date does not ask`() {
        assertNull(plan(habit = habitWith(trackerGoal, startsOn = yesterday.plusDays(1))))
    }

    @Test fun `no logs does not ask`() {
        assertNull(plan(logs = emptyList()))
    }

    @Test fun `a log observed on a thursday in tokyo counts as thursday`() {
        val tokyoThursday = HabitEntry(
            id = "e",
            habitId = "h",
            occurredAt = Instant.parse("2026-10-21T23:30:00Z"),
            localDate = LocalDate.of(2026, 10, 22),
            observedZoneId = ZoneId.of("Asia/Tokyo"),
            valueMinor = 1,
        )
        val logs = history(9).filterNot { it.localDate == LocalDate.of(2026, 10, 22) } + ObservedLog.of(tokyoThursday)

        assertEquals(9, requireNotNull(plan(logs = logs)).evidence.hits)
    }

    @Test fun `pattern uses today as the exclusive end of the window`() {
        val share = planner.pattern(habit, history(9), emptyList(), today).share(DayOfWeek.THURSDAY)

        assertEquals(9, share.hits)
        assertEquals(12, share.observed)
    }

    @Test fun `alcohol offers standard drinks`() {
        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS),
            QuestionPlanner.answerKinds(trackerGoal, AbstinenceProfile.ALCOHOL),
        )
    }

    @Test fun `non alcohol abstinence offers yes or no without quantity`() {
        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES),
            QuestionPlanner.answerKinds(abstinenceGoal, AbstinenceProfile.SMOKING),
        )
    }

    @Test fun `count tracker offers a quantity`() {
        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.QUANTITY),
            QuestionPlanner.answerKinds(trackerGoal, AbstinenceProfile.NONE),
        )
    }

    @Test fun `quantity goal offers only a quantity`() {
        val goal = HabitGoal(500, PeriodType.DAY, GoalType.QUANTITY, MeasurementUnit.MILLILITERS)

        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.QUANTITY),
            QuestionPlanner.answerKinds(goal, AbstinenceProfile.NONE),
        )
    }

    @Test fun `duration tracker offers a duration`() {
        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.DURATION),
            QuestionPlanner.answerKinds(durationTrackerGoal, AbstinenceProfile.NONE),
        )
    }

    @Test fun `binary goal offers yes or no`() {
        assertEquals(
            listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES),
            QuestionPlanner.answerKinds(HabitGoal(1, PeriodType.DAY, GoalType.BINARY), AbstinenceProfile.NONE),
        )
    }

    @Test fun `learning is on by default for trackers and abstinences only`() {
        assertEquals(true, LearnedQuestionSettings.defaultsFor(habitWith(trackerGoal)).enabled)
        assertEquals(true, LearnedQuestionSettings.defaultsFor(habitWith(abstinenceGoal)).enabled)
        assertEquals(false, LearnedQuestionSettings.defaultsFor(habitWith(HabitGoal(1, PeriodType.DAY, GoalType.BINARY))).enabled)
    }

    @Test fun `alcohol no resolves to nothing to write`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS), unit = null)

        assertEquals(LearnedAnswerWrite.None, planner.resolve(q, LearnedAnswer.No))
    }

    @Test fun `alcohol yes resolves to a consumption without quantity`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS), unit = null)

        assertEquals(LearnedAnswerWrite.AlcoholConsumption(null), planner.resolve(q, LearnedAnswer.Yes))
    }

    @Test fun `alcohol amount resolves to standard drinks`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS), unit = null)

        assertEquals(LearnedAnswerWrite.AlcoholConsumption(2), planner.resolve(q, LearnedAnswer.Amount(2)))
    }

    @Test fun `count yes resolves to one canonical unit`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.QUANTITY))

        assertEquals(LearnedAnswerWrite.Entry(1), planner.resolve(q, LearnedAnswer.Yes))
    }

    @Test fun `duration amount resolves to canonical seconds`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.DURATION), unit = MeasurementUnit.MINUTES)

        assertEquals(LearnedAnswerWrite.Entry(1800), planner.resolve(q, LearnedAnswer.Amount(1800)))
    }

    @Test fun `amount on a binary question is refused`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES), unit = null)

        assertThrows(IllegalArgumentException::class.java) { planner.resolve(q, LearnedAnswer.Amount(1)) }
    }

    @Test fun `yes on a duration question is refused`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.DURATION), unit = MeasurementUnit.MINUTES)

        assertThrows(IllegalArgumentException::class.java) { planner.resolve(q, LearnedAnswer.Yes) }
    }

    @Test fun `record keeps the outcome and the clock instant`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.QUANTITY))

        assertEquals(LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.NO, recordedAt = now), planner.record(q, LearnedAnswer.No))
        assertEquals(LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.YES, recordedAt = now), planner.record(q, LearnedAnswer.Yes))
    }

    @Test fun `record of an amount keeps its value`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES, LearnedAnswerKind.STANDARD_DRINKS), unit = null)

        assertEquals(
            LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.AMOUNT, valueMinor = 2, recordedAt = now),
            planner.record(q, LearnedAnswer.Amount(2)),
        )
    }

    @Test fun `record of an invalid answer is refused`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES), unit = null)

        assertThrows(IllegalArgumentException::class.java) { planner.record(q, LearnedAnswer.Amount(1)) }
    }

    @Test fun `dismissal records a dismissed outcome at the clock instant`() {
        val q = question(listOf(LearnedAnswerKind.NO, LearnedAnswerKind.YES))

        assertEquals(LearnedQuestionRecord("h", yesterday, LearnedQuestionOutcome.DISMISSED, recordedAt = now), planner.dismissal(q))
    }
}

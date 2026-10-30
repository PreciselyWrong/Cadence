package ch.nicolab.cadence.data.local

import androidx.room.withTransaction
import ch.nicolab.cadence.data.local.entities.LearnedQuestionRecordEntity
import ch.nicolab.cadence.data.local.entities.LearnedQuestionSettingsEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.HabitEntrySource
import ch.nicolab.cadence.domain.LearnedAnswer
import ch.nicolab.cadence.domain.LearnedAnswerWrite
import ch.nicolab.cadence.domain.LearnedPattern
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.domain.LearnedQuestionOutcome
import ch.nicolab.cadence.domain.LearnedQuestionRecord
import ch.nicolab.cadence.domain.LearnedQuestionSettings
import ch.nicolab.cadence.domain.ObservedLog
import ch.nicolab.cadence.domain.QuestionPlanner
import java.time.Clock
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.flow.Flow

/**
 * Persistance des questions apprises. Le domaine décide ce qui est pertinent ; ce dépôt
 * ne fait qu'écrire les conséquences d'une réponse, dans la même transaction que la trace.
 */
class LearnedQuestionRepository(
    private val database: CadenceDatabase,
    private val cadence: CadenceRepository,
    private val clock: Clock = Clock.systemDefaultZone(),
    private val planner: QuestionPlanner = QuestionPlanner(clock),
) {
    private val dao get() = database.learnedQuestionDao()

    fun observeRevision(): Flow<Long> = dao.observeRevision()

    /**
     * Questions de hier. Les habitudes sont lues dans la version en vigueur hier : c'est elle
     * qui décrivait l'objectif sur lequel la question porte.
     */
    suspend fun pendingQuestions(today: LocalDate = LocalDate.now(clock)): List<LearnedQuestion> {
        val yesterday = today.minusDays(1)
        return cadence.getHabitsEffectiveAt(yesterday)
            .sortedBy(PersistedHabit::sortOrder)
            .mapNotNull { habit ->
                val settings = settingsFor(habit)
                if (!settings.enabled) return@mapNotNull null
                val id = habit.id
                planner.plan(
                    habit = habit.definition,
                    profile = habit.abstinenceProfile,
                    logs = logsOf(habit),
                    pauses = cadence.getPauses(id),
                    settings = settings,
                    records = dao.getRecords(id).map { it.toDomain() },
                    today = today,
                )
            }
    }

    suspend fun answer(question: LearnedQuestion, answer: LearnedAnswer) {
        // Valider avant toute écriture : une réponse hors de la question ne doit rien laisser.
        val write = planner.resolve(question, answer)
        val record = planner.record(question, answer)
        database.withTransaction {
            // Un double tap sur une action de notification ne doit ni dupliquer la saisie ni la trace.
            if (dao.getRecord(question.habitId, question.date.toString()) != null) return@withTransaction
            when (write) {
                LearnedAnswerWrite.None -> Unit
                is LearnedAnswerWrite.Entry -> writeEntry(question, write.valueMinor)
                is LearnedAnswerWrite.AlcoholConsumption -> writeAlcoholConsumption(question, write.standardDrinks)
            }
            dao.insertRecord(record.toEntity())
        }
    }

    suspend fun dismiss(question: LearnedQuestion) {
        dao.insertRecord(planner.dismissal(question).toEntity())
    }

    suspend fun muteWeekday(habitId: String, weekday: DayOfWeek) {
        val current = settings(habitId)
        updateSettings(current.copy(mutedWeekdays = current.mutedWeekdays + weekday))
    }

    suspend fun settings(habitId: String): LearnedQuestionSettings {
        val habit = requireNotNull(cadence.getHabitEffectiveAt(habitId, LocalDate.now(clock))) {
            "Habit is missing"
        }
        return settingsFor(habit)
    }

    suspend fun updateSettings(settings: LearnedQuestionSettings) {
        require(cadence.getHabitEffectiveAt(settings.habitId, LocalDate.now(clock)) != null) {
            "Habit is missing"
        }
        dao.saveSettings(
            LearnedQuestionSettingsEntity(
                habitId = settings.habitId,
                enabled = settings.enabled,
                askAt = settings.askAt.format(ASK_AT_FORMAT),
                thresholdPercent = settings.thresholdPercent,
                mutedWeekdays = settings.mutedWeekdays.sortedBy(DayOfWeek::ordinal).joinToString(",") { it.name },
            ),
        )
    }

    suspend fun pattern(habitId: String, today: LocalDate = LocalDate.now(clock)): LearnedPattern {
        val habit = requireNotNull(cadence.getHabitEffectiveAt(habitId, today)) { "Habit is missing" }
        return planner.pattern(habit.definition, logsOf(habit), cadence.getPauses(habitId), today)
    }

    private suspend fun writeEntry(question: LearnedQuestion, valueMinor: Long) {
        // Une saisie faite entre-temps dans l'app ou le widget l'emporte sur la réponse.
        if (cadence.getEntries(question.habitId, question.date, question.date).isNotEmpty()) return
        val minute = question.usualMinuteOfDay
        val time = minute?.let { LocalTime.of(it / 60, it % 60) } ?: LocalTime.NOON
        cadence.addEntry(
            HabitEntry(
                id = UUID.randomUUID().toString(),
                habitId = question.habitId,
                occurredAt = question.date.atTime(time).atZone(clock.zone).toInstant(),
                localDate = question.date,
                observedZoneId = clock.zone,
                valueMinor = valueMinor,
                source = HabitEntrySource.LEARNED_QUESTION,
            ),
        )
    }

    private suspend fun writeAlcoholConsumption(question: LearnedQuestion, standardDrinks: Int?) {
        val existing = cadence.getAlcoholConsumptions(question.habitId).firstOrNull { it.localDate == question.date }
        // Une consommation notée entre-temps l'emporte : un simple « Oui » n'a rien à y ajouter.
        if (existing != null && standardDrinks == null) return
        // Rétroactive : pas d'alarme de relance, et pas d'instant inventé si l'heure est inconnue.
        cadence.saveAlcoholConsumption(
            AlcoholConsumption(
                id = existing?.id ?: UUID.randomUUID().toString(),
                habitId = question.habitId,
                localDate = question.date,
                observedZoneId = existing?.observedZoneId ?: clock.zone,
                standardDrinks = standardDrinks ?: existing?.standardDrinks,
                followUpDate = null,
                followUpNotified = true,
                observedAt = existing?.observedAt,
            ),
        )
    }

    private suspend fun logsOf(habit: PersistedHabit): List<ObservedLog> =
        // Tout l'historique : le domaine a besoin de la première saisie pour dater le suivi.
        if (habit.abstinenceProfile == AbstinenceProfile.ALCOHOL) {
            cadence.getAlcoholConsumptions(habit.id).map { ObservedLog.of(it) }
        } else {
            cadence.getEntries(habit.id).map { ObservedLog.of(it) }
        }

    private suspend fun settingsFor(habit: PersistedHabit): LearnedQuestionSettings {
        val stored = dao.getSettings(habit.id) ?: return LearnedQuestionSettings.defaultsFor(habit.definition)
        return LearnedQuestionSettings(
            habitId = stored.habitId,
            enabled = stored.enabled,
            askAt = LocalTime.parse(stored.askAt),
            thresholdPercent = stored.thresholdPercent,
            mutedWeekdays = stored.mutedWeekdays.split(",").filter(String::isNotBlank)
                .map(DayOfWeek::valueOf).toSet(),
        )
    }

    private fun LearnedQuestionRecord.toEntity() = LearnedQuestionRecordEntity(
        habitId = habitId,
        localDate = date.toString(),
        outcome = outcome.name,
        valueMinor = valueMinor,
        recordedAtEpochMs = recordedAt.toEpochMilli(),
    )

    private fun LearnedQuestionRecordEntity.toDomain() = LearnedQuestionRecord(
        habitId = habitId,
        date = LocalDate.parse(localDate),
        outcome = LearnedQuestionOutcome.valueOf(outcome),
        valueMinor = valueMinor,
        recordedAt = Instant.ofEpochMilli(recordedAtEpochMs),
    )

    private companion object {
        val ASK_AT_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    }
}

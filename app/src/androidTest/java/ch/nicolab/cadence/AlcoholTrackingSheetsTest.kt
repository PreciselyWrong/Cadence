package ch.nicolab.cadence

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToIndex
import androidx.test.ext.junit.runners.AndroidJUnit4
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.AlcoholStatsCalculator
import ch.nicolab.cadence.domain.GoalDirection
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.HabitSchedule
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.ScheduleMode
import ch.nicolab.cadence.ui.theme.CadenceTheme
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AlcoholTrackingSheetsTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun lightDetailExposesTodayPastAndPendingFlows() {
        val today = LocalDate.now()
        val item = alcoholItem(today, listOf(consumption(today.minusDays(1))))
        var todayActions = 0

        compose.setContent {
            CadenceTheme(darkTheme = false) {
                AlcoholDetailSheet(
                    item = item,
                    dismiss = {},
                    recordToday = { saved -> todayActions += 1; saved() },
                    saveConsumption = { _, _, _, saved -> saved() },
                    deleteConsumption = { _, saved -> saved() },
                    editHabit = {},
                )
            }
        }

        compose.onNodeWithTag("abstinence_time_seconds").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("alcohol_detail_list").performScrollToIndex(4)
        compose.onNodeWithText("Verres à renseigner").assertIsDisplayed()
        compose.onNodeWithTag("alcohol_detail_list").performScrollToIndex(3)
        compose.onNodeWithText("J’ai bu aujourd’hui").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, todayActions) }
        compose.onNodeWithTag("alcohol_detail_list").performScrollToIndex(3)
        compose.onNodeWithText("Ajouter une consommation passée").performClick()
        compose.onNodeWithText("Nombre de verres standards").assertIsDisplayed()
        compose.onNodeWithText("Verres standards").assertIsDisplayed()
    }

    @Test
    fun darkStatisticsShowInsufficientSampleAndCalendar() {
        val today = LocalDate.now()
        val item = alcoholItem(today, listOf(consumption(today.minusDays(3), 2)))

        compose.setContent {
            CadenceTheme(darkTheme = true) {
                AlcoholStatisticsSheet(item = item, dismiss = {})
            }
        }

        compose.onNodeWithText("Pas assez de recul pour calculer une fréquence.").assertIsDisplayed()
        compose.onNodeWithText("Calendrier des consommations").assertIsDisplayed()
        compose.onNodeWithText("2 verres renseignés").assertIsDisplayed()
    }

    private fun alcoholItem(today: LocalDate, consumptions: List<AlcoholConsumption>): HabitCardState {
        val start = today.minusDays(20)
        val goal = HabitGoal(0, PeriodType.DAY, GoalType.COUNT, direction = GoalDirection.AT_MOST)
        val stored = PersistedHabit(
            id = "alcohol",
            name = "Alcool",
            active = true,
            startsOn = start,
            abstinenceProfile = AbstinenceProfile.ALCOHOL,
            abstinenceStartedAt = start.atStartOfDay(ZoneId.systemDefault()).toInstant(),
            alcoholFollowUpTime = "09:00",
            goal = goal,
            schedule = HabitSchedule(mode = ScheduleMode.EVERY_DAY),
        )
        return HabitCardState(
            stored = stored,
            evaluation = HabitEvaluator().evaluate(stored.definition, today, emptyList(), emptyList()),
            quickValues = emptyList(),
            reminders = emptyList(),
            history = emptyList(),
            entryCount = consumptions.size,
            dailyHistory = emptyList(),
            insights = HabitInsights(),
            recentEntries = emptyList(),
            pauses = emptyList(),
            streak = HabitStreak(0, 0),
            alcoholConsumptions = consumptions.sortedByDescending(AlcoholConsumption::localDate),
            alcoholStats = AlcoholStatsCalculator.compute(stored.id, start, today, consumptions, emptyList()),
        )
    }

    private fun consumption(date: LocalDate, drinks: Int? = null) = AlcoholConsumption(
        id = date.toString(),
        habitId = "alcohol",
        localDate = date,
        observedZoneId = ZoneId.systemDefault(),
        standardDrinks = drinks,
    )
}

package ch.nicolab.cadence

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import ch.nicolab.cadence.designsystem.theme.Appearance
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.designsystem.theme.ThemeMode
import ch.nicolab.cadence.ui.components.ActivityCalendar
import ch.nicolab.cadence.ui.components.ActivityCalendarCell
import ch.nicolab.cadence.ui.components.ActivityCalendarTone
import java.time.LocalDate
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ActivityCalendarUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun lightCalendarSelectsADayAndShowsItsDetail() {
        val date = LocalDate.of(2026, 9, 10)

        compose.setContent {
            CadenceTheme(Appearance(themeMode = ThemeMode.LIGHT)) {
                ActivityCalendar(
                    cells = listOf(
                        ActivityCalendarCell(
                            date = date,
                            tone = ActivityCalendarTone.SUCCESS,
                            contentDescription = "10 septembre : idéal atteint",
                            detailText = "10 septembre : idéal atteint",
                        ),
                    ),
                    today = date,
                    title = "Activité",
                )
            }
        }

        compose.onNodeWithTag("activity_calendar_cell_$date").assertIsDisplayed().performClick()
        compose.onNodeWithTag("activity_calendar_selected_detail").assertIsDisplayed()
    }

    @Test
    fun darkCalendarExposesNeutralAndDangerDays() {
        val today = LocalDate.of(2026, 9, 11)

        compose.setContent {
            CadenceTheme(Appearance(themeMode = ThemeMode.DARK)) {
                ActivityCalendar(
                    cells = listOf(
                        ActivityCalendarCell(today.minusDays(1), ActivityCalendarTone.NEUTRAL, "10 septembre : neutre"),
                        ActivityCalendarCell(today, ActivityCalendarTone.DANGER, "11 septembre : raté"),
                    ),
                    today = today,
                )
            }
        }

        compose.onNodeWithTag("activity_calendar_cell_${today.minusDays(1)}").assertIsDisplayed()
        compose.onNodeWithTag("activity_calendar_cell_$today").assertIsDisplayed()
    }
}

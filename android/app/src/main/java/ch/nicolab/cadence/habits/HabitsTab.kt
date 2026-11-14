package ch.nicolab.cadence.habits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.PrimaryAdd
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.components.navigationClearance
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.tasks.ui.notifications.NotificationsBellButton

/**
 * Onglet Habitudes : un seul en-tête partagé, puis le sélecteur qui choisit entre
 * la vue du jour et la liste complète.
 */
@Composable
internal fun HabitsTab(
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
    create: () -> Unit,
    openSettings: () -> Unit,
    openNotifications: () -> Unit = {},
    timers: Map<String, HabitTimer>,
    busy: Boolean,
    direct: (HabitCardState) -> Unit,
    offerReturn: Boolean,
    resume: () -> Unit,
    edit: (HabitCardState) -> Unit,
    questions: List<LearnedQuestion> = emptyList(),
    answer: (LearnedQuestion) -> Unit = {},
) {
    var segment by rememberSaveable { mutableIntStateOf(SEGMENT_TODAY) }
    val header: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            ScreenHeader(
                title = stringResource(R.string.habits_title),
                actions = {
                    NotificationsBellButton(onClick = openNotifications)
                    RoundHeaderButton(Icons.Outlined.Settings, stringResource(R.string.tab_settings), onClick = openSettings)
                },
            )
            // Sans habitude, rien à départager : pas de sélecteur Aujourd'hui / Toutes.
            if (habits.isNotEmpty()) {
                SegmentedTabs(
                    listOf(stringResource(R.string.habits_segment_today), stringResource(R.string.habits_segment_all)),
                    segment,
                    { segment = it },
                )
            }
        }
    }
    // Même geste d'ajout que partout ailleurs : le + de la barre du bas, pas un + dans l'en-tête.
    Box(Modifier.fillMaxSize()) {
        if (segment == SEGMENT_TODAY) {
            HabitsTodayScreen(
                header, habits, groups, selectedGroupId, onSelectGroup, quick, options, timers, busy, direct, offerReturn, resume, edit, questions, answer,
            )
        } else {
            HabitsScreen(header, habits, groups, selectedGroupId, onSelectGroup, options, quick)
        }
        PrimaryAdd(
            icon = Icons.Outlined.Add,
            label = stringResource(R.string.create_habit_button),
            onClick = create,
            fabModifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = Space.gutter, bottom = navigationClearance() + Space.lg),
        )
    }
}

private const val SEGMENT_TODAY = 0

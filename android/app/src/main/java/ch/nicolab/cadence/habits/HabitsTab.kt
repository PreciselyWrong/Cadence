package ch.nicolab.cadence.habits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SegmentedTabs
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitTimer

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
    timers: Map<String, HabitTimer>,
    busy: Boolean,
    direct: (HabitCardState) -> Unit,
    offerReturn: Boolean,
    resume: () -> Unit,
    edit: (HabitCardState) -> Unit,
) {
    var segment by rememberSaveable { mutableIntStateOf(SEGMENT_TODAY) }
    val header: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            ScreenHeader(
                title = stringResource(R.string.habits_title),
                actions = {
                    RoundHeaderButton(Icons.Outlined.Add, stringResource(R.string.create_habit_button), style = HeaderButtonStyle.Filled, onClick = create)
                    RoundHeaderButton(Icons.Outlined.Settings, stringResource(R.string.tab_settings), onClick = openSettings)
                },
            )
            SegmentedTabs(
                listOf(stringResource(R.string.habits_segment_today), stringResource(R.string.habits_segment_all)),
                segment,
                { segment = it },
            )
        }
    }
    if (segment == SEGMENT_TODAY) {
        HabitsTodayScreen(
            header, habits, groups, selectedGroupId, onSelectGroup, quick, options, create, timers, busy, direct, offerReturn, resume, edit,
        )
    } else {
        HabitsScreen(header, habits, groups, selectedGroupId, onSelectGroup, create, options, quick)
    }
}

private const val SEGMENT_TODAY = 0

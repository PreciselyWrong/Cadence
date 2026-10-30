package ch.nicolab.cadence.habits

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.ui.ScreenList

@Composable
internal fun HabitsScreen(
    header: @Composable () -> Unit,
    habits: List<HabitCardState>,
    groups: List<HabitGroup>,
    selectedGroupId: String?,
    onSelectGroup: (String?) -> Unit,
    create: () -> Unit,
    options: (HabitCardState) -> Unit,
    open: (HabitCardState) -> Unit,
) {
    val visible = habits.inGroup(selectedGroupId)
    val active = visible.filter { !it.stored.archived }
    val archived = visible.filter { it.stored.archived }
    val populatedGroups = remember(groups, habits) {
        groups.filter { g -> habits.any { it.stored.groupId == g.id } }
    }
    ScreenList(header = header) {
        if (populatedGroups.size > 1) item { GroupFilter(populatedGroups, habits, selectedGroupId, onSelectGroup) }
        if (active.isEmpty() && archived.isEmpty() && selectedGroupId != null) {
            item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.group_filter_empty), stringResource(R.string.empty_habits_message))
            }
        } else if (active.isEmpty() && archived.isEmpty()) {
            item {
                EmptyState(Icons.Outlined.AutoAwesome, stringResource(R.string.empty_habits_title), stringResource(R.string.empty_habits_message)) {
                    PrimaryAction(stringResource(R.string.create_habit_button), onClick = create)
                }
            }
        }
        val activeHabits = active.filter { !it.stored.goal.isTracker && !it.stored.goal.isAbstinence }
        val activeTrackers = active.filter { it.stored.goal.isTracker }
        val activeAbstinences = active.filter { it.stored.goal.isAbstinence }
        if (activeHabits.isNotEmpty()) item { SectionHeader(stringResource(R.string.today_regular_section)) }
        items(activeHabits, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { open(it) }, onLongClick = { options(it) }, onOptions = { options(it) })
            }
        }
        if (activeTrackers.isNotEmpty()) item { SectionHeader(stringResource(R.string.today_activities_section)) }
        items(activeTrackers, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { open(it) }, onLongClick = { options(it) }, onOptions = { options(it) })
            }
        }
        if (activeAbstinences.isNotEmpty()) item { SectionHeader(stringResource(R.string.today_abstinences_section)) }
        items(activeAbstinences, key = { it.stored.id }) {
            Box(Modifier.animateItem().fillMaxWidth()) {
                HabitRow(it, onClick = { open(it) }, onLongClick = { options(it) }, onOptions = { options(it) })
            }
        }
        if (archived.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.habits_archived_section)) }
            items(archived, key = { "archived-${it.stored.id}" }) {
                Box(Modifier.animateItem().fillMaxWidth()) {
                    HabitRow(it, done = true, onClick = { options(it) }, onLongClick = { options(it) }, onOptions = { options(it) })
                }
            }
        }
    }
}

/** `null` signifie l'ensemble : le filtre restreint la vue, il ne cache jamais le reste. */
private fun List<HabitCardState>.inGroup(groupId: String?): List<HabitCardState> =
    if (groupId == null) this else filter { it.stored.groupId == groupId }

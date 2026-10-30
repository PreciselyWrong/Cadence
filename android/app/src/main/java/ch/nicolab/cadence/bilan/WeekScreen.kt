package ch.nicolab.cadence.bilan

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.domain.WeekEntry
import ch.nicolab.cadence.domain.WeekOutlook
import ch.nicolab.cadence.domain.WeekStage
import ch.nicolab.cadence.habits.HabitRow
import ch.nicolab.cadence.ui.ScreenList
import ch.nicolab.cadence.ui.components.EmptyState
import ch.nicolab.cadence.ui.components.SectionLabel
import java.time.LocalDate

/**
 * Cette semaine : les habitudes regroupées par ce qu'il reste à en faire. Une habitude
 * dont plus aucun jour n'est planifié d'ici dimanche ne s'affiche pas - la lister ne
 * proposerait aucune action.
 */
@Composable
internal fun WeekScreen(
    habits: List<HabitCardState>,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
) {
    val today = LocalDate.now()
    val byId = habits.associateBy { it.stored.id }
    val outlook = remember(habits) {
        WeekOutlook.of(
            habits = habits.map { it.stored.definition },
            today = today,
            entries = habits.flatMap(HabitCardState::recentEntries),
            pausesOf = { id -> byId[id]?.pauses?.map(IdentifiedPause::pause).orEmpty() },
        )
    }
    val labels = mapOf(
        WeekStage.TODO to R.string.week_stage_todo,
        WeekStage.WELL_UNDERWAY to R.string.week_stage_well_underway,
        WeekStage.MINIMUM to R.string.week_stage_minimum,
        WeekStage.DONE to R.string.week_stage_done,
    )

    ScreenList(context = stringResource(R.string.week_subtitle), title = stringResource(R.string.week_title)) {
        if (outlook.byStage.values.all(List<WeekEntry>::isEmpty)) {
            item {
                EmptyState(
                    Icons.Outlined.Check,
                    stringResource(R.string.week_empty_title),
                    stringResource(R.string.week_empty_message),
                )
            }
        }
        WeekStage.entries.forEach { stage ->
            val entries = outlook.byStage.getValue(stage).mapNotNull { byId[it.habit.id] }
            if (entries.isNotEmpty()) {
                item(key = "stage-$stage") { SectionLabel(stringResource(labels.getValue(stage))) }
                items(entries, key = { "$stage-${it.stored.id}" }) { card ->
                    Box(Modifier.animateItem().fillMaxWidth()) {
                        HabitRow(
                            card,
                            done = stage == WeekStage.DONE,
                            onClick = { quick(card) },
                            onLongClick = { options(card) },
                        )
                    }
                }
            }
        }
    }
}

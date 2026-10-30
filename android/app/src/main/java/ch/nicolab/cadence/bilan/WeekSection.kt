package ch.nicolab.cadence.bilan

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.domain.WeekEntry
import ch.nicolab.cadence.domain.WeekOutlook
import ch.nicolab.cadence.domain.WeekStage
import ch.nicolab.cadence.habits.HabitRow

/**
 * Cette semaine : les habitudes regroupées par ce qu'il reste à en faire. Une habitude
 * dont plus aucun jour n'est planifié d'ici dimanche ne s'affiche pas - la lister ne
 * proposerait aucune action.
 *
 * L'état vide reste silencieux sans habitude : [statisticsItems] affiche déjà le sien.
 */
internal fun LazyListScope.weekItems(
    habits: List<HabitCardState>,
    outlook: WeekOutlook,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
) {
    val byId = habits.associateBy { it.stored.id }
    val labels = mapOf(
        WeekStage.TODO to R.string.week_stage_todo,
        WeekStage.WELL_UNDERWAY to R.string.week_stage_well_underway,
        WeekStage.MINIMUM to R.string.week_stage_minimum,
        WeekStage.DONE to R.string.week_stage_done,
    )
    if (habits.isNotEmpty() && outlook.byStage.values.all(List<WeekEntry>::isEmpty)) {
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
            item(key = "stage-$stage") { SectionHeader(stringResource(labels.getValue(stage))) }
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

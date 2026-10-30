package ch.nicolab.cadence.bilan

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.AlcoholStatisticsSheet
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.WeekOutlook
import ch.nicolab.cadence.ui.ScreenList
import java.time.LocalDate

/**
 * Bilan : ce qu'il reste à faire cette semaine, puis les statistiques de chaque habitude.
 * Un seul défilement : les fiches détaillées restent des feuilles par-dessus, ouvertes
 * depuis les deux sections.
 */
@Composable
internal fun BilanScreen(
    habits: List<HabitCardState>,
    quick: (HabitCardState) -> Unit,
    options: (HabitCardState) -> Unit,
    onCorrect: (HabitEntry) -> Unit,
) {
    val byId = habits.associateBy { it.stored.id }
    val outlook = remember(habits) {
        WeekOutlook.of(
            habits = habits.map { it.stored.definition },
            today = LocalDate.now(),
            entries = habits.flatMap(HabitCardState::recentEntries),
            pausesOf = { id -> byId[id]?.pauses?.map(IdentifiedPause::pause).orEmpty() },
        )
    }
    var detailId by rememberSaveable { mutableStateOf<String?>(null) }
    var alcoholDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    var abstinenceDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    val openStatistics: (HabitCardState) -> Unit = { item ->
        when {
            item.stored.abstinenceProfile == AbstinenceProfile.ALCOHOL -> alcoholDetailId = item.stored.id
            item.stored.goal.isAbstinence -> abstinenceDetailId = item.stored.id
            else -> detailId = item.stored.id
        }
    }

    ScreenList(header = {
        ScreenHeader(title = stringResource(R.string.bilan_title), subtitle = stringResource(R.string.bilan_subtitle))
    }) {
        weekItems(habits, outlook, quick, options)
        statisticsItems(habits, openStatistics)
    }

    val visible = habits.filterNot { it.stored.archived }
    val archived = habits.filter { it.stored.archived }
    val abstinences = visible.filter { it.stored.goal.isAbstinence }
    (visible.filterNot { it.stored.goal.isAbstinence } + archived.filterNot { it.stored.goal.isAbstinence })
        .firstOrNull { it.stored.id == detailId }
        ?.let { item -> HabitStatisticsDetailSheet(item, onCorrect) { detailId = null } }
    (abstinences + archived).firstOrNull { it.stored.id == alcoholDetailId }?.let { item ->
        AlcoholStatisticsSheet(item) { alcoholDetailId = null }
    }
    (abstinences + archived).firstOrNull { it.stored.id == abstinenceDetailId }?.let { item ->
        AbstinenceStatisticsSheet(item, { abstinenceDetailId = null }, onCorrect = onCorrect) {
            abstinenceDetailId = null
            quick(item)
        }
    }
}

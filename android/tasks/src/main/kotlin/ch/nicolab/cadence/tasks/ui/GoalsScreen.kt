package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.TabPill
import ch.nicolab.cadence.designsystem.components.TabPills
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalHorizon
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.GoalOverview
import ch.nicolab.cadence.tasks.model.GoalProgress
import ch.nicolab.cadence.tasks.model.Goals
import ch.nicolab.cadence.tasks.model.ObjectiveCard
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

private const val STOP_TIMEOUT_MS = 5_000L

/** Objectifs, résultats clés et liste d'envies : calculés sur ce qui est déjà synchronisé, en lecture seule. */
internal class GoalsViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)

    val overview: StateFlow<GoalOverview?> =
        combine(repository.observeGoals(), repository.observeAllTasks(), repository.observeProjects()) { goals, tasks, projects ->
            Goals.overview(goals, tasks, projects)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)
}

private enum class GoalsTab(@StringRes val label: Int) {
    OBJECTIVES(R.string.goals_tab_objectives),
    WISHES(R.string.goals_tab_wishes),
}

/**
 * Écran Objectifs, ouvert depuis le Bilan : un onglet pour les objectifs (résultats clés dessous, avec leur
 * avancement) et un pour la liste d'envies (Avoir, Être, Faire). Ni Aujourd'hui ni les widgets n'en montrent rien.
 */
@Composable
fun GoalsScreen(onBack: () -> Unit) {
    val viewModel: GoalsViewModel = viewModel()
    val overview by viewModel.overview.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val palette = cadence
    BackHandler(onBack = onBack)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.goals_title),
                    onBack = onBack,
                    backDescription = stringResource(R.string.goals_back),
                )
            }
            TabPills(
                tabs = GoalsTab.entries.map { TabPill(stringResource(it.label)) },
                selected = tab,
                onSelect = { tab = it },
            )
            val current = overview
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = PaddingValues(start = Space.gutter, end = Space.gutter, top = Space.md, bottom = Space.xxxl),
                verticalArrangement = Arrangement.spacedBy(Space.sm),
            ) {
                if (current != null) {
                    if (GoalsTab.entries[tab] == GoalsTab.OBJECTIVES) objectives(current) else wishes(current)
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.objectives(overview: GoalOverview) {
    if (overview.objectives.isEmpty()) {
        item(key = "empty") { EmptyLine(R.string.goals_empty) }
        return
    }
    items(overview.objectives, key = { it.goal.uid }) { ObjectivePanel(it) }
}

private fun androidx.compose.foundation.lazy.LazyListScope.wishes(overview: GoalOverview) {
    if (overview.wishes.values.all { it.isEmpty() }) {
        item(key = "empty") { EmptyLine(R.string.goals_wishes_empty) }
        return
    }
    GoalBucket.entries.forEach { bucket ->
        val wishes = overview.wishes.getValue(bucket)
        if (wishes.isEmpty()) return@forEach
        item(key = "header-${bucket.wire}") { SectionHeader(title = stringResource(bucketLabel(bucket)), count = wishes.size) }
        items(wishes, key = { "wish-${it.uid}" }) { wish ->
            Panel {
                Text(wish.title, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                wish.why?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun EmptyLine(@StringRes message: Int) {
    Text(
        stringResource(message),
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onSurfaceVariant,
        modifier = Modifier.padding(vertical = Space.lg),
    )
}

@Composable
private fun ObjectivePanel(card: ObjectiveCard) {
    val palette = cadence
    Panel {
        Text(card.goal.title, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, maxLines = 3, overflow = TextOverflow.Ellipsis)
        goalMeta(card.goal)?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
        }
        Spacer(Modifier.height(Space.sm))
        ProgressLine(card.progress, goalColor(card.goal))
        if (card.keyResults.isNotEmpty()) {
            Spacer(Modifier.height(Space.md))
            Text(stringResource(R.string.goals_key_results), style = MaterialTheme.typography.labelMedium, color = palette.outline)
            card.keyResults.forEach { result ->
                Spacer(Modifier.height(Space.sm))
                Text(result.goal.title, style = MaterialTheme.typography.bodyMedium, color = palette.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                ProgressLine(result.progress, goalColor(result.goal))
            }
        }
    }
}

/** « N sur M faits » et une barre fine ; « Rien de lié » tant qu'aucune tâche ni aucun projet ne pointe vers le but. */
@Composable
private fun ProgressLine(progress: GoalProgress, color: Color) {
    val palette = cadence
    val text = if (progress.total == 0) {
        stringResource(R.string.goals_nothing_linked)
    } else {
        stringResource(R.string.goals_progress, progress.done, progress.total)
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
    Spacer(Modifier.height(Space.xs))
    Box(
        Modifier
            .fillMaxWidth()
            .height(Size.counterTrack)
            .clip(Radius.Pill)
            .background(palette.containerHigh)
            .semantics { contentDescription = text },
    ) {
        Box(Modifier.fillMaxWidth(progress.fraction).height(Size.counterTrack).clip(Radius.Pill).background(color))
    }
}

@Composable
private fun goalColor(goal: GoalItem): Color = projectRailColor(goal.color)?.let(::Color) ?: cadence.primary

/** Horizon, échéance et état hors « actif », sur une ligne neutre. */
@Composable
private fun goalMeta(goal: GoalItem): String? {
    val parts = buildList {
        add(stringResource(horizonLabel(goal.horizon)))
        goal.targetDate?.let { add(stringResource(R.string.goals_target, it.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.FRENCH)))) }
        statusLabel(goal.status)?.let { add(stringResource(it)) }
    }
    return parts.joinToString(" · ")
}

@StringRes
internal fun horizonLabel(horizon: GoalHorizon): Int = when (horizon) {
    GoalHorizon.MONTH -> R.string.goals_horizon_month
    GoalHorizon.QUARTER -> R.string.goals_horizon_quarter
    GoalHorizon.SEASON -> R.string.goals_horizon_season
    GoalHorizon.YEAR -> R.string.goals_horizon_year
}

@StringRes
private fun statusLabel(status: String?): Int? = when (status) {
    "achieved" -> R.string.goals_status_achieved
    "paused" -> R.string.goals_status_paused
    "dropped" -> R.string.goals_status_dropped
    else -> null
}

@StringRes
internal fun bucketLabel(bucket: GoalBucket): Int = when (bucket) {
    GoalBucket.HAVE -> R.string.goals_bucket_have
    GoalBucket.BE -> R.string.goals_bucket_be
    GoalBucket.DO -> R.string.goals_bucket_do
}

/** Entrée du Bilan vers les objectifs, seulement avec un serveur (ils n'existent que par la synchro). */
@Composable
fun GoalsEntryPanel(onOpen: () -> Unit) {
    val context = LocalContext.current
    val connection = androidx.compose.runtime.remember(context) { TasksGraph.connection(context) }
    val info by connection.observe().collectAsStateWithLifecycle(initialValue = null)
    if (info == null) return
    val palette = cadence
    Panel(onClick = onOpen) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.goals_entry_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(stringResource(R.string.goals_entry_detail), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant)
        }
    }
}

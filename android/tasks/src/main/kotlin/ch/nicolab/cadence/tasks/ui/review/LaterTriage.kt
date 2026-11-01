package ch.nicolab.cadence.tasks.ui.review

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.TriageProgress
import ch.nicolab.cadence.tasks.review.ReviewBacklog
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.review.ReviewTask
import ch.nicolab.cadence.tasks.ui.LinkPreviewCard
import ch.nicolab.cadence.tasks.ui.LinkSummary
import ch.nicolab.cadence.tasks.ui.QuickPill

private const val NOTE_LINES = 6

/**
 * « Trier un par un » sur « Plus tard » : une tâche à la fois, en grand, les mêmes choix que la liste et
 * « Passer ». L'ordre est celui de la liste groupée ; une tâche décidée en sort, une tâche passée repart au
 * bout (gardé entre deux sessions), donc la reprise se fait là où on s'était arrêté. « Annuler » reste dans la bannière.
 */
@Composable
internal fun LaterTriageScreen(
    items: List<ReviewTask>,
    rows: RowContext,
    order: List<ReviewTask>,
    viewModel: ReviewViewModel,
    previews: LinkPreviews,
    choices: ReviewChoices,
    onOpenTask: (String) -> Unit,
    onClose: () -> Unit,
) {
    val palette = cadence
    val skipped by viewModel.skipped.collectAsState()
    val byUid = remember(items) { items.associateBy { it.uid } }
    val queue = remember(order, skipped) { ReviewBacklog.queue(order.map { it.uid }, skipped).mapNotNull(byUid::get) }
    var startTotal by rememberSaveable { mutableIntStateOf(queue.size) }
    val progress = TriageProgress(maxOf(startTotal, queue.size), queue.size)
    LaunchedEffect(items) { if (items.isNotEmpty()) viewModel.pruneSkipped(items.map { it.uid }.toSet()) }
    BackHandler(onBack = onClose)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.review_triage_title),
                    subtitle = if (queue.isEmpty()) null else stringResource(R.string.review_triage_position, progress.position, progress.total),
                    onBack = onClose,
                    backDescription = stringResource(R.string.review_triage_close),
                )
            }
            val current = queue.firstOrNull()
            AnimatedContent(
                targetState = current?.uid,
                modifier = Modifier.weight(1f),
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "laterTriage",
            ) { uid ->
                val item = uid?.let(byUid::get)
                if (item == null) {
                    Done(onClose)
                } else {
                    TriageCard(item, rows, previews, choices, canSkip = queue.size > 1, onSkip = { viewModel.skip(item.uid) }, onOpen = { onOpenTask(item.uid) })
                }
            }
        }
    }
}

@Composable
private fun TriageCard(
    item: ReviewTask,
    rows: RowContext,
    previews: LinkPreviews,
    choices: ReviewChoices,
    canSkip: Boolean,
    onSkip: () -> Unit,
    onOpen: () -> Unit,
) {
    val palette = cadence
    val link = remember(item, rows) { rows.link(item) }
    val task = rows.local[item.uid]
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(Radius.Card).background(palette.card).padding(Space.lg),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                listOfNotNull(item.projectName, *rows.tags(item).map { "#$it" }.toTypedArray()).takeIf { it.isNotEmpty() }?.let {
                    Text(it.joinToString("  ·  "), style = MaterialTheme.typography.labelMedium, color = rows.rail(item) ?: palette.onSurfaceVariant)
                }
                if (link == null || link.showsText) {
                    Text(item.name, style = MaterialTheme.typography.titleLarge, color = palette.onSurface)
                }
                link?.let { shown ->
                    when {
                        shown.saved != null -> LinkSummary(shown.saved, descriptionLines = NOTE_LINES)
                        shown.url != null -> LinkPreviewCard(shown.url!!, previews)
                    }
                }
                task?.note?.takeIf { it.isNotBlank() && it.trim() != link?.text }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant, maxLines = NOTE_LINES)
                }
                taskMeta(item, ReviewStep.LATER).takeIf { it.isNotEmpty() }?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = palette.outline)
                }
                TextButton(onClick = onOpen) { Text(stringResource(R.string.review_action_open)) }
            }
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            ChoicePills(choices.later(item).filterNot { it.label == stringResource(R.string.review_action_open) }, enabled = true, tall = true)
            if (canSkip) {
                TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text(stringResource(R.string.review_triage_skip))
                }
            }
        }
    }
}

@Composable
private fun Done(onClose: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(Space.gutter),
        verticalArrangement = Arrangement.spacedBy(Space.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.review_triage_done), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.review_triage_done_hint), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        QuickPill(stringResource(R.string.review_triage_close), onClose)
    }
}

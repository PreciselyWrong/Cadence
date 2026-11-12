package ch.nicolab.cadence.tasks.ui.review

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.review.QuickEntry
import ch.nicolab.cadence.tasks.review.ReviewBacklog
import ch.nicolab.cadence.tasks.review.ReviewStep
import ch.nicolab.cadence.tasks.ui.LinkPreviewCard
import ch.nicolab.cadence.tasks.ui.LinkSummary
import ch.nicolab.cadence.tasks.ui.QuickPill
import ch.nicolab.cadence.tasks.ui.formatReviewDay
import java.time.ZoneId

private const val NOTE_LINES = 4

private object LoadingTarget

private object DoneTarget

/** Entrée de la revue rapide, au-dessus des onglets : une phrase et « Commencer ». */
@Composable
internal fun QuickReviewCard(modifier: Modifier = Modifier, onStart: () -> Unit) {
    val palette = cadence
    Panel(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(stringResource(R.string.review_quick_title), style = MaterialTheme.typography.titleSmall, color = palette.onSurface)
                Text(stringResource(R.string.review_quick_pitch), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
            }
            PrimaryAction(stringResource(R.string.review_quick_start), onClick = onStart)
        }
    }
}

/**
 * Revue rapide, comme sur le web : une chose à la fois, une décision, la suivante. La progression est
 * celle de la session (« 3 sur 10 »), jamais la taille du stock. Une décision prise ici, dans une liste
 * ou sur un autre appareil fait passer à la suivante ; « Annuler » reste dans la bannière.
 */
@Composable
internal fun QuickReviewScreen(
    state: QuickState,
    rows: RowContext,
    viewModel: ReviewViewModel,
    previews: LinkPreviews,
    choices: ReviewChoices,
    onOpenTask: (String) -> Unit,
) {
    val palette = cadence
    val view = state.view
    BackHandler(onBack = viewModel::stopQuick)

    Surface(Modifier.fillMaxSize(), color = palette.background, contentColor = palette.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Box(Modifier.padding(horizontal = Space.gutter)) {
                ScreenHeader(
                    title = stringResource(R.string.review_quick_title),
                    subtitle = if (state.loading || view.current == null) null else stringResource(R.string.review_triage_position, view.position, view.total),
                    onBack = viewModel::stopQuick,
                    backDescription = stringResource(R.string.review_quick_stop),
                )
            }
            if (!state.loading && view.current != null) {
                val progress by animateFloatAsState((view.position - 1).toFloat() / view.total.coerceAtLeast(1), label = "quickProgress")
                Box(
                    Modifier.padding(horizontal = Space.gutter).fillMaxWidth().height(4.dp).clip(Radius.Control)
                        .background(palette.outline.copy(alpha = 0.2f)),
                ) {
                    Box(Modifier.fillMaxWidth(progress).height(4.dp).background(palette.primary.copy(alpha = 0.7f)))
                }
            }
            // L'entrée sortante garde son contenu pendant le fondu : la cible porte l'entrée elle-même.
            val target: Any = if (state.loading) LoadingTarget else view.current ?: DoneTarget
            AnimatedContent(
                targetState = target,
                modifier = Modifier.weight(1f),
                transitionSpec = { fadeIn() togetherWith fadeOut() },
                label = "quickReview",
            ) { shown ->
                when (shown) {
                    is QuickEntry -> QuickCard(shown, rows, previews, choices, onSkip = viewModel::skipQuick, onOpenTask = onOpenTask)
                    LoadingTarget -> Message(stringResource(R.string.review_quick_loading), null)
                    else -> Finished(total = view.total, onAgain = viewModel::againQuick, onClose = viewModel::stopQuick)
                }
            }
        }
    }
}

@Composable
private fun QuickCard(
    entry: QuickEntry,
    rows: RowContext,
    previews: LinkPreviews,
    choices: ReviewChoices,
    onSkip: () -> Unit,
    onOpenTask: (String) -> Unit,
) {
    val palette = cadence
    val open = stringResource(R.string.review_action_open)
    val entryChoices = when (entry) {
        is QuickEntry.Inbox -> choices.inbox(entry.item)
        is QuickEntry.Project -> choices.project(entry.item)
        is QuickEntry.Task -> if (entry.step == ReviewStep.LATER) choices.quickLater(entry.item) else choices.task(entry.item, entry.step)
    }.filterNot { it.label == open }
    val kind = when (entry) {
        is QuickEntry.Inbox -> stepLabel(ReviewStep.UNDECIDED)
        is QuickEntry.Project -> stepLabel(ReviewStep.PROJECTS)
        is QuickEntry.Task -> stepLabel(entry.step)
    }
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(Radius.Card).background(palette.card).padding(Space.lg),
                verticalArrangement = Arrangement.spacedBy(Space.md),
            ) {
                Text(stringResource(kind), style = MaterialTheme.typography.labelMedium, color = palette.outline)
                when (entry) {
                    is QuickEntry.Inbox -> {
                        val item = entry.item
                        val link = remember(item, rows) {
                            LinkExtractor.urls(item.text, 1).firstOrNull()?.let {
                                RowLink(item.text, ReviewBacklog.linkFor(rows.links, item.text))
                            }
                        }
                        Body(item.text, link, previews)
                        item.createdAt?.let {
                            Meta(stringResource(R.string.review_captured_on, formatReviewDay(it.atZone(ZoneId.systemDefault()).toLocalDate())))
                        }
                    }
                    is QuickEntry.Project -> {
                        Text(entry.item.name, style = MaterialTheme.typography.titleLarge, color = palette.onSurface)
                        Meta(entry.item.reasons.map { stringResource(reasonLabel(it)) }.joinToString(" · "))
                    }
                    is QuickEntry.Task -> {
                        val item = entry.item
                        val link = remember(item, rows) { rows.link(item) }
                        listOfNotNull(item.projectName, *rows.tags(item).map { "#$it" }.toTypedArray()).takeIf { it.isNotEmpty() }?.let {
                            Text(it.joinToString("  ·  "), style = MaterialTheme.typography.labelMedium, color = rows.rail(item) ?: palette.onSurfaceVariant)
                        }
                        Body(item.name, link, previews)
                        rows.local[item.uid]?.note?.takeIf { it.isNotBlank() && it.trim() != link?.text }?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant, maxLines = NOTE_LINES)
                        }
                        taskMeta(item, entry.step).takeIf { it.isNotEmpty() }?.let { Meta(it) }
                        TextButton(onClick = { onOpenTask(item.uid) }) { Text(open) }
                    }
                }
            }
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            ChoicePills(entryChoices, enabled = true, tall = true)
            TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text(stringResource(R.string.review_triage_skip))
            }
        }
    }
}

@Composable
private fun Body(text: String, link: RowLink?, previews: LinkPreviews) {
    if (link == null || link.showsText) {
        Text(text, style = MaterialTheme.typography.titleLarge, color = cadence.onSurface)
    }
    link?.let { shown ->
        when {
            shown.saved != null -> LinkSummary(shown.saved, descriptionLines = NOTE_LINES)
            shown.url != null -> LinkPreviewCard(shown.url!!, previews)
        }
    }
}

@Composable
private fun Meta(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium, color = cadence.outline)
}

@Composable
private fun Finished(total: Int, onAgain: () -> Unit, onClose: () -> Unit) {
    if (total == 0) {
        Message(stringResource(R.string.review_quick_nothing), null) {
            QuickPill(stringResource(R.string.review_quick_back), onClose)
        }
        return
    }
    Message(stringResource(R.string.review_quick_done), stringResource(R.string.review_quick_saved)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
            QuickPill(stringResource(R.string.review_quick_again), onAgain, quiet = true)
            QuickPill(stringResource(R.string.review_quick_back), onClose)
        }
    }
}

@Composable
private fun Message(title: String, hint: String?, action: (@Composable () -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(Space.gutter),
        verticalArrangement = Arrangement.spacedBy(Space.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        hint?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        action?.invoke()
    }
}

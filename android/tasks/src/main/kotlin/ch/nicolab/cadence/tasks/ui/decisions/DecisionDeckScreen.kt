package ch.nicolab.cadence.tasks.ui.decisions

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.EmptyState
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.decisions.DecisionCardData
import ch.nicolab.cadence.tasks.decisions.DecisionChoice
import ch.nicolab.cadence.tasks.decisions.DecisionDeck
import ch.nicolab.cadence.tasks.decisions.DecisionRequests
import ch.nicolab.cadence.tasks.triage.DeckProgress
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

/**
 * Paquet « Décider » (`docs/49-agent-decisions.md`) : cartes de décision des agents en plein écran, une à la fois.
 * Les choix sont proposés en une rangée, le conseil de l'agent encadré et teinté ; glisser à droite le suit,
 * à gauche remet à plus tard. Chaque décision part après la fenêtre d'annulation (« Annuler » la rattrape).
 */
@Composable
internal fun DecisionDeckScreen(
    cards: List<DecisionCardData>,
    undoable: Boolean,
    onDecide: (DecisionCardData, String, String?) -> Unit,
    onSkip: (DecisionCardData) -> Unit,
    onUndo: () -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(onBack = onClose)
    val current = cards.firstOrNull()
    var total by remember { mutableIntStateOf(0) }
    LaunchedEffect(cards.size) { total = maxOf(total, cards.size) }
    Surface(Modifier.fillMaxSize(), color = cadence.background, contentColor = cadence.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            ScreenHeader(
                title = current?.kindLabel ?: stringResource(R.string.decisions_deck_title),
                subtitle = cards.size.takeIf { it > 0 }?.let { stringResource(R.string.triage_left, it) },
                onBack = onClose,
                backDescription = stringResource(R.string.triage_deck_close),
            )
            if (current != null) DecisionProgressBar(DecisionDeck.progress(cards.size, total))
            AnimatedContent(
                targetState = current,
                contentKey = { it?.uid },
                transitionSpec = {
                    (fadeIn(tween(ENTER_MS)) + slideInVertically(tween(ENTER_MS)) { it / 16 }) togetherWith fadeOut(tween(LEAVE_MS))
                },
                label = "decision-deck",
                modifier = Modifier.weight(1f),
            ) { card ->
                if (card == null) {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
                        EmptyState(
                            icon = Icons.Outlined.DoneAll,
                            title = stringResource(R.string.decisions_deck_done),
                            message = stringResource(R.string.decisions_deck_done_message),
                        )
                        PrimaryAction(
                            stringResource(R.string.decisions_deck_back),
                            Modifier.fillMaxWidth().padding(horizontal = Space.gutter),
                            onClick = onClose,
                        )
                    }
                } else {
                    DecisionDeckCard(
                        card = card,
                        undoable = undoable,
                        onDecide = { decision, note -> onDecide(card, decision, note) },
                        onSkip = { onSkip(card) },
                        onUndo = onUndo,
                    )
                }
            }
        }
    }
}

@Composable
private fun DecisionProgressBar(progress: DeckProgress) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Space.gutter, vertical = Space.xs),
        verticalArrangement = Arrangement.spacedBy(Space.xs),
    ) {
        Text(
            stringResource(R.string.triage_deck_progress, progress.done, progress.total),
            style = MaterialTheme.typography.labelMedium,
            color = cadence.onSurfaceVariant,
        )
        LinearProgressIndicator(
            progress = { progress.fraction },
            modifier = Modifier.fillMaxWidth().height(3.dp),
            color = cadence.primary,
            trackColor = cadence.containerHighest,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DecisionDeckCard(
    card: DecisionCardData,
    undoable: Boolean,
    onDecide: (String, String?) -> Unit,
    onSkip: () -> Unit,
    onUndo: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val drag = remember(card.uid) { Animatable(0f) }
    var writing by rememberSaveable(card.uid) { mutableStateOf(false) }
    var word by rememberSaveable(card.uid) { mutableStateOf("") }
    val recommended = DecisionDeck.recommendedChoice(card)
    val laterLabel = stringResource(R.string.triage_mail_later)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        Panel(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(drag.value.roundToInt(), 0) }
                .graphicsLayer {
                    rotationZ = drag.value / ROTATION_DIVIDER
                    alpha = 1f - (abs(drag.value) / (size.width * 1.5f)).coerceIn(0f, 0.6f)
                }
                .pointerInput(card.uid, recommended?.id) {
                    val threshold = size.width * SWIPE_FRACTION
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                val value = drag.value
                                when {
                                    recommended != null && value > threshold -> {
                                        drag.animateTo(size.width * 1.2f, tween(LEAVE_MS))
                                        onDecide(recommended.id, null)
                                    }
                                    value < -threshold -> {
                                        drag.animateTo(-size.width * 1.2f, tween(LEAVE_MS))
                                        onDecide(DecisionRequests.DECISION_LATER, null)
                                    }
                                    else -> drag.animateTo(0f)
                                }
                            }
                        },
                        onDragCancel = { scope.launch { drag.animateTo(0f) } },
                    ) { change, amount ->
                        change.consume()
                        scope.launch { drag.snapTo(drag.value + amount) }
                    }
                }
                .semantics {
                    customActions = buildList {
                        recommended?.let { rec ->
                            add(CustomAccessibilityAction(rec.label) { onDecide(rec.id, null); true })
                        }
                        add(CustomAccessibilityAction(laterLabel) { onDecide(DecisionRequests.DECISION_LATER, null); true })
                    }
                },
        ) {
            DecisionBody(card = card, onOpenUrl = { url -> uriHandler.openUri(url) })
        }

        ChoiceRow(
            choices = card.choices,
            recommendedId = recommended?.id,
            onChoose = { choice -> onDecide(choice.id, null) },
        )

        card.reason?.let { reason ->
            Text(
                reason,
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
        }

        if (writing) {
            DecisionWordField(
                text = word,
                onText = { word = it.take(DecisionDeck.NOTE_MAX_LENGTH) },
                onSend = {
                    DecisionDeck.noteText(word)?.let { note ->
                        onDecide(DecisionRequests.DECISION_NOTE, note)
                    }
                },
            )
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            SecondaryAction(stringResource(R.string.triage_deck_word)) { writing = !writing }
            SecondaryAction(laterLabel) { onDecide(DecisionRequests.DECISION_LATER, null) }
            TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
            SecondaryAction(stringResource(R.string.triage_deck_undo), enabled = undoable, onClick = onUndo)
        }

        Text(
            stringResource(if (recommended != null) R.string.decisions_swipe_hint else R.string.decisions_swipe_hint_no_rec),
            style = MaterialTheme.typography.bodySmall,
            color = cadence.onSurfaceVariant,
        )
    }
}

@Composable
private fun DecisionBody(card: DecisionCardData, onOpenUrl: (String) -> Unit) {
    var expanded by rememberSaveable(card.uid) { mutableStateOf(false) }
    var canExpand by remember(card.uid) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        Text(
            card.kindLabel,
            style = MaterialTheme.typography.labelMedium,
            color = cadence.onSurfaceVariant,
        )
        Text(
            card.title,
            style = MaterialTheme.typography.titleLarge,
            color = cadence.onSurface,
        )
        card.context?.let { context ->
            Text(
                context,
                style = MaterialTheme.typography.bodyLarge,
                color = cadence.onSurface,
            )
        }
        card.body?.let { body ->
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
                maxLines = if (expanded) Int.MAX_VALUE else DecisionDeck.BODY_FOLD_LINES,
                overflow = TextOverflow.Ellipsis,
                onTextLayout = { if (it.hasVisualOverflow) canExpand = true },
            )
            if (canExpand || expanded) {
                TertiaryAction(stringResource(if (expanded) R.string.decisions_read_less else R.string.decisions_read_more)) {
                    expanded = !expanded
                }
            }
        }
        card.url?.let { url ->
            TertiaryAction(stringResource(R.string.decisions_open)) { onOpenUrl(url) }
        }
    }
}

@Composable
private fun ChoiceRow(
    choices: List<DecisionChoice>,
    recommendedId: String?,
    onChoose: (DecisionChoice) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        choices.forEach { choice ->
            ChoiceButton(
                choice = choice,
                recommended = choice.id == recommendedId,
                modifier = Modifier.weight(1f),
                onClick = { onChoose(choice) },
            )
        }
    }
}

@Composable
private fun ChoiceButton(
    choice: DecisionChoice,
    recommended: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(CHOICE_RADIUS_DP.dp)
    val background = when {
        choice.isDanger -> cadence.errorContainer
        recommended -> cadence.primaryContainer
        else -> cadence.containerLow
    }
    val tint = when {
        choice.isDanger -> cadence.onErrorContainer
        recommended -> cadence.onPrimaryContainer
        else -> cadence.onSurface
    }
    val borderColor = when {
        choice.isDanger -> cadence.error
        recommended -> cadence.primary
        else -> cadence.outlineVariant
    }
    val borderWidth = if (recommended) 2.dp else 1.dp
    val recommendedText = stringResource(R.string.triage_deck_recommended)
    Box(
        modifier
            .heightIn(min = CHOICE_MIN_HEIGHT_DP.dp)
            .clip(shape)
            .background(background)
            .border(borderWidth, borderColor, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.xs, vertical = Space.sm)
            .semantics { if (recommended) stateDescription = recommendedText },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            choice.label,
            style = MaterialTheme.typography.labelLarge,
            color = tint,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun DecisionWordField(text: String, onText: (String) -> Unit, onSend: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        CadenceField(
            value = text,
            onValue = onText,
            label = stringResource(R.string.decisions_word_hint),
            modifier = Modifier.fillMaxWidth(),
        )
        PrimaryAction(
            stringResource(R.string.triage_deck_word_send),
            Modifier.fillMaxWidth(),
            enabled = DecisionDeck.noteText(text) != null,
            onClick = onSend,
        )
    }
}

private const val SWIPE_FRACTION = 0.28f
private const val ROTATION_DIVIDER = 48f
private const val ENTER_MS = 220
private const val LEAVE_MS = 140
private const val CHOICE_RADIUS_DP = 14
private const val CHOICE_MIN_HEIGHT_DP = 64

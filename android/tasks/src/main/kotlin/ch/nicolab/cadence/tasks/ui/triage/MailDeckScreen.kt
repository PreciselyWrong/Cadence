package ch.nicolab.cadence.tasks.ui.triage

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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
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
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.plugins.PluginPageActivity
import ch.nicolab.cadence.tasks.plugins.rememberPluginMenu
import ch.nicolab.cadence.tasks.triage.DeckProgress
import ch.nicolab.cadence.tasks.triage.MailAdvice
import ch.nicolab.cadence.tasks.triage.MailCardData
import ch.nicolab.cadence.tasks.triage.MailDecision
import ch.nicolab.cadence.tasks.triage.MailDeck
import ch.nicolab.cadence.tasks.triage.MailEventData
import ch.nicolab.cadence.tasks.triage.MailOption
import ch.nicolab.cadence.tasks.triage.TriageItemDto
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/**
 * « Trier mes mails » (`docs/43-mail-triage.md`) : les cartes Mail de « À trier » en plein écran, une à la fois. Une carte
 * à options montre ses actions en une rangée, la recommandée en surbrillance ; glisser à droite la suit, à gauche remet à
 * plus tard. Chaque décision part après la fenêtre d'annulation (« Annuler » la rattrape).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun MailDeckScreen(
    items: List<TriageItemDto>,
    archiveAvailable: Boolean,
    today: LocalDate,
    undoable: Boolean,
    onDecide: (TriageItemDto, MailDecision, JsonObject, Boolean) -> Unit,
    onSkip: (TriageItemDto) -> Unit,
    onUndo: () -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(onBack = onClose)
    val cards = MailDeck.cards(items)
    val current = cards.firstOrNull()
    // Le total est celui de l'ouverture : chaque carte décidée fait avancer « 4 / 17 ».
    var total by remember { mutableIntStateOf(0) }
    LaunchedEffect(cards.size) { total = maxOf(total, cards.size) }
    Surface(Modifier.fillMaxSize(), color = cadence.background, contentColor = cadence.onSurface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            ScreenHeader(
                title = stringResource(R.string.triage_deck_title),
                subtitle = cards.size.takeIf { it > 0 }?.let { stringResource(R.string.triage_left, it) },
                onBack = onClose,
                backDescription = stringResource(R.string.triage_deck_close),
            )
            if (current != null) DeckProgressBar(MailDeck.progress(cards.size, total))
            AnimatedContent(
                targetState = current,
                contentKey = { it?.first?.key },
                transitionSpec = {
                    (fadeIn(tween(ENTER_MS)) + slideInVertically(tween(ENTER_MS)) { it / 16 }) togetherWith fadeOut(tween(LEAVE_MS))
                },
                label = "mail-deck",
                modifier = Modifier.weight(1f),
            ) { pair ->
                if (pair == null) {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
                        EmptyState(
                            icon = Icons.Outlined.DoneAll,
                            title = stringResource(R.string.triage_deck_done),
                            message = stringResource(R.string.triage_deck_done_message),
                        )
                        PrimaryAction(
                            stringResource(R.string.triage_deck_back),
                            Modifier.fillMaxWidth().padding(horizontal = Space.gutter),
                            onClick = onClose,
                        )
                    }
                } else {
                    val (item, card) = pair
                    DeckCard(
                        card = card,
                        archiveAvailable = archiveAvailable,
                        today = today,
                        undoable = undoable,
                        onDecide = { decision, payload, archive -> onDecide(item, decision, payload, archive) },
                        onSkip = { onSkip(item) },
                        onUndo = onUndo,
                    )
                }
            }
        }
    }
}

@Composable
private fun DeckProgressBar(progress: DeckProgress) {
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
private fun DeckCard(
    card: MailCardData,
    archiveAvailable: Boolean,
    today: LocalDate,
    undoable: Boolean,
    onDecide: (MailDecision, JsonObject, Boolean) -> Unit,
    onSkip: () -> Unit,
    onUndo: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val menu = rememberPluginMenu(Unit)
    val chat = menu.items.firstOrNull { it.id == MailDeck.CHAT_PLUGIN }
    val scope = rememberCoroutineScope()
    val drag = remember(card.mailUid) { Animatable(0f) }
    var archive by remember(card.mailUid) { mutableStateOf(false) }
    var editingTask by remember(card.mailUid) { mutableStateOf(false) }
    var writing by rememberSaveable(card.mailUid) { mutableStateOf(false) }
    var word by rememberSaveable(card.mailUid) { mutableStateOf("") }
    val advice = MailDeck.recommendation(card)
    val empty = JsonObject(emptyMap())
    val hasOptions = card.options.isNotEmpty()
    // Remettre à plus tard garde le mail dans la boîte de réception.
    val decide = { decision: MailDecision, payload: JsonObject -> onDecide(decision, payload, archive) }
    val openMail = { card.gmailUrl?.let(uriHandler::openUri) }
    val accept = {
        if (advice.opensMail) openMail()
        decide(advice.decision, advice.payload)
    }
    val chooseOption = { option: MailOption ->
        val optionAdvice = MailDeck.adviceFor(option, card)
        if (optionAdvice.opensMail) openMail()
        decide(optionAdvice.decision, optionAdvice.payload)
    }
    val adviceLabel = adviceLabel(advice, card)
    val laterLabel = stringResource(R.string.triage_mail_later)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Space.gutter, vertical = Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.md),
    ) {
        card.actionError?.let { ActionErrorBanner(it) }
        Panel(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(drag.value.roundToInt(), 0) }
                .graphicsLayer {
                    rotationZ = drag.value / ROTATION_DIVIDER
                    alpha = 1f - (abs(drag.value) / (size.width * 1.5f)).coerceIn(0f, 0.6f)
                }
                .pointerInput(card.mailUid) {
                    val threshold = size.width * SWIPE_FRACTION
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                val value = drag.value
                                when {
                                    value > threshold -> {
                                        drag.animateTo(size.width * 1.2f, tween(LEAVE_MS))
                                        accept()
                                    }
                                    value < -threshold -> {
                                        drag.animateTo(-size.width * 1.2f, tween(LEAVE_MS))
                                        decide(MailDecision.LATER, empty)
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
                // Le glissement a ses équivalents pour TalkBack.
                .semantics {
                    customActions = listOf(
                        CustomAccessibilityAction(adviceLabel) { accept(); true },
                        CustomAccessibilityAction(laterLabel) { decide(MailDecision.LATER, empty); true },
                    )
                },
        ) {
            MailBody(card)
        }
        if (hasOptions) {
            OptionRow(card, onChoose = chooseOption)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (card.gmailUrl != null) {
                    TertiaryAction(stringResource(R.string.triage_deck_open_gmail)) { openMail() }
                }
                if (MailOption.TASK in card.options) {
                    TertiaryAction(stringResource(R.string.triage_deck_edit_task)) { editingTask = true }
                }
                chat?.let { item ->
                    TertiaryAction(stringResource(R.string.triage_deck_chat)) {
                        context.startActivity(PluginPageActivity.intent(context, item, MailDeck.chatQuery(card.mailUid)))
                    }
                }
            }
            if (writing) {
                WordField(
                    text = word,
                    onText = { word = it.take(MailDeck.NOTE_MAX_LENGTH) },
                    onSend = {
                        MailDeck.noteText(word)?.let { decide(MailDecision.NOTE, MailDeck.notePayload(it)) }
                    },
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                SecondaryAction(stringResource(R.string.triage_deck_word)) { writing = !writing }
                TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
                SecondaryAction(stringResource(R.string.triage_deck_undo), enabled = undoable, onClick = onUndo)
            }
        } else {
            // Carte d'avant le paquet v2 : ses boutons d'avant.
            PrimaryAction(adviceLabel, Modifier.fillMaxWidth(), onClick = accept)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                SecondaryAction(
                    stringResource(if (advice.decision == MailDecision.TASK) R.string.triage_deck_edit_task else R.string.triage_mail_task),
                ) { editingTask = true }
                if (card.gmailUrl != null && advice.decision != MailDecision.REPLY) {
                    SecondaryAction(stringResource(R.string.triage_mail_reply)) {
                        openMail()
                        decide(MailDecision.REPLY, empty)
                    }
                }
                SecondaryAction(laterLabel) { decide(MailDecision.LATER, empty) }
                SecondaryAction(stringResource(R.string.triage_mail_dismiss)) { decide(MailDecision.DISMISS, empty) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (card.gmailUrl != null) {
                    TertiaryAction(stringResource(R.string.triage_deck_open_mail)) { openMail() }
                }
                chat?.let { item ->
                    TertiaryAction(stringResource(R.string.triage_deck_chat)) {
                        context.startActivity(PluginPageActivity.intent(context, item, MailDeck.chatQuery(card.mailUid)))
                    }
                }
                TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
            }
            if (archiveAvailable) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = Size.touch)
                        .toggleable(value = archive, role = Role.Checkbox, onValueChange = { archive = it }),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = archive, onCheckedChange = null)
                    Text(stringResource(R.string.triage_mail_archive), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
                }
            }
        }
        Text(stringResource(R.string.triage_deck_swipe_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
    }
    if (editingTask) {
        MailTaskSheet(
            card = card,
            today = today,
            onDismiss = { editingTask = false },
            onCreate = { payload ->
                editingTask = false
                decide(MailDecision.TASK, payload)
            },
        )
    }
}

/** Texte du mail, tout en texte brut : objet, expéditeur et date, résumé, rendez-vous, extrait et brouillon. */
@Composable
private fun MailBody(card: MailCardData) {
    var expanded by rememberSaveable(card.mailUid) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        listOfNotNull(card.sender, receivedOn(card.receivedAt)).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        }
        Text(
            card.subject ?: stringResource(R.string.triage_mail_no_subject),
            style = MaterialTheme.typography.titleLarge,
            color = cadence.onSurface,
        )
        Text(card.summary, style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface)
        card.event?.takeIf { card.kind == "event" }?.let { event ->
            Text(
                listOfNotNull(event.title, eventWhen(event), event.location).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
            )
        }
        card.excerpt?.let { excerpt ->
            Text(
                excerpt,
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurfaceVariant,
                maxLines = if (expanded) Int.MAX_VALUE else EXCERPT_LINES,
                overflow = TextOverflow.Ellipsis,
            )
            TertiaryAction(stringResource(if (expanded) R.string.triage_deck_fold_mail else R.string.triage_deck_read_mail)) {
                expanded = !expanded
            }
        }
        card.draftBody?.let { body ->
            Spacer(Modifier.height(Space.xs))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(cadence.containerLow, RoundedCornerShape(QUOTE_RADIUS_DP.dp))
                    .padding(Space.md),
                verticalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                Text(stringResource(R.string.triage_deck_draft_label), style = MaterialTheme.typography.labelMedium, color = cadence.onSurfaceVariant)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
            }
        }
        if (card.draftBody == null) {
            card.draftExcerpt?.let { draft ->
                Text(
                    stringResource(R.string.triage_mail_draft, draft),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ActionErrorBanner(error: String) {
    Text(
        stringResource(R.string.triage_deck_action_error, error),
        style = MaterialTheme.typography.bodyMedium,
        color = cadence.onErrorContainer,
        modifier = Modifier
            .fillMaxWidth()
            .background(cadence.errorContainer, RoundedCornerShape(QUOTE_RADIUS_DP.dp))
            .padding(Space.md),
    )
}

/** Une rangée de 2 à 5 grandes actions ; celle que l'agent recommande est encadrée et teintée. */
@Composable
private fun OptionRow(card: MailCardData, onChoose: (MailOption) -> Unit) {
    val recommended = card.recommended ?: card.options.first()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        card.options.forEach { option ->
            OptionButton(
                option = option,
                recommended = option == recommended,
                modifier = Modifier.weight(1f),
                onClick = { onChoose(option) },
            )
        }
    }
}

@Composable
private fun OptionButton(option: MailOption, recommended: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(OPTION_RADIUS_DP.dp)
    val tint = if (recommended) cadence.onPrimaryContainer else cadence.onSurface
    val recommendedText = stringResource(R.string.triage_deck_recommended)
    Column(
        modifier
            .heightIn(min = OPTION_MIN_HEIGHT_DP.dp)
            .clip(shape)
            .background(if (recommended) cadence.primaryContainer else cadence.containerLow)
            .border(if (recommended) 2.dp else 1.dp, if (recommended) cadence.primary else cadence.outlineVariant, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Space.xs, vertical = Space.sm)
            .semantics { if (recommended) stateDescription = recommendedText },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(optionIcon(option), contentDescription = null, tint = tint)
        Spacer(Modifier.height(Space.xs))
        Text(
            stringResource(optionLabel(option)),
            style = MaterialTheme.typography.labelMedium,
            color = tint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun WordField(text: String, onText: (String) -> Unit, onSend: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        CadenceField(
            value = text,
            onValue = onText,
            label = stringResource(R.string.triage_deck_word_hint),
            modifier = Modifier.fillMaxWidth(),
        )
        PrimaryAction(
            stringResource(R.string.triage_deck_word_send),
            Modifier.fillMaxWidth(),
            enabled = MailDeck.noteText(text) != null,
            onClick = onSend,
        )
    }
}

private fun optionIcon(option: MailOption): ImageVector = when (option) {
    MailOption.DRAFT -> Icons.AutoMirrored.Outlined.Send
    MailOption.REPLY -> Icons.AutoMirrored.Outlined.Reply
    MailOption.TASK -> Icons.Outlined.CheckBox
    MailOption.EVENT -> Icons.Outlined.CalendarMonth
    MailOption.LATER -> Icons.Outlined.Schedule
    MailOption.ARCHIVE -> Icons.Outlined.Archive
    MailOption.DISMISS -> Icons.Outlined.Close
}

private fun optionLabel(option: MailOption): Int = when (option) {
    MailOption.DRAFT -> R.string.triage_deck_option_draft
    MailOption.REPLY -> R.string.triage_deck_option_reply
    MailOption.TASK -> R.string.triage_deck_option_task
    MailOption.EVENT -> R.string.triage_deck_option_event
    MailOption.LATER -> R.string.triage_deck_option_later
    MailOption.ARCHIVE -> R.string.triage_deck_option_archive
    MailOption.DISMISS -> R.string.triage_deck_option_dismiss
}

/** Libellé du glissement droit et de son équivalent TalkBack : l'action recommandée, ou l'ancien conseil. */
@Composable
private fun adviceLabel(advice: MailAdvice, card: MailCardData): String {
    if (card.options.isNotEmpty()) return stringResource(optionLabel(card.recommended ?: card.options.first()))
    return when (advice.decision) {
        MailDecision.REPLY -> stringResource(R.string.triage_deck_reply_in_gmail)
        MailDecision.DISMISS -> stringResource(R.string.triage_deck_read_in_gmail)
        MailDecision.EVENT -> stringResource(R.string.triage_deck_add_event, card.event?.let(::eventWhen).orEmpty())
        else -> stringResource(R.string.triage_deck_create_task, card.taskName)
    }
}

private const val ENTER_MS = 200
private const val LEAVE_MS = 160
private const val SWIPE_FRACTION = 0.3f
private const val ROTATION_DIVIDER = 40f
private const val EXCERPT_LINES = 6
private const val QUOTE_RADIUS_DP = 12
private const val OPTION_RADIUS_DP = 16
private const val OPTION_MIN_HEIGHT_DP = 72

private val DAY = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())
private val EVENT_DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault())
private val EVENT_TIME = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.getDefault())

private fun receivedOn(value: String?): String? = value?.let {
    runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(DAY) }.getOrNull()
}

/** Jour (journée entière) ou jour et heure, dans le fuseau du téléphone. */
internal fun eventWhen(event: MailEventData): String = runCatching {
    if (event.allDay) {
        LocalDate.parse(event.start).format(EVENT_DAY)
    } else {
        OffsetDateTime.parse(event.start).atZoneSameInstant(ZoneId.systemDefault()).format(EVENT_TIME)
    }
}.getOrDefault(event.start)

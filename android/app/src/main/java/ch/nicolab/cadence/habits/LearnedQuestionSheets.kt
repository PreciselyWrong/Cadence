package ch.nicolab.cadence.habits

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.HabitCardState
import ch.nicolab.cadence.LearnedPanelState
import ch.nicolab.cadence.MainViewModel
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.LearnedAnswer
import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.domain.LearnedQuestionSettings
import ch.nicolab.cadence.domain.QuestionPlanner
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private enum class LearnedChoice { NO, YES, AMOUNT }

private const val MAX_AMOUNT = 999L

/** Réponse à la question de la veille : Non, Oui, ou Oui avec une quantité dans l'unité de l'habitude. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun LearnedQuestionSheet(
    question: LearnedQuestion,
    habitName: String,
    tint: Color,
    busy: Boolean,
    error: String?,
    dismiss: () -> Unit,
    answer: (LearnedAnswer) -> Unit,
    ignore: () -> Unit,
    muteWeekday: () -> Unit,
) {
    val alcohol = LearnedQuestionText.isAlcohol(question)
    val dayName = LearnedQuestionText.weekdayName(question.weekday)
    val dayPhrase = stringResource(R.string.learned_question_yesterday, dayName)
    val kinds = question.answerKinds
    var choice by remember(question.habitId, question.date) { mutableStateOf<LearnedChoice?>(null) }
    var amountText by remember(question.habitId, question.date) { mutableStateOf("1") }
    val amount = amountText.toLongOrNull()?.takeIf { it in 1..MAX_AMOUNT }
    val submission: LearnedAnswer? = when (choice) {
        LearnedChoice.NO -> LearnedAnswer.No
        LearnedChoice.YES -> LearnedAnswer.Yes
        LearnedChoice.AMOUNT -> amount?.let { LearnedAnswer.Amount(LearnedQuestionText.canonicalAmount(it, question)) }
        null -> null
    }
    val suffix = if (alcohol) stringResource(R.string.learned_question_amount_alcohol_unit) else question.unit?.symbol

    CadenceSheet(
        title = dayPhrase,
        subtitle = stringResource(R.string.learned_question_nothing_noted),
        dismiss = { if (!busy) dismiss() },
    ) {
        Column(Modifier.heightIn(max = Size.sheetContent).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Text(
                if (alcohol) stringResource(R.string.learned_question_alcohol_ask)
                else stringResource(R.string.learned_question_habit_ask, habitName),
                style = MaterialTheme.typography.titleLarge,
                color = cadence.onSurface,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (LearnedAnswerKind.NO in kinds) {
                    ChoiceChip(stringResource(R.string.learned_question_no), choice == LearnedChoice.NO, accent = tint, leadingIcon = Icons.Outlined.Close) {
                        choice = LearnedChoice.NO
                    }
                }
                if (LearnedAnswerKind.YES in kinds) {
                    ChoiceChip(stringResource(R.string.learned_question_yes), choice == LearnedChoice.YES, accent = tint, leadingIcon = Icons.Outlined.Check) {
                        choice = LearnedChoice.YES
                    }
                }
                if (LearnedQuestionText.offersAmount(question)) {
                    ChoiceChip(stringResource(R.string.learned_question_yes_amount), choice == LearnedChoice.AMOUNT, accent = tint) {
                        choice = LearnedChoice.AMOUNT
                    }
                }
            }
            if (choice == LearnedChoice.AMOUNT) {
                CadenceField(
                    value = amountText,
                    onValue = { amountText = it.filter(Char::isDigit).take(3) },
                    label = stringResource(R.string.learned_question_amount_label),
                    accent = tint,
                    numeric = true,
                    suffix = suffix,
                )
            }
            Text(
                stringResource(R.string.learned_question_evidence, LearnedQuestionText.weekdayName(question.weekday), question.evidence.hits, question.evidence.observed),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
            error?.let { ErrorText(it) }
            PrimaryAction(
                stringResource(R.string.learned_question_save),
                Modifier.fillMaxWidth(),
                accent = tint,
                enabled = !busy && submission != null,
            ) { submission?.let(answer) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                TertiaryAction(stringResource(R.string.learned_question_ignore), Modifier.weight(1f), tint, ignore)
                TertiaryAction(stringResource(R.string.learned_question_mute, dayName), Modifier.weight(1f), tint, muteWeekday)
            }
        }
    }
}

/** Carte en tête d'Habitudes › Aujourd'hui : ouvre la réponse à la question. */
@Composable
internal fun LearnedQuestionCard(question: LearnedQuestion, habitName: String, tint: Color, onOpen: () -> Unit) {
    val dayPhrase = stringResource(R.string.learned_question_yesterday, LearnedQuestionText.weekdayName(question.weekday))
    val title = if (LearnedQuestionText.isAlcohol(question)) {
        stringResource(R.string.learned_question_alcohol_title, dayPhrase)
    } else {
        stringResource(R.string.learned_question_habit_title, dayPhrase, habitName)
    }
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = tint)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
                Text(stringResource(R.string.learned_question_card_help), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
        }
    }
}

/** Charge le réglage et la régularité de l'habitude, puis les réécrit après chaque changement. */
@Composable
internal fun LearnedQuestionsPanelHost(item: HabitCardState, viewModel: MainViewModel, dismiss: () -> Unit) {
    var loaded by remember(item.stored.id) { mutableStateOf<LearnedPanelState?>(null) }
    var revision by remember(item.stored.id) { mutableIntStateOf(0) }
    LaunchedEffect(item.stored.id, revision) { loaded = viewModel.learnedPanel(item.stored.id) }
    loaded?.let { state ->
        LearnedQuestionsPanel(
            item = item,
            state = state,
            dismiss = dismiss,
            save = { settings -> viewModel.saveLearnedSettings(settings) { revision++ } },
            mute = { day -> viewModel.muteLearnedWeekday(item.stored.id, day) { revision++ } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun LearnedQuestionsPanel(
    item: HabitCardState,
    state: LearnedPanelState,
    dismiss: () -> Unit,
    save: (LearnedQuestionSettings) -> Unit,
    mute: (DayOfWeek) -> Unit,
) {
    val settings = state.settings
    val pattern = state.pattern
    val tint = habitTint(item)
    var time by remember(settings.askAt) { mutableStateOf(settings.askAt.format(TIME_FORMAT)) }
    val parsedTime = runCatching { LocalTime.parse(time.trim(), TIME_FORMAT) }.getOrNull()
    val regularDays = DayOfWeek.entries.filter { day ->
        pattern.share(day).reaches(settings.thresholdPercent, QuestionPlanner.DEFAULT_MIN_OBSERVED_WEEKS)
    }
    val askedDays = regularDays.filter { it !in settings.mutedWeekdays }

    CadenceSheet(
        title = stringResource(R.string.learned_panel_title),
        subtitle = item.stored.name,
        dismiss = dismiss,
        leading = { HabitAvatar(item, tint) },
    ) {
        Column(Modifier.heightIn(max = Size.sheetContent).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            Text(stringResource(R.string.learned_panel_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
            SettingToggleRow(
                title = stringResource(R.string.learned_panel_enabled),
                checked = settings.enabled,
                onCheckedChange = { save(settings.copy(enabled = it)) },
                icon = Icons.Outlined.AutoAwesome,
                subtitle = stringResource(R.string.learned_panel_enabled_help),
            )
            CadenceField(
                value = time,
                onValue = { time = it },
                label = stringResource(R.string.learned_panel_time),
                support = stringResource(R.string.learned_panel_time_help),
                accent = tint,
            )
            if (parsedTime == null) {
                Text(stringResource(R.string.learned_panel_time_invalid), style = MaterialTheme.typography.bodySmall, color = cadence.error)
            }
            PrimaryAction(
                stringResource(R.string.learned_panel_save_time),
                Modifier.fillMaxWidth(),
                accent = tint,
                enabled = parsedTime != null && parsedTime != settings.askAt,
            ) { parsedTime?.let { save(settings.copy(askAt = it)) } }
            Text(
                stringResource(R.string.learned_panel_threshold, settings.thresholdPercent, pattern.weeks),
                style = MaterialTheme.typography.bodyMedium,
                color = cadence.onSurface,
            )
            Text(stringResource(R.string.learned_panel_pattern), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                DayOfWeek.entries.forEach { day ->
                    val share = pattern.share(day)
                    EvidenceChip(
                        label = stringResource(
                            R.string.learned_panel_pattern_chip,
                            LearnedQuestionText.shortWeekdayName(day),
                            share.hits,
                            share.observed,
                        ),
                        regular = day in regularDays,
                        tint = tint,
                    )
                }
            }
            if (regularDays.isEmpty()) {
                Text(stringResource(R.string.learned_panel_pattern_empty), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            askedDays.forEach { day ->
                TertiaryAction(stringResource(R.string.learned_question_mute, LearnedQuestionText.weekdayName(day)), Modifier.fillMaxWidth(), tint) {
                    mute(day)
                }
            }
            settings.mutedWeekdays.sortedBy(DayOfWeek::ordinal).forEach { day ->
                Text(stringResource(R.string.learned_panel_muted, LearnedQuestionText.weekdayName(day)), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            Text(stringResource(R.string.learned_panel_pause), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        }
    }
}

@Composable
private fun EvidenceChip(label: String, regular: Boolean, tint: Color) {
    Box(
        Modifier
            .clip(Radius.Pill)
            .background(if (regular) tint.copy(alpha = 0.16f) else cadence.containerHigh)
            .padding(horizontal = Space.md, vertical = Space.xs),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (regular) tint else cadence.onSurfaceVariant)
    }
}

private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

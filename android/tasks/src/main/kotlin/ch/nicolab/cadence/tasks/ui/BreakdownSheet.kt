@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.HeaderButtonStyle
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.RoundHeaderButton
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.breakdown.Breakdown
import ch.nicolab.cadence.tasks.breakdown.BreakdownDraft
import ch.nicolab.cadence.tasks.breakdown.BreakdownFailure
import ch.nicolab.cadence.tasks.breakdown.BreakdownProposal
import ch.nicolab.cadence.tasks.breakdown.BreakdownReason
import ch.nicolab.cadence.tasks.model.EstimateFormat
import kotlinx.coroutines.launch

private sealed interface BreakdownState {
    data object Loading : BreakdownState
    data class Unavailable(val failure: BreakdownFailure) : BreakdownState
    data class Ready(val draft: BreakdownDraft) : BreakdownState
}

private fun reasonLabel(reason: BreakdownReason?): Int? = when (reason) {
    BreakdownReason.DISABLED -> R.string.breakdown_reason_disabled
    BreakdownReason.NOT_CONFIGURED -> R.string.breakdown_reason_not_configured
    BreakdownReason.FAILED -> R.string.breakdown_reason_failed
    BreakdownReason.EMPTY -> R.string.breakdown_reason_empty
    null -> null
}

/**
 * « Découper en étapes » : l'IA propose des étapes minutées (en ligne seulement, rien n'est écrit), on les ajuste,
 * puis « Ajouter » les crée en sous-tâches côté serveur ; elles arrivent par la synchro. Sans proposition utilisable
 * (IA coupée, non configurée, en panne), la feuille demande d'écrire soi-même une première petite étape.
 */
@Composable
internal fun BreakdownSheet(taskUid: String, viewModel: TasksViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.breakdown(context) }
    val scope = rememberCoroutineScope()
    val palette = cadence
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<BreakdownState>(BreakdownState.Loading) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(taskUid, attempt) {
        state = BreakdownState.Loading
        state = repository.propose(taskUid).fold(
            onSuccess = { BreakdownState.Ready(Breakdown.draftOf(it)) },
            onFailure = { failure ->
                when (val kind = Breakdown.failureOf(failure)) {
                    // Une panne du serveur ne bloque pas : on écrit l'étape à la main.
                    BreakdownFailure.FAILED -> BreakdownState.Ready(Breakdown.draftOf(BreakdownProposal(false, BreakdownReason.FAILED, emptyList())))
                    else -> BreakdownState.Unavailable(kind)
                }
            },
        )
    }

    CadenceSheet(title = stringResource(R.string.breakdown_title), subtitle = null, dismiss = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = Space.xl),
            verticalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            when (val current = state) {
                BreakdownState.Loading -> {
                    Row(Modifier.fillMaxWidth().padding(vertical = Space.lg), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator()
                    }
                    Text(
                        stringResource(R.string.breakdown_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.onSurfaceVariant,
                    )
                }
                is BreakdownState.Unavailable -> {
                    val message = if (current.failure == BreakdownFailure.OFFLINE) R.string.breakdown_offline else R.string.breakdown_refused
                    Text(stringResource(message), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                    if (current.failure == BreakdownFailure.OFFLINE) SecondaryAction(stringResource(R.string.breakdown_retry)) { attempt++ }
                }
                is BreakdownState.Ready -> {
                    val draft = current.draft
                    fun update(next: BreakdownDraft) {
                        state = BreakdownState.Ready(next)
                        error = null
                    }
                    if (draft.fallback) {
                        Text(stringResource(R.string.breakdown_prompt_fallback), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                        reasonLabel(draft.reason)?.let {
                            Text(stringResource(it), style = MaterialTheme.typography.bodySmall, color = palette.onSurfaceVariant)
                        }
                    } else {
                        Text(stringResource(R.string.breakdown_intro_ai), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                    }
                    draft.steps.forEachIndexed { index, step ->
                        key(step.key) {
                            val issue = Breakdown.issueOf(step)
                            val position = index + 1
                            Panel(Modifier.fillMaxWidth()) {
                                Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                    CadenceField(
                                        value = step.name,
                                        onValue = { update(Breakdown.rename(draft, step.key, it)) },
                                        label = stringResource(R.string.breakdown_step_label, position),
                                        placeholder = if (draft.fallback) stringResource(R.string.breakdown_step_placeholder) else null,
                                        support = if (issue == Breakdown.StepIssue.NAME) stringResource(R.string.breakdown_name_invalid) else null,
                                    )
                                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                                        CadenceField(
                                            value = step.minutes,
                                            onValue = { update(Breakdown.setMinutes(draft, step.key, it)) },
                                            label = stringResource(R.string.breakdown_minutes_label),
                                            suffix = stringResource(R.string.breakdown_minutes_suffix),
                                            numeric = true,
                                            support = if (issue == Breakdown.StepIssue.MINUTES) stringResource(R.string.breakdown_minutes_invalid) else null,
                                            modifier = Modifier.weight(1f),
                                        )
                                        if (index > 0) {
                                            RoundHeaderButton(
                                                icon = Icons.Outlined.ArrowUpward,
                                                contentDescription = stringResource(R.string.breakdown_step_up, position),
                                                style = HeaderButtonStyle.Plain,
                                            ) { update(Breakdown.move(draft, step.key, -1)) }
                                        }
                                        if (index < draft.steps.lastIndex) {
                                            RoundHeaderButton(
                                                icon = Icons.Outlined.ArrowDownward,
                                                contentDescription = stringResource(R.string.breakdown_step_down, position),
                                                style = HeaderButtonStyle.Plain,
                                            ) { update(Breakdown.move(draft, step.key, 1)) }
                                        }
                                        RoundHeaderButton(
                                            icon = Icons.Outlined.Close,
                                            contentDescription = stringResource(R.string.breakdown_step_remove, position),
                                            style = HeaderButtonStyle.Plain,
                                        ) { update(Breakdown.remove(draft, step.key)) }
                                    }
                                }
                            }
                        }
                    }
                    if (draft.steps.size < Breakdown.MAX_STEPS) {
                        SecondaryAction(stringResource(R.string.breakdown_add_step), Modifier.fillMaxWidth()) { update(Breakdown.add(draft)) }
                    }
                    val total = Breakdown.total(draft)
                    if (total > 0) {
                        Text(
                            stringResource(R.string.breakdown_total, EstimateFormat.format(total)),
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.onSurfaceVariant,
                        )
                    }
                    error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = palette.error) }
                    val count = Breakdown.count(draft)
                    PrimaryAction(
                        if (count == 0) stringResource(R.string.breakdown_apply_none) else pluralStringResource(R.plurals.breakdown_apply, count, count),
                        Modifier.fillMaxWidth(),
                        enabled = !busy && Breakdown.canApply(draft),
                    ) {
                        val body = Breakdown.applyBody(draft).getOrNull() ?: return@PrimaryAction
                        busy = true
                        scope.launch {
                            repository.apply(taskUid, body)
                                .onSuccess { created ->
                                    viewModel.requestSync()
                                    viewModel.announce(context.resources.getQuantityString(R.plurals.breakdown_added, created, created))
                                    onDismiss()
                                }
                                .onFailure { failure ->
                                    error = context.getString(
                                        if (Breakdown.failureOf(failure) == BreakdownFailure.OFFLINE) R.string.breakdown_offline else R.string.breakdown_apply_failed,
                                    )
                                }
                            busy = false
                        }
                    }
                }
            }
        }
    }
}

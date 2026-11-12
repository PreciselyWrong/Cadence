package ch.nicolab.cadence.tasks.ui.triage

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.triage.MailCardData
import ch.nicolab.cadence.tasks.triage.MailDecision
import ch.nicolab.cadence.tasks.ui.TaskDateSheet
import ch.nicolab.cadence.tasks.ui.brief.BriefFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Carte Mail (`docs/43-mail-triage.md`) : objet, expéditeur, résumé, début du brouillon, tout en texte brut.
 * Tâche ouvre une fiche préremplie ; Répondre ouvre le fil dans Gmail ; Plus tard ; Ignorer.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun MailCardView(
    card: MailCardData,
    archiveAvailable: Boolean,
    today: LocalDate,
    onDecide: (MailDecision, JsonObject, Boolean) -> Unit,
    onSkip: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    var archive by remember(card.mailUid) { mutableStateOf(false) }
    var creating by remember(card.mailUid) { mutableStateOf(false) }
    val decide = { decision: MailDecision, payload: JsonObject -> onDecide(decision, payload, archive) }

    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                card.subject ?: stringResource(R.string.triage_mail_no_subject),
                style = MaterialTheme.typography.titleMedium,
                color = cadence.onSurface,
            )
            listOfNotNull(card.sender, receivedOn(card.receivedAt)).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
            Text(card.summary, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
            card.draftExcerpt?.let { draft ->
                Text(
                    stringResource(R.string.triage_mail_draft, draft),
                    style = MaterialTheme.typography.bodySmall,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
    }
    val reply: (@Composable () -> Unit)? = card.gmailUrl?.let { url ->
        {
            val label = stringResource(R.string.triage_mail_reply)
            val open = {
                uriHandler.openUri(url)
                decide(MailDecision.REPLY, JsonObject(emptyMap()))
            }
            if (card.replyFirst) PrimaryAction(label, Modifier.fillMaxWidth(), onClick = open) else SecondaryAction(label, onClick = open)
        }
    }
    val task: @Composable () -> Unit = {
        val label = stringResource(R.string.triage_mail_task)
        if (card.replyFirst && reply != null) {
            SecondaryAction(label) { creating = true }
        } else {
            PrimaryAction(label, Modifier.fillMaxWidth()) { creating = true }
        }
    }
    if (card.replyFirst && reply != null) reply() else task()
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        if (card.replyFirst && reply != null) task() else reply?.invoke()
        SecondaryAction(stringResource(R.string.triage_mail_later)) { decide(MailDecision.LATER, JsonObject(emptyMap())) }
        SecondaryAction(stringResource(R.string.triage_mail_dismiss)) { decide(MailDecision.DISMISS, JsonObject(emptyMap())) }
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
    if (creating) {
        MailTaskSheet(
            card = card,
            today = today,
            onDismiss = { creating = false },
            onCreate = { payload ->
                creating = false
                decide(MailDecision.TASK, payload)
            },
        )
    }
}

/** La tâche née du mail : nom et échéance préremplis, modifiables. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MailTaskSheet(card: MailCardData, today: LocalDate, onDismiss: () -> Unit, onCreate: (JsonObject) -> Unit) {
    var name by remember(card.mailUid) { mutableStateOf(card.taskName) }
    var due by remember(card.mailUid) { mutableStateOf(card.dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }) }
    var pickingDate by remember { mutableStateOf(false) }
    if (pickingDate) {
        TaskDateSheet(
            title = stringResource(R.string.triage_mail_task_due),
            today = today,
            date = due,
            time = null,
            onApply = { day, _ -> due = day },
            onDismiss = { pickingDate = false },
        )
        return
    }
    CadenceSheet(title = stringResource(R.string.triage_mail_task), subtitle = card.subject, dismiss = onDismiss) {
        CadenceField(
            value = name,
            onValue = { name = it },
            label = stringResource(R.string.triage_mail_task_name),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Space.sm))
        SecondaryAction(
            due?.let { stringResource(R.string.triage_mail_task_due_on, BriefFormat.dueChip(it)) }
                ?: stringResource(R.string.triage_mail_task_no_due),
        ) { pickingDate = true }
        Spacer(Modifier.height(Space.md))
        PrimaryAction(stringResource(R.string.triage_mail_create_task), Modifier.fillMaxWidth(), enabled = name.isNotBlank()) {
            onCreate(
                buildJsonObject {
                    put("name", name.trim())
                    due?.let { put("due_date", it.toString()) }
                },
            )
        }
        Spacer(Modifier.height(Space.lg))
    }
}

private val DAY = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())

private fun receivedOn(value: String?): String? = value?.let {
    runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(DAY) }.getOrNull()
}

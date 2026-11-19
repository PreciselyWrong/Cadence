package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.ToggleRow
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.sync.HttpError
import ch.nicolab.cadence.tasks.triage.TriageCalendarOption
import ch.nicolab.cadence.tasks.triage.TriageSettingsCodec
import ch.nicolab.cadence.tasks.triage.TriageSettingsData
import kotlinx.coroutines.launch

private val ALERT_LABELS = mapOf(
    "conflict" to R.string.triage_settings_alert_conflict,
    "event_in_work_hours" to R.string.triage_settings_alert_event_in_work_hours,
    "duplicate" to R.string.triage_settings_alert_duplicate,
    "deadline_in_note" to R.string.triage_settings_alert_deadline_in_note,
    "postponed" to R.string.triage_settings_alert_postponed,
)

/**
 * Réglages d'« À trier » (Réglages › À trier) : lus et enregistrés en ligne sur `/api/v1/triage/settings`.
 */
@Composable
fun TriageSettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.triage(context) }
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf<TriageSettingsData?>(null) }
    var calendars by remember { mutableStateOf<List<TriageCalendarOption>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var saveMessage by remember { mutableStateOf<String?>(null) }
    var saveIsError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    var lookaheadText by remember { mutableStateOf("") }
    var postponementsText by remember { mutableStateOf("") }
    var closedLookbackText by remember { mutableStateOf("") }
    var similarityText by remember { mutableStateOf("") }
    var aiLimitText by remember { mutableStateOf("") }

    val offlineMsg = stringResource(R.string.triage_settings_offline)
    val saveOfflineMsg = stringResource(R.string.triage_settings_save_offline)
    val savedMsg = stringResource(R.string.triage_settings_saved)

    fun applyLoaded(data: TriageSettingsData) {
        draft = data
        lookaheadText = data.calendarLookaheadDays.toString()
        postponementsText = data.postponements.toString()
        closedLookbackText = data.closedLookbackDays.toString()
        similarityText = data.duplicateSimilarity.toString()
        aiLimitText = data.aiDailyLimit.toString()
    }

    LaunchedEffect(repository) {
        repository.getSettings()
            .onSuccess {
                applyLoaded(it)
                calendars = repository.listCalendarOptions()
            }
            .onFailure { loadError = offlineMsg }
    }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(
            stringResource(R.string.triage_settings_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
        val current = draft
        if (current == null) {
            loadError?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.error)
            }
            return@Column
        }

        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.triage_settings_calendars_title), style = MaterialTheme.typography.titleMedium)
                if (calendars.isEmpty()) {
                    Text(
                        stringResource(R.string.triage_settings_no_calendars),
                        style = MaterialTheme.typography.bodyMedium,
                        color = cadence.onSurfaceVariant,
                    )
                } else {
                    calendars.forEach { cal ->
                        val checked = cal.uid in current.calendarFeedUids
                        ToggleRow(
                            label = cal.name,
                            checked = checked,
                            onChecked = { on ->
                                val next = if (on) {
                                    (current.calendarFeedUids + cal.uid).distinct()
                                } else {
                                    current.calendarFeedUids.filterNot { it == cal.uid }
                                }
                                draft = current.copy(calendarFeedUids = next)
                                saveMessage = null
                            },
                        )
                    }
                }
                CadenceField(
                    value = lookaheadText,
                    onValue = {
                        lookaheadText = it
                        it.toIntOrNull()?.let { v -> draft = current.copy(calendarLookaheadDays = v) }
                        saveMessage = null
                    },
                    label = stringResource(R.string.triage_settings_lookahead),
                )
            }
        }

        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.triage_settings_alerts_title), style = MaterialTheme.typography.titleMedium)
                TriageSettingsCodec.ALERT_TYPES.forEach { id ->
                    val enabled = id !in current.disabledAlerts
                    ToggleRow(
                        label = stringResource(ALERT_LABELS.getValue(id)),
                        checked = enabled,
                        onChecked = { on ->
                            val next = if (on) current.disabledAlerts - id else current.disabledAlerts + id
                            draft = current.copy(disabledAlerts = next)
                            saveMessage = null
                        },
                    )
                }
                CadenceField(
                    value = postponementsText,
                    onValue = {
                        postponementsText = it
                        it.toIntOrNull()?.let { v -> draft = current.copy(postponements = v) }
                        saveMessage = null
                    },
                    label = stringResource(R.string.triage_settings_postponements),
                )
                CadenceField(
                    value = closedLookbackText,
                    onValue = {
                        closedLookbackText = it
                        it.toIntOrNull()?.let { v -> draft = current.copy(closedLookbackDays = v) }
                        saveMessage = null
                    },
                    label = stringResource(R.string.triage_settings_closed_lookback),
                )
                CadenceField(
                    value = similarityText,
                    onValue = {
                        similarityText = it
                        it.toDoubleOrNull()?.let { v -> draft = current.copy(duplicateSimilarity = v) }
                        saveMessage = null
                    },
                    label = stringResource(R.string.triage_settings_duplicate_similarity),
                )
            }
        }

        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                Text(stringResource(R.string.triage_settings_ai_title), style = MaterialTheme.typography.titleMedium)
                ToggleRow(
                    label = stringResource(R.string.triage_settings_ai_enabled),
                    checked = current.aiEnabled,
                    onChecked = { on ->
                        draft = current.copy(aiEnabled = on)
                        saveMessage = null
                    },
                )
                if (current.aiEnabled) {
                    CadenceField(
                        value = aiLimitText,
                        onValue = {
                            aiLimitText = it
                            it.toIntOrNull()?.let { v -> draft = current.copy(aiDailyLimit = v) }
                            saveMessage = null
                        },
                        label = stringResource(R.string.triage_settings_ai_limit),
                    )
                }
            }
        }

        saveMessage?.let { msg ->
            Text(
                text = msg,
                style = MaterialTheme.typography.bodyMedium,
                color = if (saveIsError) cadence.error else cadence.primary,
            )
        }

        PrimaryAction(
            label = stringResource(R.string.triage_settings_save),
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy,
        ) {
            busy = true
            saveMessage = null
            scope.launch {
                val toSave = current.copy(
                    calendarLookaheadDays = lookaheadText.toIntOrNull() ?: current.calendarLookaheadDays,
                    postponements = postponementsText.toIntOrNull() ?: current.postponements,
                    closedLookbackDays = closedLookbackText.toIntOrNull() ?: current.closedLookbackDays,
                    duplicateSimilarity = similarityText.toDoubleOrNull() ?: current.duplicateSimilarity,
                    aiDailyLimit = aiLimitText.toIntOrNull() ?: current.aiDailyLimit,
                )
                repository.saveSettings(toSave)
                    .onSuccess { saved ->
                        applyLoaded(saved)
                        saveIsError = false
                        saveMessage = savedMsg
                    }
                    .onFailure { error ->
                        saveIsError = true
                        saveMessage = if (error is HttpError) error.message ?: saveOfflineMsg else saveOfflineMsg
                    }
                busy = false
            }
        }
    }
}

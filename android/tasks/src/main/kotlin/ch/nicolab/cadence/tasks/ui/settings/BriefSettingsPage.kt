package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import android.content.Context
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.ToggleRow
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.BriefSettingsJson
import ch.nicolab.cadence.tasks.brief.DEFAULT_BRIEF_SECTIONS
import ch.nicolab.cadence.tasks.brief.EveningMode
import ch.nicolab.cadence.tasks.ui.brief.BriefFormat
import ch.nicolab.cadence.tasks.ui.brief.BriefViewModel
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Sections qu'on peut masquer ou ranger ; « verdict » est toujours l'en-tête. */
private val MOVABLE_SECTIONS = DEFAULT_BRIEF_SECTIONS.filter { it != "verdict" }

/** Types de carte que le brief peut taire (`alerts.disabled`). */
private val ALERT_TYPES = listOf("conflict", "overload", "duplicate", "deadline_in_note", "postponed", "dependency", "event_in_work_hours")

/**
 * Réglages du résumé (Réglages › Résumé). Chaque modification part du dernier objet lu (la dernière écriture
 * l'emporte) ; hors ligne, la dernière lecture reste affichée et l'écriture est différée.
 */
@Composable
fun BriefSettingsPage(modifier: Modifier = Modifier) {
    val viewModel: BriefViewModel = viewModel()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val notifyReady by viewModel.notifyReady.collectAsStateWithLifecycle()
    val current = settings

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.brief_settings_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        if (current == null) {
            Text(stringResource(R.string.brief_settings_unavailable), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        } else {
            val save: (JsonObject) -> Unit = viewModel::saveSettings
            SendingPanel(current, save)
            EveningReviewPanel(current, save)
            SectionsPanel(current, save)
            TimelinePanel(current, save)
            ThresholdsPanel(current, save)
            AlertsPanel(current, save)
            WritingPanel(current, save)
            VoicePanel(current, save)
        }
        BriefVoiceLocalPanel()
        Panel {
            ToggleRow(
                label = stringResource(R.string.brief_notify_ready),
                checked = notifyReady,
                onChecked = viewModel::setNotifyReady,
            )
            Text(stringResource(R.string.brief_notify_ready_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        }
        StatusPanel()
    }
}

@Composable
private fun SendingPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val selectedDays = (current["days"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content?.toIntOrNull() }.orEmpty()
    Panel {
        Text(stringResource(R.string.brief_section_sending), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        ToggleRow(
            label = stringResource(R.string.brief_enabled),
            checked = BriefSettingsJson.bool(current, "enabled"),
            onChecked = { save(BriefSettingsJson.withValue(current, "enabled", JsonPrimitive(it))) },
        )
        TextSetting(
            label = stringResource(R.string.brief_time),
            value = BriefSettingsJson.string(current, "time"),
            support = stringResource(R.string.brief_time_support),
            valid = { BriefFormat.parseMinute(it) != null },
        ) { save(BriefSettingsJson.withValue(current, "time", JsonPrimitive(it))) }
        Spacer(Modifier.height(Space.xs))
        Row(verticalAlignment = Alignment.CenterVertically) {
            (0..6).forEach { index ->
                ChoiceChip(
                    label = BriefFormat.weekday(index).take(3),
                    selected = index in selectedDays,
                    modifier = Modifier.padding(end = Space.xs),
                    onClick = {
                        val next = if (index in selectedDays) selectedDays - index else selectedDays + index
                        save(BriefSettingsJson.withValue(current, "days", JsonArray(next.sorted().map { JsonPrimitive(it) })))
                    },
                )
            }
        }
    }
}

/** Bilan du soir : après l'heure de bascule, il remplace le résumé du matin dans Aujourd'hui et dans l'écran du résumé. */
/** Propositions de l'assistant dans « À trier » : fournisseur dans le profil du serveur, désactivées par défaut. */
@Composable
private fun TriageAssistantSetting(current: JsonObject, save: (JsonObject) -> Unit) {
    val triage = BriefSettingsJson.group(current, "triage")
    val enabled = (triage["enabled"] as? JsonPrimitive)?.content == "true"
    ToggleRow(
        label = stringResource(R.string.brief_triage_enabled),
        checked = enabled,
        onChecked = { save(BriefSettingsJson.withNested(current, "triage", "enabled", JsonPrimitive(it))) },
    )
    ToggleRow(
        label = stringResource(R.string.brief_link_themes),
        checked = (BriefSettingsJson.group(current, "linkThemes")["enabled"] as? JsonPrimitive)?.content == "true",
        onChecked = { save(BriefSettingsJson.withNested(current, "linkThemes", "enabled", JsonPrimitive(it))) },
    )
    if (enabled) {
        IntSetting(stringResource(R.string.brief_triage_limit), BriefSettingsJson.int(triage, "dailyLimit", 20), range = 1..200) {
            save(BriefSettingsJson.withNested(current, "triage", "dailyLimit", JsonPrimitive(it)))
        }
    }
}

@Composable
private fun EveningReviewPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val switch = EveningMode.switchOf(current)
    Panel {
        Text(stringResource(R.string.evening_settings_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.evening_settings_hint), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        ToggleRow(
            label = stringResource(R.string.evening_enabled),
            checked = switch.enabled,
            onChecked = { save(EveningMode.withSwitch(current, switch.copy(enabled = it))) },
        )
        if (switch.enabled) {
            TextSetting(
                label = stringResource(R.string.evening_switch_time),
                value = EveningMode.clock(switch.switchMinute),
                support = stringResource(R.string.evening_switch_time_support),
                valid = { EveningMode.parseMinute(it) != null },
            ) { text -> EveningMode.parseMinute(text)?.let { save(EveningMode.withSwitch(current, switch.copy(switchMinute = it))) } }
        }
    }
}

@Composable
private fun SectionsPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val visible = BriefSettingsJson.sections(current).filter { it in MOVABLE_SECTIONS }
    val order = visible + MOVABLE_SECTIONS.filter { it !in visible }
    Panel {
        Text(stringResource(R.string.brief_section_sections), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.brief_sections_support), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        order.forEachIndexed { index, id ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                ToggleRow(
                    label = stringResource(sectionLabel(id)),
                    checked = id in visible,
                    onChecked = { on ->
                        val next = if (on) visible + id else visible - id
                        save(BriefSettingsJson.withSections(current, listOf("verdict") + order.filter { it in next }))
                    },
                )
                IconButton(
                    onClick = { save(BriefSettingsJson.withSections(current, listOf("verdict") + swap(order, index, index - 1).filter { it in visible })) },
                    enabled = index > 0,
                ) { Icon(Icons.Outlined.KeyboardArrowUp, contentDescription = stringResource(R.string.brief_move_up)) }
                IconButton(
                    onClick = { save(BriefSettingsJson.withSections(current, listOf("verdict") + swap(order, index, index + 1).filter { it in visible })) },
                    enabled = index < order.lastIndex,
                ) { Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = stringResource(R.string.brief_move_down)) }
            }
        }
    }
}

private fun swap(list: List<String>, from: Int, to: Int): List<String> {
    if (to !in list.indices) return list
    return list.toMutableList().also {
        val moved = it[from]
        it[from] = it[to]
        it[to] = moved
    }
}

@Composable
private fun TimelinePanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val timelineDays = BriefSettingsJson.int(current, "timelineDays", 3)
    Panel {
        Text(stringResource(R.string.brief_section_timeline), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.brief_timeline_days, timelineDays), style = MaterialTheme.typography.bodyLarge, color = cadence.onSurface, modifier = Modifier.weight(1f))
            IconButton(onClick = { save(BriefSettingsJson.withValue(current, "timelineDays", JsonPrimitive((timelineDays - 1).coerceAtLeast(1)))) }, enabled = timelineDays > 1) {
                Icon(Icons.Outlined.Remove, contentDescription = stringResource(R.string.brief_fewer_days))
            }
            IconButton(onClick = { save(BriefSettingsJson.withValue(current, "timelineDays", JsonPrimitive((timelineDays + 1).coerceAtMost(7)))) }, enabled = timelineDays < 7) {
                Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.brief_more_days))
            }
        }
        (0..6).forEach { weekday ->
            EveningRow(current, weekday, save)
        }
    }
}

/**
 * Créneau du soir et note d'un jour. Le créneau s'écrit une fois complet et valide (début < fin, minutes), ou
 * s'efface quand les trois champs sont vides ; une saisie incomplète ou fausse revient à la valeur gardée.
 */
@Composable
private fun EveningRow(current: JsonObject, weekday: Int, save: (JsonObject) -> Unit) {
    val window = BriefSettingsJson.eveningWindow(current, weekday)
    val note = BriefSettingsJson.dayNote(current, weekday).orEmpty()
    var start by remember(window) { mutableStateOf(window?.start.orEmpty()) }
    var end by remember(window) { mutableStateOf(window?.end.orEmpty()) }
    var minutes by remember(window) { mutableStateOf(window?.minutes?.toString().orEmpty()) }
    fun commit() {
        val allBlank = start.isBlank() && end.isBlank() && minutes.isBlank()
        val startMinute = BriefFormat.parseMinute(start)
        val endMinute = BriefFormat.parseMinute(end)
        val count = minutes.toIntOrNull()
        val valid = startMinute != null && endMinute != null && startMinute < endMinute && count != null && count in 0..1440
        when {
            allBlank -> save(BriefSettingsJson.withWeekday(current, "capacity", "evening", weekday, null))
            valid -> save(
                BriefSettingsJson.withWeekday(
                    current,
                    "capacity",
                    "evening",
                    weekday,
                    JsonObject(mapOf("start" to JsonPrimitive(start), "end" to JsonPrimitive(end), "minutes" to JsonPrimitive(count))),
                ),
            )
            else -> {
                start = window?.start.orEmpty()
                end = window?.end.orEmpty()
                minutes = window?.minutes?.toString().orEmpty()
            }
        }
    }
    Column(Modifier.fillMaxWidth().padding(top = Space.sm)) {
        Text(BriefFormat.weekday(weekday), style = MaterialTheme.typography.titleSmall, color = cadence.onSurface)
        Row(verticalAlignment = Alignment.CenterVertically) {
            CadenceField(
                value = start,
                onValue = { start = it },
                label = stringResource(R.string.brief_evening_start),
                modifier = Modifier.weight(1f),
                onDone = { commit() },
            )
            Spacer(Modifier.width(Space.xs))
            CadenceField(
                value = end,
                onValue = { end = it },
                label = stringResource(R.string.brief_evening_end),
                modifier = Modifier.weight(1f),
                onDone = { commit() },
            )
            Spacer(Modifier.width(Space.xs))
            CadenceField(
                value = minutes,
                onValue = { minutes = it },
                label = stringResource(R.string.brief_evening_minutes),
                numeric = true,
                modifier = Modifier.weight(1f),
                onDone = { commit() },
            )
        }
        TextSetting(stringResource(R.string.brief_day_note), note, valid = { true }) { text ->
            save(BriefSettingsJson.withWeekday(current, "capacity", "dayNotes", weekday, text.takeIf { it.isNotBlank() }?.let { JsonPrimitive(it) }))
        }
    }
}

@Composable
private fun ThresholdsPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val thresholds = BriefSettingsJson.group(current, "thresholds")
    val retention = BriefSettingsJson.group(current, "retention")
    Panel {
        Text(stringResource(R.string.brief_section_thresholds), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        IntSetting(stringResource(R.string.brief_threshold_postponements), BriefSettingsJson.int(thresholds, "postponements", 3), range = 1..20) {
            save(BriefSettingsJson.withNested(current, "thresholds", "postponements", JsonPrimitive(it)))
        }
        IntSetting(stringResource(R.string.brief_threshold_max_moves), BriefSettingsJson.int(thresholds, "maxMoves", 3), range = 0..10) {
            save(BriefSettingsJson.withNested(current, "thresholds", "maxMoves", JsonPrimitive(it)))
        }
        IntSetting(stringResource(R.string.brief_threshold_max_tonight), BriefSettingsJson.int(thresholds, "maxTonight", 3), range = 0..10) {
            save(BriefSettingsJson.withNested(current, "thresholds", "maxTonight", JsonPrimitive(it)))
        }
        IntSetting(stringResource(R.string.brief_threshold_lookback), BriefSettingsJson.int(thresholds, "closedLookbackDays", 7), range = 1..60) {
            save(BriefSettingsJson.withNested(current, "thresholds", "closedLookbackDays", JsonPrimitive(it)))
        }
        TriageAssistantSetting(current, save)
        IntSetting(stringResource(R.string.brief_retention_decisions), BriefSettingsJson.int(retention, "decisionsDays", 90), range = 1..365) {
            save(BriefSettingsJson.withNested(current, "retention", "decisionsDays", JsonPrimitive(it)))
        }
    }
}

@Composable
private fun AlertsPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val disabled = (BriefSettingsJson.group(current, "alerts")["disabled"] as? JsonArray)
        ?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
    Panel {
        Text(stringResource(R.string.brief_section_alerts), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.brief_alerts_support), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        ALERT_TYPES.forEach { type ->
            ToggleRow(
                label = stringResource(alertLabel(type)),
                checked = type !in disabled,
                onChecked = { on ->
                    val next = if (on) disabled - type else disabled + type
                    save(BriefSettingsJson.withNested(current, "alerts", "disabled", JsonArray(next.map { JsonPrimitive(it) })))
                },
            )
        }
    }
}

@Composable
private fun WritingPanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val writing = BriefSettingsJson.group(current, "writing")
    Panel {
        Text(stringResource(R.string.brief_section_writing), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        TextSetting(stringResource(R.string.brief_writing_tone), BriefSettingsJson.string(writing, "tone"), valid = { true }) {
            save(BriefSettingsJson.withNested(current, "writing", "tone", JsonPrimitive(it)))
        }
        TextSetting(stringResource(R.string.brief_writing_signature), BriefSettingsJson.string(writing, "signature"), valid = { it.length <= 200 }) {
            save(BriefSettingsJson.withNested(current, "writing", "signature", JsonPrimitive(it)))
        }
        TextSetting(stringResource(R.string.brief_writing_instructions), BriefSettingsJson.string(writing, "instructions"), valid = { it.length <= 2000 }) {
            save(BriefSettingsJson.withNested(current, "writing", "instructions", JsonPrimitive(it)))
        }
    }
}

@Composable
private fun VoicePanel(current: JsonObject, save: (JsonObject) -> Unit) {
    val voice = BriefSettingsJson.group(current, "voice")
    Panel {
        Text(stringResource(R.string.brief_section_voice), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        ToggleRow(
            label = stringResource(R.string.brief_voice_enabled),
            checked = BriefSettingsJson.bool(voice, "enabled"),
            onChecked = { save(BriefSettingsJson.withNested(current, "voice", "enabled", JsonPrimitive(it))) },
        )
        TextSetting(stringResource(R.string.brief_voice_url), BriefSettingsJson.string(voice, "piperUrl"), valid = { it.isBlank() || it.startsWith("https://") || it.startsWith("http://") }) {
            save(BriefSettingsJson.withNested(current, "voice", "piperUrl", JsonPrimitive(it)))
        }
        TextSetting(stringResource(R.string.brief_voice_name), BriefSettingsJson.string(voice, "voice"), valid = { it.length <= 100 }) {
            save(BriefSettingsJson.withNested(current, "voice", "voice", JsonPrimitive(it)))
        }
    }
}

/** État des sources, lu sur le serveur (en ligne seulement). */
@Composable
private fun StatusPanel() {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.briefSettings(context) }
    var lines by remember { mutableStateOf<List<String>?>(null) }
    LaunchedEffect(repository) {
        lines = repository.status().getOrNull()?.let { root ->
            (root["sources"] as? JsonArray)?.mapNotNull { element -> sourceLine(context, element) }
        }
    }
    Panel {
        Text(stringResource(R.string.brief_status_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        val shown = lines
        if (shown == null) {
            Text(stringResource(R.string.brief_status_offline), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        } else {
            shown.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        }
    }
}

private fun sourceLine(context: Context, element: JsonElement): String? {
    val source = element as? JsonObject ?: return null
    val id = (source["id"] as? JsonPrimitive)?.content ?: return null
    val configured = (source["configured"] as? JsonPrimitive)?.content == "true"
    val detail = (source["detail"] as? JsonPrimitive)?.content
    val state = context.getString(if (configured) R.string.brief_status_configured else R.string.brief_status_not_configured)
    val suffix = detail?.let { " · " + context.getString(statusDetail(it)) }.orEmpty()
    return context.getString(sourceLabel(id)) + " : " + state + suffix
}

/** Champ texte qui s'enregistre à la validation ; une valeur invalide revient à la précédente. */
@Composable
private fun TextSetting(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    support: String? = null,
    valid: (String) -> Boolean,
    onCommit: (String) -> Unit,
) {
    var text by remember(value) { mutableStateOf(value) }
    CadenceField(
        value = text,
        onValue = { text = it },
        label = label,
        support = support,
        modifier = modifier.fillMaxWidth(),
        onDone = {
            val next = text.trim()
            if (next != value && valid(next)) onCommit(next) else text = value
        },
    )
}

@Composable
private fun IntSetting(label: String, value: Int, modifier: Modifier = Modifier, range: IntRange, onCommit: (Int) -> Unit) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    CadenceField(
        value = text,
        onValue = { text = it },
        label = label,
        numeric = true,
        modifier = modifier.fillMaxWidth(),
        onDone = {
            val next = text.toIntOrNull()?.takeIf { it in range }
            if (next != null && next != value) onCommit(next) else text = value.toString()
        },
    )
}

private fun sectionLabel(id: String): Int = when (id) {
    "timeline" -> R.string.brief_timeline_title
    "tonight" -> R.string.brief_tonight_title
    "moves" -> R.string.brief_moves_title
    "anticipate" -> R.string.brief_anticipate_title
    "replies" -> R.string.brief_replies_title
    "inbox" -> R.string.brief_inbox_title
    else -> R.string.brief_resolved_title
}

private fun alertLabel(type: String): Int = when (type) {
    "conflict" -> R.string.brief_alert_conflict
    "overload" -> R.string.brief_alert_overload
    "duplicate" -> R.string.brief_alert_duplicate
    "deadline_in_note" -> R.string.brief_alert_deadline
    "postponed" -> R.string.brief_alert_postponed
    "dependency" -> R.string.brief_alert_dependency
    else -> R.string.brief_alert_event_in_work_hours
}

private fun sourceLabel(id: String): Int = when (id) {
    "calendar" -> R.string.brief_source_calendar
    "mail" -> R.string.brief_source_mail
    "llm" -> R.string.brief_source_llm
    "voice" -> R.string.brief_source_voice
    else -> R.string.brief_source_agent
}

private fun statusDetail(code: String): Int = when (code) {
    "disabled" -> R.string.brief_status_disabled
    "agent_not_configured", "not_configured" -> R.string.brief_status_agent_missing
    else -> R.string.brief_status_error
}

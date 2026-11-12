package ch.nicolab.cadence.tasks.ui.settings

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.ToggleRow
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.autoclassify.ClassifyForm
import ch.nicolab.cadence.tasks.autoclassify.ClassifySettings
import ch.nicolab.cadence.tasks.autoclassify.ClassifySettingsForm
import ch.nicolab.cadence.tasks.sync.HttpError
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Un champ numérique : clé serveur, libellé, et bornes affichées (le serveur les impose). */
private data class LimitField(val key: String, val label: Int, val min: Int, val max: Int)

private val LIMITS = listOf(
    LimitField("batch_size", R.string.auto_classify_batch_size, 1, 50),
    LimitField("grace_seconds", R.string.auto_classify_grace_seconds, 0, 3600),
    LimitField("max_attempts", R.string.auto_classify_max_attempts, 1, 20),
    LimitField("context_cache_minutes", R.string.auto_classify_context_cache_minutes, 0, 1440),
    LimitField("suggestion_ttl_days", R.string.auto_classify_suggestion_ttl_days, 1, 365),
    LimitField("daily_suggestion_limit", R.string.auto_classify_daily_suggestion_limit, 0, 1000),
    LimitField("log_retention_days", R.string.auto_classify_log_retention_days, 1, 3650),
    LimitField("max_tags", R.string.auto_classify_max_tags, 0, 10),
    LimitField("max_tokens", R.string.auto_classify_max_tokens, 200, 16000),
)

private val THRESHOLD_LABELS = mapOf(
    "project" to R.string.auto_classify_threshold_project,
    "tags" to R.string.auto_classify_threshold_tags,
    "duration" to R.string.auto_classify_threshold_duration,
    "priority" to R.string.auto_classify_threshold_priority,
    "ask" to R.string.auto_classify_threshold_ask,
)

private val EFFORT_LABELS = mapOf(
    "" to R.string.auto_classify_effort_default,
    "minimal" to R.string.auto_classify_effort_minimal,
    "low" to R.string.auto_classify_effort_low,
    "medium" to R.string.auto_classify_effort_medium,
    "high" to R.string.auto_classify_effort_high,
)

/**
 * Réglages du classement automatique (Réglages › Classement). Chargés du serveur, enregistrés par PUT ; le serveur
 * valide et son refus s'affiche. En ligne seulement, y compris l'essai à blanc.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AutoClassifySettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.autoClassify(context) }
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf<ClassifySettings?>(null) }
    var form by remember { mutableStateOf<ClassifyForm?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var dryResult by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val offline = stringResource(R.string.auto_classify_offline)

    fun show(settings: ClassifySettings) {
        loaded = settings
        form = ClassifySettingsForm.fromSettings(settings.values)
    }

    fun edit(change: (ClassifyForm) -> ClassifyForm) {
        form = form?.let(change)
    }

    LaunchedEffect(repository) {
        repository.settings().onSuccess { show(it) }.onFailure { message = offline }
    }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.auto_classify_settings_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        val current = form
        if (current == null) {
            message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
            return@Column
        }
        val defaults = loaded?.defaults
        loaded?.health?.takeIf { it.shown }?.let { health ->
            Panel {
                health.error?.let { error ->
                    Text(stringResource(R.string.auto_classify_health_title), style = MaterialTheme.typography.labelLarge, color = cadence.error)
                    Text(error, style = MaterialTheme.typography.bodySmall, color = cadence.onSurface)
                    health.errorAt?.let { at -> Text(at.replace('T', ' ').take(16) + " UTC", style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
                }
                if (health.retryable > 0) {
                    Text(stringResource(R.string.auto_classify_health_failed, health.retryable), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
                    SecondaryAction(stringResource(R.string.auto_classify_health_retry), enabled = !busy) {
                        busy = true
                        scope.launch {
                            repository.retry()
                                .onSuccess { count ->
                                    loaded = loaded?.let { ClassifySettings(it.values, it.defaults, it.aiConfigured) }
                                    message = context.getString(R.string.auto_classify_health_requeued, count)
                                }
                                .onFailure { message = context.getString(R.string.auto_classify_health_retry_error) }
                            busy = false
                        }
                    }
                }
            }
        }
        Panel {
            ToggleRow(stringResource(R.string.auto_classify_enabled), current.enabled) { value -> edit { it.copy(enabled = value) } }
            ToggleRow(stringResource(R.string.auto_classify_notify), current.notify) { value -> edit { it.copy(notify = value) } }
            ToggleRow(stringResource(R.string.auto_classify_dry_mode), current.dryRun) { value -> edit { it.copy(dryRun = value) } }
            CadenceField(
                value = current.model,
                onValue = { value -> edit { it.copy(model = value) } },
                label = stringResource(R.string.auto_classify_model),
                support = loaded?.let { stringResource(if (it.aiConfigured) R.string.auto_classify_ai_configured else R.string.auto_classify_ai_missing) },
            )
        }
        Panel {
            Text(stringResource(R.string.auto_classify_effort), style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                ClassifySettingsForm.EFFORTS.forEach { effort ->
                    val selected = current.effort == effort
                    val label = (if (selected) "• " else "") + stringResource(EFFORT_LABELS.getValue(effort))
                    SecondaryAction(label) { edit { it.copy(effort = effort) } }
                }
            }
        }
        Panel {
            Text(stringResource(R.string.auto_classify_thresholds), style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
            ClassifySettingsForm.THRESHOLD_KEYS.forEach { key ->
                CadenceField(
                    value = current.thresholds[key].orEmpty(),
                    onValue = { value -> edit { it.copy(thresholds = it.thresholds + (key to value)) } },
                    label = stringResource(THRESHOLD_LABELS.getValue(key)),
                    decimal = true,
                    support = defaults?.let {
                        stringResource(R.string.auto_classify_hint, defaultOf(it["thresholds"] as? JsonObject ?: JsonObject(emptyMap()), key), "0", "1")
                    },
                )
            }
        }
        Panel {
            Text(stringResource(R.string.auto_classify_limits), style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
            LIMITS.forEach { limit ->
                CadenceField(
                    value = current.numbers[limit.key].orEmpty(),
                    onValue = { value -> edit { it.copy(numbers = it.numbers + (limit.key to value)) } },
                    label = stringResource(limit.label),
                    numeric = true,
                    support = defaults?.let {
                        stringResource(R.string.auto_classify_hint, defaultOf(it, limit.key), limit.min.toString(), limit.max.toString())
                    },
                )
            }
            CadenceField(
                value = current.excludedTags,
                onValue = { value -> edit { it.copy(excludedTags = value) } },
                label = stringResource(R.string.auto_classify_excluded_tags),
            )
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        PrimaryAction(stringResource(R.string.auto_classify_save), Modifier.fillMaxWidth(), enabled = !busy) {
            ClassifySettingsForm.build(current).fold(
                onFailure = { error -> message = context.getString(R.string.auto_classify_invalid, fieldLabel(context, error.message.orEmpty())) },
                onSuccess = { patch ->
                    busy = true
                    scope.launch {
                        repository.save(patch)
                            .onSuccess { saved ->
                                show(saved)
                                message = context.getString(R.string.auto_classify_saved)
                            }
                            .onFailure { error ->
                                val detail = (error as? HttpError)?.error ?: error.message.orEmpty()
                                message = context.getString(R.string.auto_classify_refused, detail)
                            }
                        busy = false
                    }
                },
            )
        }
        SecondaryAction(stringResource(R.string.auto_classify_dry_run), enabled = !busy) {
            busy = true
            scope.launch {
                repository.dryRun()
                    .onSuccess { result ->
                        dryResult = if (result.error != null) {
                            context.getString(R.string.auto_classify_dry_no_ai)
                        } else {
                            context.getString(R.string.auto_classify_dry_result, result.wouldChange, result.considered)
                        }
                    }
                    .onFailure { dryResult = context.getString(R.string.auto_classify_dry_offline) }
                busy = false
            }
        }
        dryResult?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface) }
    }
}

/** Valeur par défaut du serveur, affichée en aide sous le champ. */
private fun defaultOf(source: JsonObject, key: String): String = (source[key] as? JsonPrimitive)?.contentOrNull.orEmpty()

/** Libellé d'un champ à partir de sa clé serveur, pour le message de saisie invalide. */
private fun fieldLabel(context: Context, key: String): String {
    LIMITS.firstOrNull { it.key == key }?.let { return context.getString(it.label) }
    THRESHOLD_LABELS[key]?.let { return context.getString(it) }
    return key
}

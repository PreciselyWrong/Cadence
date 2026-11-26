package ch.nicolab.cadence.tasks.ui.settings

import android.content.Context
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
import ch.nicolab.cadence.tasks.breakdown.BreakdownForm
import ch.nicolab.cadence.tasks.breakdown.BreakdownSettings
import ch.nicolab.cadence.tasks.breakdown.BreakdownSettingsForm
import ch.nicolab.cadence.tasks.sync.HttpError
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private val LABELS = mapOf(
    "max_steps" to R.string.breakdown_max_steps,
    "min_step_minutes" to R.string.breakdown_min_step_minutes,
    "max_step_minutes" to R.string.breakdown_max_step_minutes,
    "note_chars" to R.string.breakdown_note_chars,
    "max_tokens" to R.string.breakdown_max_tokens,
)

/**
 * Réglages de « Découper en étapes » (Réglages › Classement, sous le formulaire du classement). Chargés du serveur,
 * enregistrés par PUT ; le serveur valide et son refus s'affiche. En ligne seulement.
 */
@Composable
internal fun BreakdownSettingsSection() {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.breakdown(context) }
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf<BreakdownSettings?>(null) }
    var form by remember { mutableStateOf<BreakdownForm?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val offline = stringResource(R.string.breakdown_settings_offline)

    fun show(settings: BreakdownSettings) {
        loaded = settings
        form = BreakdownSettingsForm.fromSettings(settings.values)
    }

    LaunchedEffect(repository) {
        repository.settings().onSuccess { show(it) }.onFailure { message = offline }
    }

    Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.breakdown_settings_title), style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(stringResource(R.string.breakdown_settings_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        val current = form
        if (current == null) {
            message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
            return@Column
        }
        val defaults = loaded?.defaults
        Panel {
            ToggleRow(stringResource(R.string.breakdown_settings_enabled), current.enabled) { value -> form = current.copy(enabled = value) }
            CadenceField(
                value = current.model,
                onValue = { value -> form = current.copy(model = value) },
                label = stringResource(R.string.auto_classify_model),
                support = loaded?.let { stringResource(if (it.aiConfigured) R.string.auto_classify_ai_configured else R.string.auto_classify_ai_missing) },
            )
        }
        Panel {
            BreakdownSettingsForm.BOUNDS.forEach { (key, range) ->
                CadenceField(
                    value = current.numbers[key].orEmpty(),
                    onValue = { value -> form = current.copy(numbers = current.numbers + (key to value)) },
                    label = stringResource(LABELS.getValue(key)),
                    numeric = true,
                    support = defaults?.let {
                        val default = (it[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
                        stringResource(R.string.auto_classify_hint, default, range.first.toString(), range.last.toString())
                    },
                )
            }
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        PrimaryAction(stringResource(R.string.breakdown_save), Modifier.fillMaxWidth(), enabled = !busy) {
            BreakdownSettingsForm.build(current).fold(
                onFailure = { error -> message = context.getString(R.string.breakdown_invalid, fieldLabel(context, error.message.orEmpty())) },
                onSuccess = { patch ->
                    busy = true
                    scope.launch {
                        repository.save(patch)
                            .onSuccess { saved ->
                                show(saved)
                                message = context.getString(R.string.breakdown_saved)
                            }
                            .onFailure { error ->
                                val detail = (error as? HttpError)?.error ?: error.message.orEmpty()
                                message = context.getString(R.string.breakdown_settings_refused, detail)
                            }
                        busy = false
                    }
                },
            )
        }
    }
}

/** Libellé d'un champ à partir de sa clé serveur, pour le message de saisie invalide. */
private fun fieldLabel(context: Context, key: String): String =
    LABELS[key]?.let(context::getString) ?: if (key == "model") context.getString(R.string.auto_classify_model) else key

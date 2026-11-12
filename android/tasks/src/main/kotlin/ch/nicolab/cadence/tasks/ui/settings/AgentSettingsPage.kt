package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.AgentProfilesDto
import ch.nicolab.cadence.tasks.brief.AgentSettingsDto
import ch.nicolab.cadence.tasks.brief.AgentTestDto
import kotlinx.coroutines.launch

private const val DEFAULT_TIMEOUT_SECONDS = 120
private const val MIN_TIMEOUT_SECONDS = 10
private const val MAX_TIMEOUT_SECONDS = 600

/**
 * Réglages de l'agent (Réglages › Agents) : adresse, délai, profils. La clé est écrite seulement : le serveur ne
 * renvoie que ses quatre derniers caractères. En ligne seulement, y compris le test de connexion.
 */
@Composable
fun AgentSettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repository = remember(context) { TasksGraph.briefAgents(context) }
    val scope = rememberCoroutineScope()
    var stored by remember { mutableStateOf<AgentSettingsDto?>(null) }
    var baseUrl by remember { mutableStateOf("") }
    var timeout by remember { mutableStateOf(DEFAULT_TIMEOUT_SECONDS.toString()) }
    var mail by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var test by remember { mutableStateOf<AgentTestDto?>(null) }
    var busy by remember { mutableStateOf(false) }
    val offline = stringResource(R.string.brief_agents_offline)
    val saved = stringResource(R.string.brief_agents_saved)
    val timeoutInvalid = stringResource(R.string.brief_agents_timeout_invalid)

    fun show(dto: AgentSettingsDto) {
        stored = dto
        baseUrl = dto.baseUrl
        timeout = dto.timeoutSeconds.toString()
        mail = dto.profiles.mail
        apiKey = ""
    }

    LaunchedEffect(repository) {
        repository.read().onSuccess(::show).onFailure { message = offline }
    }

    fun save(key: String?) {
        val seconds = timeout.toIntOrNull()?.takeIf { it in MIN_TIMEOUT_SECONDS..MAX_TIMEOUT_SECONDS }
        if (seconds == null) {
            message = timeoutInvalid
            return
        }
        busy = true
        scope.launch {
            repository.save(baseUrl.trim(), seconds, AgentProfilesDto(mail.trim()), key)
                .onSuccess {
                    show(it)
                    message = saved
                }
                .onFailure { message = it.message ?: offline }
            busy = false
        }
    }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.brief_agents_intro), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        Panel {
            CadenceField(value = baseUrl, onValue = { baseUrl = it }, label = stringResource(R.string.brief_agents_base_url), placeholder = "https://")
            CadenceField(value = timeout, onValue = { timeout = it }, label = stringResource(R.string.brief_agents_timeout), numeric = true, suffix = "s")
            CadenceField(value = mail, onValue = { mail = it }, label = stringResource(R.string.brief_agents_profile_mail))
            CadenceField(
                value = apiKey,
                onValue = { apiKey = it },
                label = stringResource(R.string.brief_agents_key),
                support = keySupport(stored),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                PrimaryAction(label = stringResource(R.string.brief_agents_save), enabled = !busy) { save(apiKey.trim().ifEmpty { null }) }
                Spacer(Modifier.width(Space.sm))
                SecondaryAction(label = stringResource(R.string.brief_agents_test), enabled = !busy) {
                    busy = true
                    scope.launch {
                        repository.test()
                            .onSuccess { test = it; message = null }
                            .onFailure { message = offline; test = null }
                        busy = false
                    }
                }
            }
            if (stored?.api_key_set == true) {
                TertiaryAction(label = stringResource(R.string.brief_agents_clear_key), onClick = { save("") })
            }
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        test?.let { result ->
            Panel {
                Text(stringResource(R.string.brief_agents_health, stateText(result.health)), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
                Text(stringResource(R.string.brief_agents_auth, stateText(result.auth)), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
                result.profiles.forEach { (name, state) ->
                    Text("$name : ${stateText(state)}", style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun keySupport(stored: AgentSettingsDto?): String = when {
    stored == null -> ""
    stored.api_key_set && stored.api_key_last4 != null -> stringResource(R.string.brief_agents_key_stored, stored.api_key_last4)
    stored.api_key_set -> stringResource(R.string.brief_agents_key_stored_unknown)
    else -> stringResource(R.string.brief_agents_key_missing)
}

@Composable
private fun stateText(state: String): String = stringResource(
    when (state) {
        "ok" -> R.string.brief_agents_state_ok
        "missing" -> R.string.brief_agents_state_missing
        "unauthorized" -> R.string.brief_agents_state_unauthorized
        else -> R.string.brief_agents_state_error
    },
)

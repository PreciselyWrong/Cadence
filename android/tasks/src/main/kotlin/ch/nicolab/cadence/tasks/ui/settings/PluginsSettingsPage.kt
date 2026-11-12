package ch.nicolab.cadence.tasks.ui.settings

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.components.ToggleRow
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.plugins.Plugin
import ch.nicolab.cadence.tasks.plugins.PluginError
import ch.nicolab.cadence.tasks.plugins.PluginList
import ch.nicolab.cadence.tasks.plugins.PluginSetting
import ch.nicolab.cadence.tasks.plugins.PluginSettingsForm
import ch.nicolab.cadence.tasks.plugins.PluginsClient
import ch.nicolab.cadence.tasks.plugins.PluginsStore
import ch.nicolab.cadence.tasks.plugins.pluginsClient
import kotlinx.coroutines.launch

/**
 * Vrai quand le compte peut gérer les plugins : `GET /api/plugins` répond (le serveur ne le sert qu'aux
 * administrateurs). Un 403 ou l'absence de serveur masque la rubrique ; une panne réseau garde la dernière réponse.
 */
@Composable
fun rememberPluginsAdmin(): Boolean {
    val context = LocalContext.current
    val store = remember(context) { PluginsStore.of(context) }
    var admin by remember { mutableStateOf(store.admin()) }
    LaunchedEffect(store) {
        pluginsClient(context).list()
            .onSuccess {
                admin = true
                store.saveAdmin(true)
            }
            .onFailure { error ->
                if ((error is PluginError && error.forbidden) || error is NotConnected) {
                    admin = false
                    store.saveAdmin(false)
                }
            }
    }
    return admin
}

/**
 * Réglages › Plugins (administrateur) : la liste des plugins du serveur, leurs états, réglages et actions. En ligne
 * seulement ; chaque action relit la liste, et le refus du serveur s'affiche tel quel.
 */
@Composable
fun PluginsSettingsPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val client = remember(context) { pluginsClient(context) }
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<PluginList?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var installUrl by remember { mutableStateOf("") }
    var installing by remember { mutableStateOf(false) }
    var installMessage by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        client.list()
            .onSuccess { data = it }
            .onFailure { message = failureText(context, it, R.string.plugins_load_error) }
    }

    LaunchedEffect(client) { refresh() }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Text(stringResource(R.string.plugins_description), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        val current = data
        if (current == null) {
            message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
            return@Column
        }
        if (!current.configured) {
            Panel { Text(stringResource(R.string.plugins_not_configured), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface) }
            return@Column
        }
        Panel {
            CadenceField(
                value = installUrl,
                onValue = { installUrl = it },
                label = stringResource(R.string.plugins_install_label),
                placeholder = "https://",
                support = stringResource(R.string.plugins_install_hint),
            )
            PrimaryAction(
                stringResource(if (installing) R.string.plugins_installing else R.string.plugins_install),
                Modifier.fillMaxWidth(),
                enabled = !installing && installUrl.isNotBlank(),
            ) {
                installing = true
                installMessage = null
                scope.launch {
                    client.install(installUrl)
                        .onSuccess {
                            installUrl = ""
                            installMessage = context.getString(R.string.plugins_installed)
                            refresh()
                        }
                        .onFailure { installMessage = failureText(context, it, R.string.plugins_install_error) }
                    installing = false
                }
            }
            installMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface) }
        }
        SecondaryAction(stringResource(R.string.plugins_reload_all), enabled = !busy) {
            busy = true
            message = null
            scope.launch {
                client.reloadAll()
                    .onSuccess {
                        message = context.getString(R.string.plugins_reloaded)
                        refresh()
                    }
                    .onFailure { message = failureText(context, it, R.string.plugins_load_error) }
                busy = false
            }
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant) }
        if (current.plugins.isEmpty()) {
            Text(stringResource(R.string.plugins_none), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        }
        current.plugins.forEach { plugin ->
            PluginPanel(plugin, client, onChanged = { refresh() })
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PluginPanel(plugin: Plugin, client: PluginsClient, onChanged: suspend () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var notice by remember(plugin.id) { mutableStateOf<String?>(null) }
    var error by remember(plugin.id) { mutableStateOf<String?>(null) }
    var confirmingRemove by remember { mutableStateOf(false) }
    var confirmingEnable by remember { mutableStateOf(false) }
    // La saisie repart des valeurs du serveur quand elles changent, et survit à un simple interrupteur.
    var form by remember(plugin.id, plugin.settings) { mutableStateOf(PluginSettingsForm.of(plugin.settings)) }
    val id = plugin.id

    fun act(action: suspend (String) -> Result<Unit>, done: Int? = null) {
        if (id == null) return
        busy = true
        notice = null
        error = null
        scope.launch {
            action(id)
                .onSuccess {
                    done?.let { notice = context.getString(it) }
                    onChanged()
                }
                .onFailure { error = failureText(context, it, R.string.plugins_save_error) }
            busy = false
        }
    }

    Panel {
        Text(plugin.name, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
        Text(versionLine(context, plugin), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
        if (plugin.description.isNotBlank()) {
            Text(plugin.description, style = MaterialTheme.typography.bodyMedium, color = cadence.onSurface)
        }
        if (plugin.canSwitch) {
            ToggleRow(stringResource(R.string.plugins_enabled), plugin.enabled) { value ->
                if (busy) return@ToggleRow
                if (value) confirmingEnable = true else act({ client.setEnabled(it, false) })
            }
        }
        if (plugin.state == Plugin.NEEDS_APPROVAL) {
            Text(stringResource(R.string.plugins_needs_approval), style = MaterialTheme.typography.bodySmall, color = cadence.onSurface)
        }
        plugin.lastError?.let {
            Text(stringResource(R.string.plugins_error_label, it), style = MaterialTheme.typography.bodySmall, color = cadence.error)
        }
        if (plugin.permissions.isNotEmpty()) {
            Text(
                stringResource(R.string.plugins_permissions) + " : " + plugin.permissions.joinToString(", ") { permissionLabel(context, it) },
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
        }
        if (plugin.events.isNotEmpty()) {
            Text(
                stringResource(R.string.plugins_events) + " : " + plugin.events.joinToString(", "),
                style = MaterialTheme.typography.bodySmall,
                color = cadence.onSurfaceVariant,
            )
        }
        if (plugin.showsSettings) {
            Text(stringResource(R.string.plugins_settings), style = MaterialTheme.typography.labelLarge, color = cadence.onSurface)
            plugin.settings.forEach { field ->
                SettingField(field, form, onForm = { form = it })
            }
            PrimaryAction(stringResource(R.string.plugins_save_settings), Modifier.fillMaxWidth(), enabled = !busy) {
                PluginSettingsForm.body(plugin.settings, form).fold(
                    onFailure = { failure ->
                        val label = plugin.settings.firstOrNull { it.key == failure.message }?.label ?: failure.message.orEmpty()
                        error = context.getString(R.string.plugins_invalid_number, label)
                    },
                    onSuccess = { body -> act({ client.saveSettings(it, body) }, R.string.plugins_saved) },
                )
            }
        }
        plugin.update?.let { update ->
            val status = when {
                update.error != null -> update.error
                update.available && update.latest != null -> stringResource(R.string.plugins_update_available, update.latest)
                update.checkedAt != null -> stringResource(R.string.plugins_up_to_date)
                else -> null
            }
            status?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant) }
        }
        if (id != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (plugin.update != null) {
                    SecondaryAction(stringResource(R.string.plugins_check_update), enabled = !busy) { act({ client.checkUpdate(it) }) }
                }
                if (plugin.installedFromGit) {
                    SecondaryAction(stringResource(R.string.plugins_pull), enabled = !busy) { act({ client.pull(it) }, R.string.plugins_pulled) }
                }
                SecondaryAction(stringResource(R.string.plugins_reload), enabled = !busy) { act({ client.reload(it) }) }
                TertiaryAction(stringResource(R.string.plugins_remove), tint = cadence.error) { if (!busy) confirmingRemove = true }
            }
        }
        notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.success) }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.error) }
    }

    if (confirmingEnable) {
        val asked = plugin.permissions.map { permissionLabel(context, it) } + plugin.events
        AlertDialog(
            onDismissRequest = { confirmingEnable = false },
            title = { Text(stringResource(R.string.plugins_approve_title)) },
            text = {
                Text(
                    stringResource(R.string.plugins_approve_intro) + "\n" +
                        asked.joinToString("\n") { "• $it" } + "\n\n" +
                        stringResource(R.string.plugins_approve_outro),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingEnable = false
                    act({ client.setEnabled(it, true) })
                }) { Text(stringResource(R.string.plugins_approve)) }
            },
            dismissButton = { TextButton(onClick = { confirmingEnable = false }) { Text(stringResource(R.string.tasks_cancel)) } },
        )
    }

    if (confirmingRemove) {
        AlertDialog(
            onDismissRequest = { confirmingRemove = false },
            title = { Text(stringResource(R.string.plugins_remove_title)) },
            text = { Text(stringResource(R.string.plugins_remove_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingRemove = false
                    act({ client.remove(it) })
                }) { Text(stringResource(R.string.plugins_remove)) }
            },
            dismissButton = { TextButton(onClick = { confirmingRemove = false }) { Text(stringResource(R.string.tasks_cancel)) } },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettingField(field: PluginSetting, form: PluginSettingsForm, onForm: (PluginSettingsForm) -> Unit) {
    val label = field.label + if (field.required) " (" + stringResource(R.string.plugins_required) + ")" else ""
    when (field.type) {
        PluginSetting.BOOLEAN -> {
            ToggleRow(label, form.flags[field.key] == true) { onForm(form.withFlag(field.key, it)) }
            field.help?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.outline) }
        }
        PluginSetting.SELECT -> Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = cadence.outline)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                field.options.forEach { option ->
                    ChoiceChip(label = option, selected = form.text[field.key] == option, onClick = { onForm(form.withText(field.key, option)) })
                }
            }
            field.help?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cadence.outline) }
        }
        PluginSetting.SECRET -> {
            val saved = field.hasValue && field.key !in form.cleared
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                CadenceField(
                    value = form.text[field.key].orEmpty(),
                    onValue = { onForm(form.withText(field.key, it)) },
                    label = label,
                    modifier = Modifier.weight(1f),
                    placeholder = if (saved) stringResource(R.string.plugins_secret_saved) else null,
                    support = field.help,
                    secret = true,
                )
                if (saved) {
                    TertiaryAction(stringResource(R.string.plugins_clear_secret)) { onForm(form.clearSecret(field.key)) }
                }
            }
        }
        else -> CadenceField(
            value = form.text[field.key].orEmpty(),
            onValue = { onForm(form.withText(field.key, it)) },
            label = label,
            support = field.help,
            decimal = field.type == PluginSetting.NUMBER,
        )
    }
}

private fun versionLine(context: Context, plugin: Plugin): String = buildList {
    add(stateLabel(context, plugin.state))
    plugin.version?.let { add(context.getString(R.string.plugins_version, it)) }
    if (plugin.reloadPending) plugin.version?.let { add(context.getString(R.string.plugins_reload_pending, it)) }
    plugin.previousVersion?.takeIf { it != plugin.version }?.let { add(context.getString(R.string.plugins_updated_from, it)) }
}.joinToString(" · ")

private fun stateLabel(context: Context, state: String): String = context.getString(
    when (state) {
        Plugin.ACTIVE -> R.string.plugins_state_active
        Plugin.ERROR -> R.string.plugins_state_error
        Plugin.INVALID -> R.string.plugins_state_invalid
        Plugin.INCOMPATIBLE -> R.string.plugins_state_incompatible
        Plugin.NEEDS_APPROVAL -> R.string.plugins_state_needs_approval
        Plugin.MISSING -> R.string.plugins_state_missing
        else -> R.string.plugins_state_disabled
    },
)

private fun permissionLabel(context: Context, permission: String): String = when (permission) {
    "events" -> context.getString(R.string.plugins_permission_events)
    "routes" -> context.getString(R.string.plugins_permission_routes)
    "brief" -> context.getString(R.string.plugins_permission_brief)
    else -> permission
}

/** Le `{error}` du serveur tel quel ; hors ligne, un message à part ; sinon [fallback]. */
private fun failureText(context: Context, error: Throwable, fallback: Int): String = when (error) {
    is PluginError -> error.message ?: context.getString(fallback)
    is NotConnected, is java.io.IOException -> context.getString(R.string.plugins_offline)
    else -> context.getString(fallback)
}

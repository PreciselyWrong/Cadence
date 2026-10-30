package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import ch.nicolab.cadence.tasks.ConnectPayload
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.launch

/**
 * Réglages : connexion à un serveur Tududi (code QR ou adresse + clé API).
 * La clé se crée dans Tududi, Profil, Clés API.
 */
@Composable
fun TududiConnectionSection(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val connection = remember(context) { TasksGraph.connection(context) }
    val repository = remember(context) { TasksGraph.repository(context) }
    val info by connection.observe().collectAsStateWithLifecycle(initialValue = null)
    val scope = rememberCoroutineScope()

    var serverUrl by rememberSaveable { mutableStateOf("") }
    var token by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDisconnect by remember { mutableStateOf(false) }
    val connectError = stringResource(R.string.tasks_connect_error)
    val invalidQr = stringResource(R.string.tasks_qr_invalid)

    fun connect(url: String, key: String) {
        scope.launch {
            busy = true
            error = null
            connection.connect(url, key)
                .onSuccess {
                    serverUrl = ""
                    token = ""
                }
                .onFailure { error = it.message ?: connectError }
            busy = false
        }
    }

    fun scanQrCode() {
        GmsBarcodeScanning.getClient(context).startScan()
            .addOnSuccessListener { barcode ->
                val payload = barcode.rawValue?.let { ConnectPayload.parse(it) }
                if (payload == null) {
                    error = invalidQr
                } else {
                    connect(payload.serverUrl, payload.token)
                }
            }
            .addOnFailureListener { error = it.message ?: connectError }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.tasks_connect_title),
            style = MaterialTheme.typography.titleMedium,
        )
        val connected = info
        if (connected != null) {
            Text(
                text = connected.userEmail
                    ?.let { stringResource(R.string.tasks_connected_as, connected.serverUrl, it) }
                    ?: stringResource(R.string.tasks_connected_to, connected.serverUrl),
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = { repository.requestSync() }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.tasks_sync_now))
            }
            OutlinedButton(onClick = { confirmDisconnect = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.tasks_disconnect))
            }
        } else {
            Button(
                onClick = { scanQrCode() },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Outlined.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.tasks_scan_qr))
            }
            Text(
                text = stringResource(R.string.tasks_or),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text(stringResource(R.string.tasks_server_address)) },
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text(stringResource(R.string.tasks_api_key)) },
                singleLine = true,
                enabled = !busy,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = stringResource(R.string.tasks_api_key_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = { connect(serverUrl.trim(), token.trim()) },
                enabled = !busy && serverUrl.isNotBlank() && token.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.tasks_connect)) }
        }
        if (busy) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        error?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }

    if (confirmDisconnect) {
        AlertDialog(
            onDismissRequest = { confirmDisconnect = false },
            title = { Text(stringResource(R.string.tasks_disconnect_title)) },
            text = { Text(stringResource(R.string.tasks_disconnect_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDisconnect = false
                    scope.launch { connection.disconnect() }
                }) { Text(stringResource(R.string.tasks_disconnect)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDisconnect = false }) {
                    Text(stringResource(R.string.tasks_cancel))
                }
            },
        )
    }
}

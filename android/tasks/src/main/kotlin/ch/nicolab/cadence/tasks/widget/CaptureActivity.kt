package ch.nicolab.cadence.tasks.widget

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.launch

/** Capture vers la boîte depuis la barre de capture : idée saisie ou texte dicté. */
class CaptureActivity : ComponentActivity() {
    private val dictation = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (result.resultCode == Activity.RESULT_OK && !spoken.isNullOrBlank()) save(spoken) else finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent.getStringExtra(EXTRA_MODE) == MODE_DICTATE) {
            if (savedInstanceState == null) startDictation()
            return
        }
        setContent {
            CadenceTheme { IdeaDialog(onSave = ::save, onDismiss = ::finish) }
        }
    }

    private fun startDictation() {
        val recognizer = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        try {
            dictation.launch(recognizer)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.tasks_capture_no_dictation, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun save(text: String) {
        val content = text.trim()
        if (content.isEmpty()) {
            finish()
            return
        }
        lifecycleScope.launch {
            TasksGraph.repository(this@CaptureActivity).captureInbox(content)
            Toast.makeText(this@CaptureActivity, R.string.tasks_share_saved, Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    companion object {
        private const val EXTRA_MODE = "capture_mode"
        private const val MODE_IDEA = "idea"
        private const val MODE_DICTATE = "dictate"

        fun ideaIntent(context: Context): Intent = intentFor(context, MODE_IDEA)

        fun dictateIntent(context: Context): Intent = intentFor(context, MODE_DICTATE)

        private fun intentFor(context: Context, mode: String): Intent =
            Intent(context, CaptureActivity::class.java).putExtra(EXTRA_MODE, mode)
    }
}

@Composable
private fun IdeaDialog(onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.tasks_capture_idea_title)) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = { Text(stringResource(R.string.tasks_capture_idea_hint)) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(text) }, enabled = text.isNotBlank()) {
                Text(stringResource(R.string.tasks_quick_add_submit))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.tasks_quick_add_cancel)) } },
    )
}

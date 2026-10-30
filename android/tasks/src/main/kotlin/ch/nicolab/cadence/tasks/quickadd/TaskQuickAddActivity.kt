package ch.nicolab.cadence.tasks.quickadd

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskDraft
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Ajout rapide, affiché comme une fenêtre transparente au-dessus de l'écran courant.
 * Reçoit aussi un texte partagé : il part directement dans la boîte de réception.
 */
class TaskQuickAddActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent.action == Intent.ACTION_SEND) {
            captureShared(intent.getStringExtra(Intent.EXTRA_TEXT))
            return
        }
        setContent {
            QuickAddTheme {
                QuickAddCard(
                    onSubmit = { draft -> TasksGraph.repository(this@TaskQuickAddActivity).createTask(draft) },
                    onDismiss = { finish() },
                )
            }
        }
    }

    private fun captureShared(text: String?) {
        val content = text?.trim()
        if (content.isNullOrEmpty()) {
            finish()
            return
        }
        lifecycleScope.launch {
            TasksGraph.repository(this@TaskQuickAddActivity).captureInbox(content)
            Toast.makeText(this@TaskQuickAddActivity, R.string.tasks_share_saved, Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}

private enum class DueChoice(@StringRes val label: Int) {
    TODAY(R.string.tasks_quick_add_today),
    TOMORROW(R.string.tasks_quick_add_tomorrow),
    NONE(R.string.tasks_quick_add_no_date),
}

private fun DueChoice.dateFrom(today: LocalDate): LocalDate? = when (this) {
    DueChoice.TODAY -> today
    DueChoice.TOMORROW -> today.plusDays(1)
    DueChoice.NONE -> null
}

@Composable
private fun QuickAddTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val dark = isSystemInDarkTheme()
    val scheme: ColorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme()
        else -> lightColorScheme()
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

@Composable
private fun QuickAddCard(onSubmit: suspend (TaskDraft) -> Unit, onDismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var due by rememberSaveable { mutableStateOf(DueChoice.TODAY) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val focusRequester = remember { FocusRequester() }
    val interactionSource = remember { MutableInteractionSource() }
    val scope = rememberCoroutineScope()
    val genericError = stringResource(R.string.tasks_error_generic)

    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    // La carte ne se ferme qu'après l'écriture ; en cas d'échec, le titre et le choix restent.
    fun submit() {
        val title = name.trim()
        if (title.isEmpty() || saving) return
        saving = true
        saveError = null
        val draft = TaskDraft(name = title, dueDate = due.dateFrom(LocalDate.now()))
        scope.launch {
            try {
                onSubmit(draft)
                onDismiss()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                saveError = e.message ?: genericError
                saving = false
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.32f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier
                .padding(24.dp)
                .fillMaxWidth()
                // Consomme le toucher : taper dans la carte ne ferme pas la fenêtre.
                .clickable(interactionSource = interactionSource, indication = null) {},
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    stringResource(R.string.tasks_quick_add_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                    placeholder = { Text(stringResource(R.string.tasks_quick_add_hint)) },
                    singleLine = true,
                    enabled = !saving,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    DueChoice.entries.forEach { choice ->
                        FilterChip(
                            selected = due == choice,
                            onClick = { due = choice },
                            label = { Text(stringResource(choice.label)) },
                        )
                    }
                }
                if (saving) {
                    Spacer(Modifier.height(12.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                saveError?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.tasks_quick_add_cancel)) }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { submit() }, enabled = name.isNotBlank() && !saving) {
                        Text(stringResource(R.string.tasks_quick_add_submit))
                    }
                }
            }
        }
    }
}

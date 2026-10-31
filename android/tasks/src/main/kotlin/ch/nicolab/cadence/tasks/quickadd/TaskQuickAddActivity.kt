package ch.nicolab.cadence.tasks.quickadd

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.components.ErrorText
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.designsystem.theme.Elevation
import ch.nicolab.cadence.designsystem.theme.Glass
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
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
            CadenceTheme {
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

    val palette = cadence
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.scrim.copy(alpha = Glass.ScrimAlpha))
            .clickable(onClick = onDismiss)
            .imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier
                .padding(Space.xl)
                .fillMaxWidth()
                // Consomme le toucher : taper dans la carte ne ferme pas la fenêtre.
                .clickable(interactionSource = interactionSource, indication = null) {},
            shape = Radius.Panel,
            color = palette.card,
            contentColor = palette.onSurface,
            shadowElevation = Elevation.floating,
        ) {
            Column(modifier = Modifier.padding(Space.xl), verticalArrangement = Arrangement.spacedBy(Space.lg)) {
                Text(
                    stringResource(R.string.tasks_quick_add_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = palette.onSurface,
                )
                CadenceField(
                    value = name,
                    onValue = { name = it },
                    label = stringResource(R.string.tasks_quick_add_hint),
                    enabled = !saving,
                    fieldModifier = Modifier.focusRequester(focusRequester),
                    onDone = { submit() },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    DueChoice.entries.forEach { choice ->
                        ChoiceChip(
                            label = stringResource(choice.label),
                            selected = due == choice,
                            onClick = { due = choice },
                        )
                    }
                }
                saveError?.let { ErrorText(it) }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    SecondaryAction(stringResource(R.string.tasks_quick_add_cancel), Modifier.weight(1f), enabled = !saving, onClick = onDismiss)
                    PrimaryAction(
                        stringResource(if (saving) R.string.tasks_quick_add_saving else R.string.tasks_quick_add_submit),
                        Modifier.weight(1f),
                        enabled = name.isNotBlank() && !saving,
                    ) { submit() }
                }
            }
        }
    }
}

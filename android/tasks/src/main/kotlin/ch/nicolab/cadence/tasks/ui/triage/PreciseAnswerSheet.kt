package ch.nicolab.cadence.tasks.ui.triage

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.triage.QuestionDto
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/** « Préciser » : une réponse libre, envoyée comme texte de réponse au serveur. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PreciseAnswerSheet(question: QuestionDto, onSend: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("") }
    CadenceSheet(
        title = question.text,
        subtitle = null,
        dismiss = onDismiss,
    ) {
        CadenceField(
            value = text,
            onValue = { text = it.take(MAX_ANSWER) },
            label = stringResource(R.string.triage_precise_label),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Space.md))
        PrimaryAction(
            label = stringResource(R.string.triage_precise_send),
            enabled = text.isNotBlank(),
            onClick = { onSend(text.trim()) },
        )
    }
}

private const val MAX_ANSWER = 500

/** Libellés d'« À trier », purs. */
internal object TriageFormat {
    /** « jeu 6 » : le jour court en minuscules et le quantième, pour « Échéance : jeu 6 ». */
    fun dueChip(date: LocalDate): String =
        date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.FRENCH).removeSuffix(".").take(3).lowercase(Locale.FRENCH) + " " + date.dayOfMonth
}

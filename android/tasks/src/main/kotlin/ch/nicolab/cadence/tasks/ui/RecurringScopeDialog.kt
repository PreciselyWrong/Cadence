@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.RecurringScope

/** Ce que la question de portée va faire à la série : modifier (champs, heure, jour) ou supprimer. */
enum class RecurringAction { EDIT, DELETE }

private class ScopeChoice(val scope: RecurringScope, @StringRes val title: Int, @StringRes val description: Int)

private fun choices(action: RecurringAction): List<ScopeChoice> = when (action) {
    RecurringAction.EDIT -> listOf(
        ScopeChoice(RecurringScope.THIS, R.string.recurring_this, R.string.recurring_edit_this_hint),
        ScopeChoice(RecurringScope.FOLLOWING, R.string.recurring_following, R.string.recurring_edit_following_hint),
        ScopeChoice(RecurringScope.ALL, R.string.recurring_all, R.string.recurring_edit_all_hint),
    )
    RecurringAction.DELETE -> listOf(
        ScopeChoice(RecurringScope.THIS, R.string.recurring_this, R.string.recurring_delete_this_hint),
        ScopeChoice(RecurringScope.FOLLOWING, R.string.recurring_following, R.string.recurring_delete_following_hint),
        ScopeChoice(RecurringScope.ALL, R.string.recurring_all, R.string.recurring_delete_all_hint),
    )
}

/**
 * « Cette tâche ou la série ? » : posée une fois par enregistrement d'une tâche récurrente, quelle que soit la
 * surface (fiche, menu, balayage, Agenda). Annuler, ou fermer la feuille, répond null et n'écrit rien.
 */
@Composable
fun RecurringScopeDialog(action: RecurringAction, onAnswer: (RecurringScope?) -> Unit) {
    val options = choices(action)
    val title = when (action) {
        RecurringAction.EDIT -> R.string.recurring_edit_title
        RecurringAction.DELETE -> R.string.recurring_delete_title
    }
    CadenceSheet(title = stringResource(title), subtitle = null, dismiss = { onAnswer(null) }) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            RowGroup {
                options.forEachIndexed { index, choice ->
                    SettingRow(
                        title = stringResource(choice.title),
                        subtitle = stringResource(choice.description),
                        shape = rowGroupShape(index, options.size),
                        onClick = { onAnswer(choice.scope) },
                    )
                }
            }
            TextButton(onClick = { onAnswer(null) }, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(R.string.tasks_cancel))
            }
        }
    }
}

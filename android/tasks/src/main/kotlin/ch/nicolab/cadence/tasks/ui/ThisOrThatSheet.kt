@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.review.ThisOrThat

/** Carte d'un duel : titre, projet et estimation, rien d'autre. */
internal data class ChoiceCard(val uid: String, val title: String, val detail: String?)

private val CardMinHeight = 112.dp

/**
 * « Aide-moi à choisir » : deux cartes côte à côte, le choix reste et rencontre la suivante, « Aucune des
 * deux » les écarte. Le dernier restant peut passer à aujourd'hui ; sinon rien ne change sur les tâches.
 */
@Composable
internal fun ThisOrThatSheet(cards: List<ChoiceCard>, onChoose: (String) -> Unit, dismiss: () -> Unit) {
    var duel by remember(cards) { mutableStateOf(ThisOrThat.start(cards.map { it.uid })) }
    val byUid = remember(cards) { cards.associateBy { it.uid } }
    val palette = cadence
    CadenceSheet(title = stringResource(R.string.choose_title), subtitle = null, dismiss = dismiss) {
        Column(Modifier.navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(Space.md)) {
            val pair = duel.pair
            val winner = duel.winner?.let(byUid::get)
            when {
                pair != null -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                        listOfNotNull(byUid[pair.first], byUid[pair.second]).forEach { card ->
                            Panel(
                                modifier = Modifier.weight(1f).heightIn(min = CardMinHeight),
                                onClick = { duel = duel.pick(card.uid) },
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                                    Text(card.title, style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                    card.detail?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                    TertiaryAction(stringResource(R.string.choose_neither), modifier = Modifier.fillMaxWidth()) { duel = duel.neither() }
                }
                winner != null -> {
                    Panel(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                            Text(winner.title, style = MaterialTheme.typography.titleMedium)
                            winner.detail?.takeIf { it.isNotBlank() }?.let {
                                Text(it, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
                            }
                        }
                    }
                    PrimaryAction(stringResource(R.string.choose_add_today), modifier = Modifier.fillMaxWidth()) { onChoose(winner.uid) }
                }
                else -> {
                    Text(stringResource(R.string.choose_none_left), style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
                    TertiaryAction(stringResource(R.string.choose_close), modifier = Modifier.fillMaxWidth(), onClick = dismiss)
                }
            }
        }
    }
}

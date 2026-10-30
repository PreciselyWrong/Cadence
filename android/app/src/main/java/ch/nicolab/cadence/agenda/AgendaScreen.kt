package ch.nicolab.cadence.agenda

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.ui.ScreenList

/** Agenda : emplacement réservé, le calendrier réel viendra dans une phase suivante. */
@Composable
fun AgendaScreen(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize()) {
        ScreenList(header = { ScreenHeader(title = stringResource(R.string.agenda_title)) }) {
            item {
                Text(
                    stringResource(R.string.agenda_placeholder),
                    style = MaterialTheme.typography.bodyLarge,
                    color = cadence.onSurfaceVariant,
                )
            }
        }
    }
}

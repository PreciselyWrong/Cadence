package ch.nicolab.cadence.tasks.ui.review

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.review.ReviewSummary

/**
 * Entrée de la revue dans le Bilan, seulement avec un serveur : un titre et ce qui attend, sans
 * compteur rouge ni relance. La revue s'ouvre quand on le veut.
 */
@Composable
fun ReviewEntryPanel(onOpen: () -> Unit) {
    val context = LocalContext.current
    val connection = remember(context) { TasksGraph.connection(context) }
    val info by connection.observe().collectAsStateWithLifecycle(initialValue = null)
    if (info == null) return
    val review = remember(context) { TasksGraph.review(context) }
    var summary by remember { mutableStateOf<ReviewSummary?>(null) }
    LaunchedEffect(review) { review.summary().onSuccess { summary = it.value } }
    val palette = cadence
    val detail = summary?.let {
        if (it.attentionTotal == 0) {
            stringResource(R.string.review_entry_clear)
        } else {
            pluralStringResource(R.plurals.review_attention, it.attentionTotal, it.attentionTotal)
        }
    } ?: stringResource(R.string.review_entry_offline)
    Panel(onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.review_entry_title), style = MaterialTheme.typography.titleMedium, color = palette.onSurface)
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = palette.onSurfaceVariant)
            }
            Spacer(Modifier.width(Space.sm))
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = palette.onSurfaceVariant)
        }
    }
}

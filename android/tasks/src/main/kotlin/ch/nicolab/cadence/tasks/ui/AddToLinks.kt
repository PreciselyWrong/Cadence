package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkExtractor

/**
 * Une adresse écrite dans une tâche ou une note reste son contexte : elle n'entre dans les liens
 * que par ce bouton (`docs/37-links.md`). Rien n'est montré sans adresse.
 */
@Composable
internal fun AddToLinksRow(text: String, sourceKey: String, onAdd: (String) -> Unit, limit: Int = 3) {
    val urls = remember(text, limit) { LinkExtractor.urls(text, limit) }
    if (urls.isEmpty()) return
    var added by remember(sourceKey) { mutableStateOf(emptySet<String>()) }
    Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
        urls.forEach { url ->
            val domain = LinkExtractor.domain(url) ?: url
            val done = url in added
            TextButton(
                onClick = {
                    onAdd(url)
                    added = added + url
                },
                enabled = !done,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(if (done) Icons.Outlined.Check else Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        stringResource(if (done) R.string.links_in_links else R.string.links_add_to_links, domain),
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

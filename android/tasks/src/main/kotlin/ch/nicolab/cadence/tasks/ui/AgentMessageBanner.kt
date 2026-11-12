package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.live.AgentBanner
import ch.nicolab.cadence.tasks.live.AgentInbox
import ch.nicolab.cadence.tasks.live.AgentMessages
import ch.nicolab.cadence.tasks.live.pluginPageIntent
import kotlinx.coroutines.launch

/**
 * Une ligne calme en haut des écrans principaux tant qu'un message d'agent n'est pas lu (même règle que le web,
 * `AgentMessageBanner.tsx`) : le titre du plus récent, « +N » pour les autres, Ouvrir (lu, puis la page du plugin)
 * et × (lu).
 */
@Composable
fun AgentMessageBanner(banner: AgentBanner, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val palette = cadence
    val latest = banner.latest
    val target = AgentMessages.pluginTarget(latest)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Space.gutter, vertical = Space.xs)
            .background(palette.primaryContainer, RoundedCornerShape(12.dp))
            .padding(start = Space.md)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Icon(painterResource(R.drawable.tasks_ic_agent), contentDescription = null, tint = palette.primary, modifier = Modifier.size(20.dp))
        Text(
            latest.title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = palette.onPrimaryContainer,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (banner.more > 0) {
            Text(
                stringResource(R.string.agent_banner_more, banner.more),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = palette.onPrimary,
                modifier = Modifier
                    .background(palette.primary, RoundedCornerShape(50))
                    .padding(horizontal = Space.sm, vertical = 2.dp),
            )
        }
        if (target != null) {
            TextButton(onClick = {
                scope.launch {
                    AgentInbox.markRead(context, latest.uid)
                    pluginPageIntent(context, target)?.let(context::startActivity)
                }
            }) {
                Text(stringResource(R.string.agent_banner_open), fontWeight = FontWeight.SemiBold, color = palette.primary)
            }
        }
        IconButton(onClick = { scope.launch { AgentInbox.markRead(context, latest.uid) } }) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = stringResource(R.string.agent_banner_dismiss),
                tint = palette.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

package ch.nicolab.cadence.tasks.ui.triage

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.triage.LinkReviewCard
import ch.nicolab.cadence.tasks.triage.LinkReviewDecision

/** Carte « Lien à revoir » : le lien, puis garder, archiver, ou revoir dans 30 jours. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LinkReviewCardView(
    card: LinkReviewCard,
    onDecide: (LinkReviewDecision) -> Unit,
    onSkip: () -> Unit,
) {
    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Text(
                stringResource(R.string.triage_link_review_title),
                style = MaterialTheme.typography.labelMedium,
                color = cadence.onSurfaceVariant,
            )
            Text(card.title ?: card.url, style = MaterialTheme.typography.titleMedium, color = cadence.onSurface)
            if (card.title != null) {
                Text(card.url, style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            }
        }
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        PrimaryAction(stringResource(R.string.triage_link_keep)) { onDecide(LinkReviewDecision.KEEP) }
        SecondaryAction(stringResource(R.string.triage_link_archive)) { onDecide(LinkReviewDecision.ARCHIVE) }
        SecondaryAction(stringResource(R.string.triage_link_later)) { onDecide(LinkReviewDecision.LATER) }
        TertiaryAction(stringResource(R.string.triage_skip), onClick = onSkip)
    }
}

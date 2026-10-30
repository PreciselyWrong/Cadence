package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

/** Ton d'un en-tête de section : neutre, ou erreur pour les éléments en retard. */
enum class SectionTone { Neutral, Error }

/**
 * Titre de section à la manière d'« En retard 2 ……… Voir les 2 » : titre, compteur et action
 * alignée à droite.
 */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    tone: SectionTone = SectionTone.Neutral,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val palette = cadence
    val titleColor = if (tone == SectionTone.Error) palette.error else palette.onSurfaceVariant
    Row(
        modifier
            .fillMaxWidth()
            .padding(top = Space.lg, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = titleColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        count?.let {
            Spacer(Modifier.width(Space.xs))
            Text(it.toString(), style = MaterialTheme.typography.labelLarge, color = palette.outline)
        }
        Spacer(Modifier.weight(1f))
        if (actionLabel != null && onAction != null) {
            val haptic = rememberCadenceHaptic()
            Text(
                actionLabel,
                Modifier
                    .minimumInteractiveComponentSize()
                    .clickable(role = Role.Button) {
                        haptic.tap()
                        onAction()
                    },
                style = MaterialTheme.typography.labelLarge,
                color = palette.primary,
            )
        }
    }
}

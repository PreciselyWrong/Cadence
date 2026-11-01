@file:OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.hexToOpaqueArgb
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TagColor
import ch.nicolab.cadence.tasks.model.TagColors
import ch.nicolab.cadence.tasks.model.TagItem

/** Couleur de pastille d'une étiquette (clair), calculée une fois par liste : propre, héritée du parent ou dérivée du nom. */
internal fun tagBadgeColors(tags: List<TagItem>): Map<String, Color> =
    TagColors.byUid(tags).entries.associate { (uid, color) -> uid to Color(color.lightArgb) }

/** Même couleurs, par nom d'étiquette (les badges de la fiche ne connaissent que les noms). */
internal fun tagBadgeColorsByName(tags: List<TagItem>): Map<String, Color> {
    val byUid = tagBadgeColors(tags)
    return tags.associate { it.name to byUid.getValue(it.uid) }
}

/** Pastille ronde d'une couleur d'étiquette, sans texte. */
@Composable
internal fun TagDot(color: Color, size: androidx.compose.ui.unit.Dp = 10.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color))
}

/** Valeur d'une ligne « Couleur » : la pastille de la couleur en vigueur, ou « Automatique » quand rien n'est choisi. */
@Composable
internal fun TagColorValue(tag: TagItem, resolved: TagColor) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        if (tag.color == null) {
            Text(stringResource(R.string.tasks_color_auto), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
        }
        TagDot(Color(resolved.lightArgb), 16.dp)
    }
}

/**
 * Choix de la couleur d'une étiquette : chaque teinte du jeu partagé en trois nuances, un code hex libre, et
 * « Automatique » (couleur du parent ou dérivée du nom). Un choix l'enregistre et ferme la feuille.
 */
@Composable
internal fun TagColorSheet(tag: TagItem, automatic: TagColor, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val current = tag.color?.lowercase()
    var hex by rememberSaveable(tag.uid) { mutableStateOf(current.orEmpty()) }
    val parsed = hexToOpaqueArgb(hex)
    CadenceSheet(title = stringResource(R.string.tasks_edit_color), subtitle = tag.name, dismiss = onDismiss) {
        Row(
            Modifier.clickable(role = Role.Button) {
                onPick(null)
                onDismiss()
            }.height(48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.md),
        ) {
            TagDot(Color(automatic.lightArgb), 20.dp)
            Text(
                stringResource(R.string.tasks_color_auto),
                style = MaterialTheme.typography.bodyLarge,
                color = cadence.onSurface,
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            (0..2).forEach { shade ->
                TagColors.PALETTE.forEach { hue ->
                    val value = TagColors.shades(hue)[shade]
                    val selected = current == value
                    val label = stringResource(R.string.tasks_color_swatch, value)
                    Box(
                        Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Color(TagColors.argb(value)))
                            .then(if (selected) Modifier.border(BorderStroke(3.dp, cadence.onSurface), CircleShape) else Modifier)
                            .clickable(role = Role.RadioButton) {
                                onPick(value)
                                onDismiss()
                            }
                            .semantics { contentDescription = label },
                    )
                }
            }
        }
        Spacer(Modifier.height(Space.lg))
        CadenceField(
            value = hex,
            onValue = { hex = it },
            label = stringResource(R.string.tasks_color_hex),
            support = if (hex.isNotEmpty() && parsed == null) stringResource(R.string.tasks_color_hex_support) else null,
            accent = parsed?.let(::Color),
        )
        PrimaryAction(label = stringResource(R.string.tasks_color_apply), enabled = parsed != null) {
            onPick(hex.lowercase())
            onDismiss()
        }
        if (tag.color != null) TertiaryAction(label = stringResource(R.string.tasks_color_remove)) {
            onPick(null)
            onDismiss()
        }
    }
}

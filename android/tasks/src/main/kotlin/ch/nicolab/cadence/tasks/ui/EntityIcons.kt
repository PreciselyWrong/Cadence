package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import ch.nicolab.cadence.designsystem.theme.Size

/**
 * Jeu d'icônes des projets et des étiquettes. Il est partagé avec le web et les habitudes
 * (`HabitIconRegistry`, dans `:app`) : l'application fournit ici la résolution identifiant -> vecteur.
 * Un identifiant inconnu s'affiche avec l'icône par défaut du jeu.
 */
val LocalEntityIcons = staticCompositionLocalOf<(String) -> ImageVector?> { { null } }

/**
 * Sélecteur d'icône du jeu partagé (grille avec recherche et catégories), fourni par l'application comme
 * [LocalEntityIcons] ; null tant qu'elle n'en fournit pas, et les feuilles d'édition n'offrent alors pas l'icône.
 */
val LocalEntityIconPicker = staticCompositionLocalOf<(@Composable (selected: String?, onPick: (String) -> Unit) -> Unit)?> { null }

/** Icône choisie pour un projet ou une étiquette ; null quand aucune n'est posée (le repli reste celui de l'écran). */
@Composable
internal fun entityIcon(id: String?): ImageVector? = id?.takeIf { it.isNotBlank() }?.let { LocalEntityIcons.current(it) }

@Composable
internal fun EntityIcon(vector: ImageVector, tint: Color, modifier: Modifier = Modifier, size: Dp = Size.icon) {
    Icon(vector, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

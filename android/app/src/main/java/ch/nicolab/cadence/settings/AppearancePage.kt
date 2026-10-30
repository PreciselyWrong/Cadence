package ch.nicolab.cadence.settings

import android.os.Build
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Colorize
import androidx.compose.material.icons.outlined.Contrast
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Wallpaper
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.SettingToggleRow
import ch.nicolab.cadence.designsystem.components.onColorOf
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.AccentChoice
import ch.nicolab.cadence.designsystem.theme.AccentPreset
import ch.nicolab.cadence.designsystem.theme.Appearance
import ch.nicolab.cadence.designsystem.theme.CadencePalette
import ch.nicolab.cadence.designsystem.theme.DarkPalette
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.ThemeMode
import ch.nicolab.cadence.designsystem.theme.argbHue
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.hexToOpaqueArgb
import ch.nicolab.cadence.designsystem.theme.hueToArgb
import ch.nicolab.cadence.designsystem.theme.opaqueArgbToHex
import ch.nicolab.cadence.designsystem.theme.rememberAppearanceStore
import ch.nicolab.cadence.designsystem.theme.rememberStoredAppearance
import ch.nicolab.cadence.designsystem.theme.seedArgb

private val PreviewHeight = 104.dp
private val SwatchRing = 60.dp
private val SwatchesPerRow = 4

/** Ligne « Apparence » de Réglages : mode et accent courants, par exemple « Système · Violet ». */
@Composable
internal fun appearanceSummary(appearance: Appearance): String {
    val mode = stringResource(appearance.themeMode.labelRes())
    val accent = when {
        appearance.materialYou -> stringResource(R.string.settings_accent_material_you)
        else -> when (val accent = appearance.accent) {
            is AccentChoice.Preset -> stringResource(accent.preset.labelRes())
            is AccentChoice.Custom -> stringResource(R.string.settings_accent_custom)
        }
    }
    return stringResource(R.string.settings_appearance_subtitle, mode, accent)
}

/** Contenu de la sous-page Apparence : thème, accent, couleur libre et options. */
@Composable
internal fun AppearanceSettings() {
    val store = rememberAppearanceStore()
    val appearance = rememberStoredAppearance()
    // Lit la valeur stockée avant d'écrire : une écriture ne peut pas réutiliser un état périmé.
    fun update(change: (Appearance) -> Appearance) = store.write(change(store.read()))

    Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
        Column {
            SectionHeader(stringResource(R.string.settings_appearance_theme))
            Spacer(Modifier.height(Space.md))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                ThemeMode.entries.forEach { mode ->
                    ThemeTile(
                        mode = mode,
                        selected = appearance.themeMode == mode,
                        modifier = Modifier.weight(1f),
                        onSelect = { update { it.copy(themeMode = mode) } },
                    )
                }
            }
        }

        Column {
            SectionHeader(
                title = stringResource(R.string.settings_appearance_accent),
                actionLabel = stringResource(R.string.settings_appearance_accent_default),
                onAction = { update { it.copy(accent = AccentChoice.Preset(AccentPreset.VIOLET), materialYou = false) } },
            )
            Spacer(Modifier.height(Space.md))
            AccentPreset.entries.chunked(SwatchesPerRow).forEach { row ->
                Row(Modifier.fillMaxWidth()) {
                    row.forEach { preset ->
                        val selected = !appearance.materialYou && appearance.accent == AccentChoice.Preset(preset)
                        AccentSwatch(
                            preset = preset,
                            selected = selected,
                            modifier = Modifier.weight(1f),
                            onSelect = { update { it.copy(accent = AccentChoice.Preset(preset), materialYou = false) } },
                        )
                    }
                }
                Spacer(Modifier.height(Space.md))
            }
        }

        AppearanceOptions(appearance = appearance, update = ::update)
    }
}

@Composable
private fun AppearanceOptions(appearance: Appearance, update: ((Appearance) -> Appearance) -> Unit) {
    var freeColourOpen by rememberSaveable { mutableStateOf(false) }
    val materialYouAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    RowGroup {
        SettingRow(
            title = stringResource(R.string.settings_free_colour),
            subtitle = stringResource(R.string.settings_free_colour_subtitle),
            icon = Icons.Outlined.Colorize,
            shape = rowGroupShape(0, 3),
            trailing = { Icon(Icons.Outlined.Palette, null, tint = cadence.primary, modifier = Modifier.size(Size.icon)) },
            onClick = { freeColourOpen = true },
        )
        SettingToggleRow(
            title = stringResource(R.string.settings_material_you),
            subtitle = stringResource(R.string.settings_material_you_subtitle),
            icon = Icons.Outlined.Wallpaper,
            checked = appearance.materialYou && materialYouAvailable,
            onCheckedChange = { checked -> update { it.copy(materialYou = checked) } },
            shape = rowGroupShape(1, 3),
            enabled = materialYouAvailable,
        )
        SettingToggleRow(
            title = stringResource(R.string.settings_pure_black),
            subtitle = stringResource(R.string.settings_pure_black_subtitle),
            icon = Icons.Outlined.Contrast,
            checked = appearance.pureBlack,
            onCheckedChange = { checked -> update { it.copy(pureBlack = checked) } },
            shape = rowGroupShape(2, 3),
        )
    }

    if (freeColourOpen) {
        FreeColourDialog(
            initialArgb = appearance.accent.seedArgb,
            onDismiss = { freeColourOpen = false },
            onConfirm = { argb ->
                update { it.copy(accent = AccentChoice.Custom(argb), materialYou = false) }
                freeColourOpen = false
            },
        )
    }
}

/** Sélecteur de couleur libre : curseur de teinte et code hex `#RRGGBB`, synchronisés. */
@Composable
private fun FreeColourDialog(initialArgb: Int, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var hex by rememberSaveable { mutableStateOf(opaqueArgbToHex(initialArgb)) }
    var hue by rememberSaveable { mutableFloatStateOf(argbHue(initialArgb)) }
    val parsed = hexToOpaqueArgb(hex)
    val preview = Color(parsed ?: hueToArgb(hue))

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_free_colour_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Space.lg)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                    Box(Modifier.size(Size.control).clip(CircleShape).background(preview))
                    CadenceField(
                        value = hex,
                        onValue = { value ->
                            hex = value
                            hexToOpaqueArgb(value)?.let { hue = argbHue(it) }
                        },
                        label = stringResource(R.string.settings_free_colour_hex),
                        modifier = Modifier.weight(1f),
                        support = if (parsed == null) stringResource(R.string.settings_free_colour_hex_support) else null,
                        accent = preview,
                    )
                }
                Column {
                    Text(stringResource(R.string.settings_free_colour_hue), style = MaterialTheme.typography.labelMedium, color = cadence.outline)
                    Slider(
                        value = hue,
                        onValueChange = { value ->
                            hue = value
                            hex = opaqueArgbToHex(hueToArgb(value))
                        },
                        valueRange = 0f..360f,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null, onClick = { parsed?.let(onConfirm) }) {
                Text(stringResource(R.string.quick_btn_validate))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.form_btn_cancel)) }
        },
    )
}

@Composable
private fun ThemeTile(mode: ThemeMode, selected: Boolean, modifier: Modifier, onSelect: () -> Unit) {
    val palette = cadence
    val tint = if (selected) palette.primary else palette.onSurface
    Column(
        modifier
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ThemePreview(mode = mode, selected = selected)
        Spacer(Modifier.height(Space.sm))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(mode.icon(), null, tint = tint, modifier = Modifier.size(Size.iconSm))
            Spacer(Modifier.width(Space.xs))
            Text(stringResource(mode.labelRes()), style = MaterialTheme.typography.labelLarge, color = tint)
        }
    }
}

/** Aperçu schématique : deux barres et une pastille d'accent, sur fond clair, sombre ou partagé. */
@Composable
private fun ThemePreview(mode: ThemeMode, selected: Boolean) {
    val palette = cadence
    val border = if (selected) Modifier.border(Size.stroke, palette.primary, Radius.Card) else Modifier
    Row(
        Modifier
            .fillMaxWidth()
            .height(PreviewHeight)
            .clip(Radius.Card)
            .then(border),
    ) {
        when (mode) {
            ThemeMode.SYSTEM -> {
                MiniScreen(LightPalette, Modifier.weight(1f).fillMaxSize())
                MiniScreen(DarkPalette, Modifier.weight(1f).fillMaxSize())
            }
            ThemeMode.LIGHT -> MiniScreen(LightPalette, Modifier.weight(1f).fillMaxSize())
            ThemeMode.DARK -> MiniScreen(DarkPalette, Modifier.weight(1f).fillMaxSize())
        }
    }
}

@Composable
private fun MiniScreen(palette: CadencePalette, modifier: Modifier) {
    Column(
        modifier.background(palette.background).padding(Space.md),
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        Box(Modifier.width(Space.xl).height(Space.xs).clip(Radius.Pill).background(palette.onSurfaceVariant))
        Spacer(Modifier.height(Space.xs))
        Box(Modifier.fillMaxWidth().height(Space.xl).clip(Radius.Chip).background(palette.containerHigh))
        Box(Modifier.fillMaxWidth().height(Space.xl).clip(Radius.Chip).background(palette.containerHigh))
        Box(Modifier.width(Space.xxl).height(Space.sm).clip(Radius.Pill).background(palette.primary))
    }
}

@Composable
private fun AccentSwatch(preset: AccentPreset, selected: Boolean, modifier: Modifier, onSelect: () -> Unit) {
    val palette = cadence
    val color = Color(preset.argb)
    Column(
        modifier.selectable(selected = selected, role = Role.RadioButton, onClick = onSelect),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(SwatchRing)
                .then(if (selected) Modifier.border(Size.stroke, palette.onSurface, CircleShape) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(Size.control).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
                if (selected) {
                    Icon(Icons.Rounded.Check, null, tint = onColorOf(color), modifier = Modifier.size(Size.icon))
                }
            }
        }
        Text(stringResource(preset.labelRes()), style = MaterialTheme.typography.labelMedium, color = palette.onSurface)
    }
}

private fun ThemeMode.icon(): ImageVector = when (this) {
    ThemeMode.SYSTEM -> Icons.Outlined.Settings
    ThemeMode.LIGHT -> Icons.Outlined.LightMode
    ThemeMode.DARK -> Icons.Outlined.DarkMode
}

@StringRes
private fun ThemeMode.labelRes(): Int = when (this) {
    ThemeMode.SYSTEM -> R.string.settings_theme_system
    ThemeMode.LIGHT -> R.string.settings_theme_light
    ThemeMode.DARK -> R.string.settings_theme_dark
}

@StringRes
private fun AccentPreset.labelRes(): Int = when (this) {
    AccentPreset.VIOLET -> R.string.settings_accent_violet
    AccentPreset.INDIGO -> R.string.settings_accent_indigo
    AccentPreset.BLEU -> R.string.settings_accent_bleu
    AccentPreset.SARCELLE -> R.string.settings_accent_sarcelle
    AccentPreset.VERT -> R.string.settings_accent_vert
    AccentPreset.AMBRE -> R.string.settings_accent_ambre
    AccentPreset.CORAIL -> R.string.settings_accent_corail
    AccentPreset.ROSE -> R.string.settings_accent_rose
}

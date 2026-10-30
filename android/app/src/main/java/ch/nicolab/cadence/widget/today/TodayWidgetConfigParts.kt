package ch.nicolab.cadence.widget.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.argbHue
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.hexToOpaqueArgb
import ch.nicolab.cadence.designsystem.theme.hueToArgb
import ch.nicolab.cadence.designsystem.theme.opaqueArgbToHex
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem

/** Couleur libre : curseur de teinte et code `#RRGGBB` synchronisés, appliqués à chaque changement valide. */
@Composable
internal fun FreeColourPicker(argb: Int, onChange: (Int) -> Unit) {
    var hex by rememberSaveable { mutableStateOf(opaqueArgbToHex(argb)) }
    var hue by rememberSaveable { mutableFloatStateOf(argbHue(argb)) }
    val parsed = hexToOpaqueArgb(hex)
    val shown = Color(parsed ?: argb)
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            Box(Modifier.size(Size.control).clip(CircleShape).background(shown))
            CadenceField(
                value = hex,
                onValue = { value ->
                    hex = value
                    hexToOpaqueArgb(value)?.let {
                        hue = argbHue(it)
                        onChange(it)
                    }
                },
                label = stringResource(R.string.settings_free_colour_hex),
                modifier = Modifier.weight(1f),
                support = if (parsed == null) stringResource(R.string.settings_free_colour_hex_support) else null,
                accent = shown,
            )
        }
        Text(stringResource(R.string.settings_free_colour_hue), style = MaterialTheme.typography.labelMedium, color = cadence.outline)
        Slider(
            value = hue,
            onValueChange = { value ->
                hue = value
                val picked = hueToArgb(value)
                hex = opaqueArgbToHex(picked)
                onChange(picked)
            },
            valueRange = 0f..360f,
        )
    }
}

/** Filtres de projets et d'étiquettes : aucune puce choisie signifie « tous ». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FilterChips(
    projects: List<ProjectItem>,
    tags: List<TagItem>,
    config: TodayWidgetConfig,
    onChange: (TodayWidgetConfig) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        if (projects.isNotEmpty()) {
            Text(stringResource(R.string.today_config_filter_projects), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                projects.forEach { project ->
                    ChoiceChip(
                        label = project.name,
                        selected = project.uid in config.projectUids,
                        accent = project.color?.let(::parseHex)?.let(::Color),
                    ) {
                        onChange(config.copy(projectUids = config.projectUids.toggled(project.uid)))
                    }
                }
            }
        }
        if (tags.isNotEmpty()) {
            Text(stringResource(R.string.today_config_filter_tags), style = MaterialTheme.typography.bodySmall, color = cadence.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                tags.forEach { tag ->
                    ChoiceChip(label = "#${tag.name}", selected = tag.uid in config.tagUids) {
                        onChange(config.copy(tagUids = config.tagUids.toggled(tag.uid)))
                    }
                }
            }
        }
    }
}

private fun Set<String>.toggled(id: String): Set<String> = if (id in this) this - id else this + id

private fun parseHex(hex: String): Int? = runCatching { android.graphics.Color.parseColor(hex) }.getOrNull()

/** Aperçu vivant du widget : mêmes teintes, rayon et couleur de contrôle que le rendu, sur un fond de couleur qui laisse voir la translucidité. */
@Composable
internal fun WidgetPreviewBand(config: TodayWidgetConfig) {
    val palette = remember(config) { TodayPalette.of(config) }
    val text = TodayTextSizes.of(config.textSize)
    val shape = RoundedCornerShape(config.cornerRadiusDp.dp)
    val ink = Color(palette.ink)
    val muted = Color(palette.muted)
    val accent = Color(palette.accent)
    val wallpaper = Brush.linearGradient(listOf(Color(0xFF3A5BA0), Color(0xFFB4567C), Color(0xFFE9A15B)))
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(Size.control)).background(wallpaper).padding(Space.md)) {
        Column(
            Modifier.fillMaxWidth().clip(shape).background(Color(palette.surface)).background(Color(palette.veil)).padding(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(scopeTitle(config.taskScope)),
                    color = ink,
                    fontSize = text.title.sp,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                Text(PREVIEW_COUNT.toString(), color = muted, fontSize = text.small.sp)
                Box(Modifier.width(8.dp))
                PreviewIcon("+", accent, config.discreteButtons)
            }
            Box(Modifier.height(6.dp))
            listOf(R.string.today_config_preview_task_1, R.string.today_config_preview_task_2).forEach { name ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (config.projectRail) {
                        Box(Modifier.width(3.dp).height(20.dp).clip(RoundedCornerShape(2.dp)).background(accent))
                        Box(Modifier.width(6.dp))
                    }
                    Box(Modifier.size(22.dp).border(2.dp, accent, RoundedCornerShape(6.dp)))
                    Text(stringResource(name), color = ink, fontSize = text.body.sp, maxLines = 1, modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun PreviewIcon(glyph: String, accent: Color, discrete: Boolean) {
    val base = Modifier.size(30.dp).clip(CircleShape)
    Box(if (discrete) base else base.background(accent.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
        Text(glyph, color = accent, fontSize = 20.sp)
    }
}

private const val PREVIEW_COUNT = 2

package ch.nicolab.cadence.settings

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence

private val PreviewWidth = 120.dp
private val PreviewHeight = 72.dp
private const val DP_TO_PREVIEW = 0.5f

/** Un widget Cadence installable, ses exemplaires placés et son écran de configuration. */
internal data class WidgetKind(
    val info: AppWidgetProviderInfo,
    val label: String,
    val placedIds: List<Int>,
)

/** Fournisseurs de widgets de l'application, avec les exemplaires que l'utilisateur a placés. */
internal fun widgetKinds(context: Context): List<WidgetKind> {
    val manager = AppWidgetManager.getInstance(context)
    return manager.getInstalledProvidersForPackage(context.packageName, null)
        .map { info ->
            WidgetKind(info, info.loadLabel(context.packageManager), manager.getAppWidgetIds(info.provider).toList())
        }
        .sortedBy { it.label }
}

/** Ouvre l'écran de configuration d'un exemplaire placé. */
internal fun configureWidget(context: Context, kind: WidgetKind, appWidgetId: Int) {
    val configure = kind.info.configure ?: return
    context.startActivity(
        Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
            .setComponent(configure)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}

/**
 * Page Réglages › Widgets : chaque widget avec son aperçu, ses exemplaires placés (bouton
 * Configurer) et, quand le lanceur le permet, un bouton qui propose de le poser sur l'accueil.
 */
@Composable
internal fun WidgetsSettings() {
    val context = LocalContext.current
    var refresh by remember { mutableIntStateOf(0) }
    // Un widget posé ou retiré depuis le lanceur n'émet rien : on relit au retour dans l'application.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { refresh++ }
    val kinds = remember(refresh) { widgetKinds(context) }
    val canPin = remember { AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported }
    Column(verticalArrangement = Arrangement.spacedBy(Space.md)) {
        Text(
            stringResource(R.string.settings_widget_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = cadence.onSurfaceVariant,
        )
        kinds.forEach { kind -> WidgetCard(kind, canPin) }
    }
}

@Composable
private fun WidgetCard(kind: WidgetKind, canPin: Boolean) {
    val context = LocalContext.current
    val palette = cadence
    Panel {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            WidgetPreview(kind)
            Spacer(Modifier.width(Space.lg))
            Column(Modifier.weight(1f)) {
                Text(kind.label, style = MaterialTheme.typography.titleMedium, color = palette.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    if (kind.placedIds.isEmpty()) {
                        stringResource(R.string.settings_widget_none_placed)
                    } else {
                        pluralStringResource(R.plurals.settings_widget_placed, kind.placedIds.size, kind.placedIds.size)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant,
                )
            }
        }
        if (kind.info.configure != null) {
            kind.placedIds.forEachIndexed { index, id ->
                Spacer(Modifier.height(Space.md))
                SecondaryAction(
                    if (kind.placedIds.size == 1) stringResource(R.string.settings_widget_configure) else stringResource(R.string.settings_widget_configure_numbered, index + 1),
                    Modifier.fillMaxWidth(),
                ) { configureWidget(context, kind, id) }
            }
        }
        if (canPin) {
            Spacer(Modifier.height(Space.md))
            PrimaryAction(stringResource(R.string.settings_widget_pin), Modifier.fillMaxWidth()) {
                AppWidgetManager.getInstance(context).requestPinAppWidget(kind.info.provider, null, null)
            }
        }
    }
}

/**
 * Aperçu du widget : l'image du fournisseur quand il en déclare une, sinon un gabarit à ses
 * proportions (taille minimale déclarée) avec son icône.
 */
@Composable
private fun WidgetPreview(kind: WidgetKind) {
    val context = LocalContext.current
    val palette = cadence
    val image = remember(kind.info) {
        runCatching { kind.info.loadPreviewImage(context, 0)?.toBitmap()?.asImageBitmap() }.getOrNull()
    }
    val icon = remember(kind.info) { runCatching { kind.info.loadIcon(context, 0).toBitmap().asImageBitmap() }.getOrNull() }
    val widthDp = (kind.info.minWidth * DP_TO_PREVIEW).coerceIn(48f, PreviewWidth.value).dp
    val heightDp = (kind.info.minHeight * DP_TO_PREVIEW).coerceIn(32f, PreviewHeight.value).dp
    Box(
        Modifier
            .size(PreviewWidth, PreviewHeight),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(widthDp, heightDp)
                .clip(Radius.Control)
                .background(palette.primaryContainer)
                .border(Size.hairline, palette.outlineVariant, Radius.Control),
            contentAlignment = Alignment.Center,
        ) {
            when {
                image != null -> Image(image, null, Modifier.fillMaxWidth(), contentScale = ContentScale.Fit)
                icon != null -> Image(icon, null, Modifier.size(Size.iconLarge))
            }
        }
    }
}

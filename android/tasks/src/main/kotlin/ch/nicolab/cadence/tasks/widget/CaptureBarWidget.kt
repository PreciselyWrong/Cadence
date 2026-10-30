package ch.nicolab.cadence.tasks.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity

/** Barre de capture 4×1 : marque Cadence et « Nouvelle tâche… », puis idée et dictée vers la boîte. */
class CaptureBarWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { CaptureBar() }
    }
}

class CaptureBarWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CaptureBarWidget()
}

@Composable
private fun CaptureBar() {
    val context = LocalContext.current
    GlanceTheme {
        Row(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.widgetBackground)
                .cornerRadius(28.dp)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Row(
                modifier = GlanceModifier
                    .defaultWeight()
                    .fillMaxHeight()
                    .background(GlanceTheme.colors.surfaceVariant)
                    .cornerRadius(22.dp)
                    .padding(horizontal = 12.dp)
                    .clickable(actionStartActivity<TaskQuickAddActivity>()),
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Image(
                    provider = ImageProvider(DesignR.drawable.ic_widget_mark),
                    contentDescription = null,
                    modifier = GlanceModifier.size(22.dp),
                    colorFilter = ColorFilter.tint(GlanceTheme.colors.primary),
                )
                Box(GlanceModifier.width(10.dp)) {}
                Text(
                    context.getString(R.string.tasks_capture_new_task),
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 15.sp, fontWeight = FontWeight.Medium),
                )
            }
            Box(GlanceModifier.width(6.dp)) {}
            BarButton(context.getString(R.string.tasks_capture_idea), actionStartActivityIntent(CaptureActivity.ideaIntent(context)))
            Box(GlanceModifier.width(6.dp)) {}
            BarButton(context.getString(R.string.tasks_capture_dictate), actionStartActivityIntent(CaptureActivity.dictateIntent(context)))
        }
    }
}

@Composable
private fun BarButton(label: String, action: Action) {
    Box(
        modifier = GlanceModifier
            .width(64.dp)
            .fillMaxHeight()
            .background(GlanceTheme.colors.primaryContainer)
            .cornerRadius(22.dp)
            .clickable(action),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onPrimaryContainer, fontSize = 13.sp, fontWeight = FontWeight.Bold),
        )
    }
}

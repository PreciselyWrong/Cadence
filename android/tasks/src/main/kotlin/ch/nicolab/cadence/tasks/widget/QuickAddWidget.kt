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
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity

/** Bouton 1×1 « Ajouter » : la marque Cadence, un appui ouvre l'ajout de tâche. */
class QuickAddWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { QuickAddButton() }
    }
}

class QuickAddWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickAddWidget()
}

@Composable
private fun QuickAddButton() {
    GlanceTheme {
        Box(
            modifier = GlanceModifier
                .fillMaxSize()
                .padding(4.dp)
                .background(GlanceTheme.colors.primary)
                .cornerRadius(20.dp)
                .clickable(actionStartActivity<TaskQuickAddActivity>()),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                Image(
                    provider = ImageProvider(DesignR.drawable.ic_widget_mark),
                    contentDescription = null,
                    modifier = GlanceModifier.size(28.dp),
                    colorFilter = ColorFilter.tint(GlanceTheme.colors.onPrimary),
                )
                Text(
                    LocalContext.current.getString(R.string.tasks_quick_add_widget_button),
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold),
                )
            }
        }
    }
}

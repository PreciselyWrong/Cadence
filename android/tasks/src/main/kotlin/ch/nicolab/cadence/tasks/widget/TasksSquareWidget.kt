package ch.nicolab.cadence.tasks.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.first

/** Widget 2×2 : les tâches du jour, cases à cocher, et un bouton d'ajout. */
class TasksSquareWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = TasksGraph.repository(context)
        val initial = repository.observeTasks().first()
        provideContent {
            val tasks by repository.observeTasks().collectAsState(initial)
            val today = LocalDate.now(ZoneId.systemDefault())
            val rows = TaskViews.today(tasks, today, Instant.now())
            SquareContent(rows)
        }
    }
}

class TasksSquareWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TasksSquareWidget()
}

@Composable
private fun SquareContent(rows: List<TaskItem>) {
    val context = LocalContext.current
    GlanceTheme {
        androidx.glance.layout.Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.widgetBackground)
                .cornerRadius(24.dp)
                .padding(12.dp),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
                Image(
                    provider = ImageProvider(DesignR.drawable.ic_widget_mark),
                    contentDescription = null,
                    modifier = GlanceModifier.size(18.dp),
                    colorFilter = ColorFilter.tint(GlanceTheme.colors.primary),
                )
                Text(
                    context.getString(R.string.tasks_widget_title),
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold),
                    modifier = GlanceModifier.defaultWeight().padding(start = 6.dp),
                )
                Text(
                    rows.size.toString(),
                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium),
                )
                Box(GlanceModifier.width(6.dp)) {}
                Box(
                    modifier = GlanceModifier
                        .size(28.dp)
                        .background(GlanceTheme.colors.primary)
                        .cornerRadius(14.dp)
                        .clickable(actionStartActivity<TaskQuickAddActivity>()),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "+",
                        style = TextStyle(color = GlanceTheme.colors.onPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold),
                    )
                }
            }
            if (rows.isEmpty()) {
                Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        context.getString(R.string.tasks_widget_empty),
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp),
                    )
                }
            } else {
                LazyColumn(modifier = GlanceModifier.padding(top = 6.dp)) {
                    items(rows, itemId = { it.uid.hashCode().toLong() }) { task -> SquareRow(task) }
                }
            }
        }
    }
}

@Composable
private fun SquareRow(task: TaskItem) {
    val open = openTaskIntent(LocalContext.current, task.uid)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(20.dp)
                .background(GlanceTheme.colors.outline)
                .cornerRadius(6.dp)
                .clickable(actionRunCallback<CompleteTaskAction>(actionParametersOf(taskUidKey to task.uid))),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = GlanceModifier
                    .size(16.dp)
                    .background(GlanceTheme.colors.widgetBackground)
                    .cornerRadius(4.dp),
            ) {}
        }
        Text(
            task.name,
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp),
            modifier = GlanceModifier
                .defaultWeight()
                .padding(start = 8.dp)
                .then(if (open != null) GlanceModifier.clickable(actionStartActivityIntent(open)) else GlanceModifier),
        )
    }
}

package ch.nicolab.cadence.tasks.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.first

private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
private val dateFormat = DateTimeFormatter.ofPattern("d MMM", tasksLocale)

internal val taskUidKey = ActionParameters.Key<String>("task_uid")

class TasksWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = TasksGraph.repository(context)
        val initial = repository.observeTasks().first()
        provideContent {
            // Observé dans la composition : une session ouverte se recompose à chaque
            // écriture, alors qu'une lecture unique figerait la liste jusqu'à sa fermeture.
            val tasks by repository.observeTasks().collectAsState(initial)
            val zone = ZoneId.systemDefault()
            val now = Instant.now()
            val today = LocalDate.now(zone)
            val overdueUids = TaskViews.overdue(tasks, today, now).mapTo(hashSetOf()) { it.uid }
            // Tri stable : les tâches en retard passent devant, l'ordre de TaskViews reste à l'intérieur.
            val rows = TaskViews.today(tasks, today, now).sortedBy { it.uid !in overdueUids }
            TasksWidgetContent(rows, overdueUids, today, zone)
        }
    }
}

class TasksWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TasksWidget()
}

class CompleteTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val uid = parameters[taskUidKey] ?: return
        TasksGraph.repository(context).completeTask(uid)
        TasksWidget().updateAll(context)
        TasksSquareWidget().updateAll(context)
    }
}

@Composable
private fun TasksWidgetContent(
    rows: List<TaskItem>,
    overdueUids: Set<String>,
    today: LocalDate,
    zone: ZoneId,
) {
    GlanceTheme {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.widgetBackground)
                .cornerRadius(20.dp)
                .padding(12.dp),
        ) {
            WidgetHeader(count = rows.size)
            Box(modifier = GlanceModifier.height(8.dp)) {}
            if (rows.isEmpty()) {
                Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        LocalContext.current.getString(R.string.tasks_widget_empty),
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 14.sp),
                    )
                }
            } else {
                LazyColumn {
                    items(rows, itemId = { it.uid.hashCode().toLong() }) { task ->
                        TaskRow(task, overdue = task.uid in overdueUids, today = today, zone = zone)
                    }
                }
            }
        }
    }
}

@Composable
private fun WidgetHeader(count: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
        Text(
            LocalContext.current.getString(R.string.tasks_widget_title),
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            count.toString(),
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 14.sp, fontWeight = FontWeight.Medium),
        )
        Box(modifier = GlanceModifier.width(8.dp)) {}
        Box(
            modifier = GlanceModifier
                .size(32.dp)
                .background(GlanceTheme.colors.primary)
                .cornerRadius(16.dp)
                .clickable(actionStartActivity<TaskQuickAddActivity>()),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "+",
                style = TextStyle(color = GlanceTheme.colors.onPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold),
            )
        }
    }
}

@Composable
private fun TaskRow(task: TaskItem, overdue: Boolean, today: LocalDate, zone: ZoneId) {
    val context = LocalContext.current
    val open = openTaskIntent(context, task.uid)
    val dueLabel = dueLabel(task, today, zone)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        CompletionCircle(task.uid)
        Column(
            modifier = GlanceModifier
                .defaultWeight()
                .padding(start = 10.dp)
                .then(if (open != null) GlanceModifier.clickable(actionStartActivityIntent(open)) else GlanceModifier),
        ) {
            Text(
                task.name,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 15.sp),
            )
            dueLabel?.let {
                Text(
                    it,
                    maxLines = 1,
                    style = TextStyle(
                        color = if (overdue) GlanceTheme.colors.error else GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = if (overdue) FontWeight.Medium else null,
                    ),
                )
            }
        }
    }
}

/** Anneau cliquable : termine la tâche sans l'ouvrir. */
@Composable
private fun CompletionCircle(uid: String) {
    Box(
        modifier = GlanceModifier
            .size(24.dp)
            .background(GlanceTheme.colors.outline)
            .cornerRadius(12.dp)
            .clickable(actionRunCallback<CompleteTaskAction>(actionParametersOf(taskUidKey to uid))),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = GlanceModifier
                .size(20.dp)
                .background(GlanceTheme.colors.widgetBackground)
                .cornerRadius(10.dp),
        ) {}
    }
}

/** Date ou heure utiles : la date seule quand elle n'est pas aujourd'hui, l'heure si elle existe. */
private fun dueLabel(task: TaskItem, today: LocalDate, zone: ZoneId): String? {
    val due = task.dueDay ?: return null
    val day = if (due == today) null else due.format(dateFormat)
    val time = if (task.dueHasTime) task.dueDate?.atZone(zone)?.format(timeFormat) else null
    return listOfNotNull(day, time).joinToString(" ").ifEmpty { null }
}

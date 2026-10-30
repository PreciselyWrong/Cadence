package ch.nicolab.cadence.widget.today

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
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
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.calendar.localStart
import ch.nicolab.cadence.domain.WidgetGroupMode
import ch.nicolab.cadence.domain.WidgetGroupSelection
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity
import ch.nicolab.cadence.widget.WidgetHabit
import ch.nicolab.cadence.widget.WidgetHabitPresentation
import ch.nicolab.cadence.widget.pendingWidgetHabits
import ch.nicolab.cadence.widget.renderHabitFacet
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val taskUidKey = ActionParameters.Key<String>("today_task_uid")
private val appWidgetIdKey = ActionParameters.Key<Int>("today_app_widget_id")
private val habitIdKey = ActionParameters.Key<String>(QuickEntryActivity.EXTRA_HABIT_ID)

/** Facette d'habitude prête à dessiner : le bitmap est rendu hors composition. */
private data class FacetView(val habit: WidgetHabit, val bitmap: Bitmap)

/**
 * Widget « Aujourd'hui » : tâches du périmètre choisi, événements des agendas affichés sur le
 * widget, et habitudes en facettes. Chaque instance a ses réglages ([TodayWidgetConfigStore]).
 */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val app = context.applicationContext as CadenceApp
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        val config = TodayWidgetConfigStore(context).load(appWidgetId)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val now = Instant.now()

        val tasksRepository = TasksGraph.repository(context)
        val tasks = tasksRepository.observeTasks().first()
        val projects = tasksRepository.observeProjects().first().associateBy { it.uid }
        val selection = selectWidgetTasks(tasks, eventsOf(context, config, today, zone), config, today, zone, now)
        val facets = if (config.habitPlacement == HabitPlacement.HIDDEN) {
            emptyList()
        } else {
            habitFacets(app, config, today, now, zone)
        }
        val view = TodayView(
            appWidgetId = appWidgetId,
            config = config,
            palette = TodayPalette.of(config),
            selection = selection,
            facets = facets,
            projects = projects,
            today = today,
            zone = zone,
        )
        provideContent { TodayContent(view) }
    }

    private suspend fun eventsOf(
        context: Context,
        config: TodayWidgetConfig,
        today: LocalDate,
        zone: ZoneId,
    ): List<EventWithDone> {
        if (!config.showEvents) return emptyList()
        val start = today.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        return CalendarGraph.repository(context).events(TimeRange(start, end), CalendarSurface.WIDGET).first()
    }

    private suspend fun habitFacets(
        app: CadenceApp,
        config: TodayWidgetConfig,
        today: LocalDate,
        now: Instant,
        zone: ZoneId,
    ): List<FacetView> {
        val pending = pendingWidgetHabits(app.repository, today, now, zone)
        val chosen = when (config.habitSelection) {
            HabitSelection.BY_TIME -> {
                val visibleGroups = WidgetGroupSelection.visibleGroupIds(
                    mode = WidgetGroupMode.AUTOMATIC,
                    groups = app.repository.getGroups(),
                    selectedGroupId = null,
                    time = LocalTime.now(),
                )
                visibleGroups?.let { ids -> pending.filter { it.habit.groupId in ids } } ?: pending
            }
            HabitSelection.ALL -> pending
            HabitSelection.CHOOSE -> pending.filter { it.habit.id in config.habitIds }
        }
        val ink = TodayPalette.of(config).ink
        return chosen.take(config.maxFacets).map { item ->
            val progress = WidgetHabitPresentation.progress(item.habit.goal, item.evaluation.progressMinor, item.evaluation.targetMinor)
            val colour = item.habit.colorArgb ?: TodayControlPalette.argb(config.controlColour, config.freeControlArgb) ?: ink
            FacetView(
                item,
                renderHabitFacet(
                    iconId = item.habit.iconId,
                    colorArgb = colour,
                    progress = progress,
                    badgeArgb = ink,
                    badgeAlpha = 0.1f,
                    iconSizeDp = FACET_ICON_DP,
                    opacity = 100,
                    saturation = 100,
                ),
            )
        }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        // Le contenu dépend du jour et de l'heure : ces signaux le redessinent.
        if (intent.action in DAY_SIGNALS) {
            val app = context.applicationContext as CadenceApp
            app.applicationScope.launch { TodayWidget().updateAll(context) }
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        TodayWidgetConfigStore(context).remove(appWidgetIds)
    }

    private companion object {
        val DAY_SIGNALS = setOf(Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)
    }
}

class CompleteTodayTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val uid = parameters[taskUidKey] ?: return
        TasksGraph.repository(context).completeTask(uid)
        TodayWidget().updateAll(context)
    }
}

private const val FACET_ICON_DP = 22

private class TodayView(
    val appWidgetId: Int,
    val config: TodayWidgetConfig,
    val palette: TodayPalette,
    val selection: TodaySelection,
    val facets: List<FacetView>,
    val projects: Map<String, ProjectItem>,
    val today: LocalDate,
    val zone: ZoneId,
)

@Composable
private fun TodayContent(view: TodayView) {
    val context = LocalContext.current
    val config = view.config
    val palette = view.palette
    val text = TodayTextSizes.of(config.textSize)
    val tasksShown = config.showTasks && (view.selection.tasks.isNotEmpty() || view.selection.overdue.isNotEmpty())
    val eventsShown = config.showEvents && view.selection.events.isNotEmpty()
    val habitsShown = view.facets.isNotEmpty()
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(ColorProvider(day = Color(palette.surface), night = Color(palette.surface)))
            .cornerRadius(config.cornerRadiusDp.dp),
    ) {
        Column(
            modifier = GlanceModifier.fillMaxSize()
                .background(ColorProvider(day = Color(palette.veil), night = Color(palette.veil)))
                .cornerRadius(config.cornerRadiusDp.dp)
                .padding(12.dp),
        ) {
            Header(view, text)
            Box(GlanceModifier.height(6.dp)) {}
            if (config.habitPlacement == HabitPlacement.ABOVE && habitsShown) HabitsRow(view, text)
            if (config.showTasks) {
                if (view.selection.overdue.isNotEmpty()) {
                    SectionLabel(context.getString(R.string.today_overdue_label, view.selection.overdueTotal), palette.overdue, text)
                    view.selection.overdue.forEach { TaskRowView(it, view, it.dueLabel(view), overdue = true, text) }
                }
                view.selection.tasks.forEach { TaskRowView(it, view, it.dueLabel(view), overdue = false, text) }
                if (!tasksShown && !eventsShown && !habitsShown) EmptyLabel(context.getString(R.string.today_widget_empty), text)
            }
            if (eventsShown) {
                view.selection.events.forEach { EventRowView(it, view, text) }
            }
            if (config.habitPlacement == HabitPlacement.BELOW && habitsShown) HabitsRow(view, text)
        }
    }
}

@Composable
private fun Header(view: TodayView, text: TodayTextSizes) {
    val context = LocalContext.current
    val palette = view.palette
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
        Text(
            context.getString(scopeTitle(view.config.taskScope)),
            maxLines = 1,
            style = TextStyle(color = ColorProvider(day = Color(palette.ink), night = Color(palette.ink)), fontSize = text.title.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            view.selection.total.toString(),
            style = TextStyle(color = ColorProvider(day = Color(palette.muted), night = Color(palette.muted)), fontSize = text.small.sp, fontWeight = FontWeight.Medium),
        )
        Box(GlanceModifier.width(8.dp)) {}
        IconButton(
            label = context.getString(R.string.today_widget_add),
            glyph = "+",
            view = view,
            action = actionStartActivity<TaskQuickAddActivity>(),
        )
        Box(GlanceModifier.width(4.dp)) {}
        IconButton(
            label = context.getString(R.string.today_widget_configure),
            glyph = "⋮",
            view = view,
            action = actionStartActivityIntent(configIntent(context, view.appWidgetId)),
        )
    }
}

@Composable
private fun IconButton(
    label: String,
    glyph: String,
    view: TodayView,
    action: Action,
) {
    val palette = view.palette
    val accent = Color(palette.accent)
    val discrete = view.config.discreteButtons
    Box(
        modifier = GlanceModifier.size(30.dp)
            .then(if (discrete) GlanceModifier else GlanceModifier.background(ColorProvider(day = accent.copy(alpha = 0.18f), night = accent.copy(alpha = 0.18f))).cornerRadius(15.dp))
            .clickable(action),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            glyph,
            style = TextStyle(color = ColorProvider(day = accent, night = accent), fontSize = 20.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun SectionLabel(text: String, colour: Int, sizes: TodayTextSizes) {
    Text(
        text,
        maxLines = 1,
        style = TextStyle(color = ColorProvider(day = Color(colour), night = Color(colour)), fontSize = sizes.small.sp, fontWeight = FontWeight.Medium),
        modifier = GlanceModifier.padding(top = 4.dp, bottom = 2.dp),
    )
}

@Composable
private fun EmptyLabel(text: String, sizes: TodayTextSizes) {
    Box(modifier = GlanceModifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(text, style = TextStyle(color = ColorProvider(day = Color(0x99808080), night = Color(0x99808080)), fontSize = sizes.body.sp))
    }
}

@Composable
private fun TaskRowView(task: TaskItem, view: TodayView, dueLabel: String?, overdue: Boolean, sizes: TodayTextSizes) {
    val palette = view.palette
    val config = view.config
    val projectArgb = task.projectUid?.let { view.projects[it]?.color }?.let(::parseColour)
    val accent = (if (config.controlColour == ControlColour.PROJET) projectArgb else null)
        ?: TodayControlPalette.argb(config.controlColour, config.freeControlArgb)
        ?: palette.accent
    val openIntent = Intent(LocalContext.current, MainActivity::class.java)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (config.projectRail) {
            val rail = projectArgb ?: palette.accent
            Box(modifier = GlanceModifier.width(3.dp).height(20.dp).background(ColorProvider(day = Color(rail), night = Color(rail))).cornerRadius(2.dp)) {}
            Box(GlanceModifier.width(6.dp)) {}
        }
        val checkbox = GlanceModifier.size(20.dp)
            .background(ColorProvider(day = Color(accent), night = Color(accent)))
            .cornerRadius(5.dp)
        Box(
            modifier = if (config.checkFromWidget) {
                checkbox.clickable(actionRunCallback<CompleteTodayTaskAction>(actionParametersOf(taskUidKey to task.uid)))
            } else {
                checkbox.clickable(actionStartActivityIntent(openIntent))
            },
        ) {}
        Column(
            modifier = GlanceModifier.defaultWeight().padding(start = 8.dp).clickable(actionStartActivityIntent(openIntent)),
        ) {
            Text(
                task.name,
                maxLines = 1,
                style = TextStyle(color = ColorProvider(day = Color(palette.ink), night = Color(palette.ink)), fontSize = sizes.body.sp),
            )
        }
        dueLabel?.let {
            val colour = if (overdue) palette.overdue else palette.muted
            Text(
                it,
                maxLines = 1,
                style = TextStyle(color = ColorProvider(day = Color(colour), night = Color(colour)), fontSize = sizes.small.sp, fontWeight = if (overdue) FontWeight.Medium else null),
            )
        }
    }
}

@Composable
private fun EventRowView(event: EventWithDone, view: TodayView, sizes: TodayTextSizes) {
    val palette = view.palette
    val time = if (event.event.allDay) {
        LocalContext.current.getString(R.string.today_event_all_day)
    } else {
        Instant.ofEpochMilli(event.event.localStart(view.zone)).atZone(view.zone).format(TIME_FORMAT)
    }
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Image(
            ImageProvider(android.R.drawable.ic_menu_today),
            contentDescription = event.event.title,
            modifier = GlanceModifier.size(16.dp),
        )
        Text(
            event.event.title,
            maxLines = 1,
            style = TextStyle(color = ColorProvider(day = Color(palette.ink), night = Color(palette.ink)), fontSize = sizes.body.sp),
            modifier = GlanceModifier.defaultWeight().padding(start = 8.dp),
        )
        Text(
            time,
            maxLines = 1,
            style = TextStyle(color = ColorProvider(day = Color(palette.muted), night = Color(palette.muted)), fontSize = sizes.small.sp),
        )
    }
}

@Composable
private fun HabitsRow(view: TodayView, sizes: TodayTextSizes) {
    val palette = view.palette
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(top = 6.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        view.facets.forEach { facet ->
            val habit = facet.habit
            val value = WidgetHabitPresentation.value(
                habit.habit.goal,
                habit.evaluation.progressMinor,
                habit.evaluation.targetMinor,
                habit.timerSeconds,
                habit.abstinenceElapsed,
                habit.alcoholSoberDays,
            )
            Column(
                modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity<QuickEntryActivity>(actionParametersOf(habitIdKey to habit.habit.id))),
                horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
            ) {
                Image(ImageProvider(facet.bitmap), habit.habit.name, modifier = GlanceModifier.size((FACET_ICON_DP + 10).dp))
                Text(
                    habit.habit.name,
                    maxLines = 1,
                    style = TextStyle(color = ColorProvider(day = Color(palette.ink), night = Color(palette.ink)), fontSize = sizes.small.sp, textAlign = TextAlign.Center),
                )
                Text(
                    value,
                    maxLines = 1,
                    style = TextStyle(color = ColorProvider(day = Color(palette.muted), night = Color(palette.muted)), fontSize = sizes.small.sp, textAlign = TextAlign.Center),
                )
            }
        }
    }
}

private fun TaskItem.dueLabel(view: TodayView): String? {
    val due = dueDay ?: return null
    val day = if (due == view.today) null else due.format(DAY_FORMAT)
    val time = if (dueHasTime) dueDate?.atZone(view.zone)?.format(TIME_FORMAT) else null
    return listOfNotNull(day, time).joinToString(" ").ifEmpty { null }
}

private fun parseColour(hex: String): Int? =
    runCatching { AndroidColor.parseColor(hex) }.getOrNull()

private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)

private fun configIntent(context: Context, appWidgetId: Int): Intent =
    Intent(context, TodayWidgetConfigActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

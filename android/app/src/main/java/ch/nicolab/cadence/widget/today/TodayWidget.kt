package ch.nicolab.cadence.widget.today

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.layout.ContentScale
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
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.unit.ColorProvider as GlanceColor
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
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
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.calendar.CalendarGraph
import ch.nicolab.cadence.calendar.CalendarSurface
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.calendar.EventWithDone
import ch.nicolab.cadence.calendar.TimeRange
import ch.nicolab.cadence.designsystem.theme.readableTint
import ch.nicolab.cadence.domain.WidgetGroupMode
import ch.nicolab.cadence.domain.WidgetGroupSelection
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagColor
import ch.nicolab.cadence.tasks.model.TagColors
import ch.nicolab.cadence.tasks.model.RelativeDay
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity
import ch.nicolab.cadence.tasks.ui.TodayItem
import ch.nicolab.cadence.tasks.widget.WidgetCompletions
import ch.nicolab.cadence.tasks.widget.WidgetTrace
import ch.nicolab.cadence.tasks.widget.openTaskIntent
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch

private val taskUidKey = ActionParameters.Key<String>("today_task_uid")
private val appWidgetIdKey = ActionParameters.Key<Int>("today_app_widget_id")
private val habitIdKey = ActionParameters.Key<String>(QuickEntryActivity.EXTRA_HABIT_ID)
private val eventCalendarKey = ActionParameters.Key<Long>("today_event_calendar")
private val eventIdKey = ActionParameters.Key<Long>("today_event_id")
private val eventBeginKey = ActionParameters.Key<Long>("today_event_begin")

/** Facette d'habitude prête à dessiner : le bitmap est rendu hors composition. */
private data class FacetView(val habit: WidgetHabit, val bitmap: Bitmap)

/**
 * Widget « Aujourd'hui » : tâches du périmètre choisi, événements des agendas affichés sur le
 * widget, et habitudes en facettes. Chaque instance a ses réglages ([TodayWidgetConfigStore]).
 *
 * Glance n'appelle [provideGlance] qu'une fois par session (45 s au moins) : un `update` reçu
 * pendant la session ne fait que recomposer. La vue est donc rechargée dans la composition, à
 * chaque écriture des sources qu'elle lit, sinon une tâche cochée resterait affichée jusqu'à la
 * session suivante.
 */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    @OptIn(FlowPreview::class)
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val app = context.applicationContext as CadenceApp
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        val marks = TodayMarks.render(context.resources.displayMetrics.density)
        val initial = loadView(app, appWidgetId, marks)
        val reloads = reloadSignals(app, showEvents = initial.config.showEvents, today = initial.today, zone = initial.zone)
            .debounce(RELOAD_QUIET_MS)
            .conflate()
            .map { loadView(app, appWidgetId, marks) }
            .flowOn(Dispatchers.IO)
        provideContent {
            val view by reloads.collectAsState(initial)
            val held by WidgetCompletions.held.collectAsState()
            if (held.isNotEmpty()) SideEffect { WidgetTrace.log { "today frame held=$held" } }
            TodayContent(view, held)
        }
    }

    private suspend fun loadView(app: CadenceApp, appWidgetId: Int, marks: TodayMarks): TodayView {
        val config = TodayWidgetConfigStore(app).load(appWidgetId)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val now = Instant.now()

        val tasksRepository = TasksGraph.repository(app)
        val tasks = tasksRepository.observeTasks().first()
        val projects = tasksRepository.observeProjects().first().associateBy { it.uid }
        val tagList = tasksRepository.observeTags().first()
        val tagNames = tagList.associate { it.uid to it.name }
        val tagColors = TagColors.byUid(tagList)
        val selection = selectWidgetTasks(tasks, eventsOf(app, config, today, zone), config, today, zone, now, tagList)
        val facets = if (config.habitPlacement == HabitPlacement.HIDDEN) {
            emptyList()
        } else {
            habitFacets(app, config, today, now, zone)
        }
        return TodayView(
            appWidgetId = appWidgetId,
            config = config,
            palette = TodayPalette.of(config),
            sheen = TodayPalette.sheenAlpha(config).takeIf { it > 0f }?.let(::renderGlassSheen),
            marks = marks,
            checkEvents = config.showEvents && CalendarGraph.repository(app).globalSettings.first().checkEvents,
            calendarAccessMissing = config.showEvents && CalendarGraph.repository(app).permissionMissing.first(),
            now = now,
            selection = selection,
            facets = facets,
            projects = projects,
            tagNames = tagNames,
            tagColors = tagColors,
            today = today,
            zone = zone,
        )
    }

    /**
     * Tout ce que la vue lit. Chaque source émet aussi sa valeur courante à l'abonnement : la
     * fenêtre de [RELOAD_QUIET_MS] fond ces premières émissions en un seul rechargement.
     */
    private fun reloadSignals(app: CadenceApp, showEvents: Boolean, today: LocalDate, zone: ZoneId): Flow<Unit> {
        val tasks = TasksGraph.repository(app)
        val calendar = CalendarGraph.repository(app)
        val sources = buildList<Flow<Any?>> {
            add(tasks.observeTasks())
            add(tasks.observeProjects())
            add(tasks.observeTags())
            add(app.repository.observeWidgetRevisions())
            add(calendar.globalSettings)
            add(TodayWidgetReloads.requests)
            if (showEvents) add(calendar.events(todayRange(today, zone), CalendarSurface.TASKS))
        }
        return sources.merge().map { }
    }

    private suspend fun eventsOf(
        context: Context,
        config: TodayWidgetConfig,
        today: LocalDate,
        zone: ZoneId,
    ): List<EventWithDone> {
        if (!config.showEvents) return emptyList()
        return CalendarGraph.repository(context).events(todayRange(today, zone), CalendarSurface.TASKS).first()
    }

    private fun todayRange(today: LocalDate, zone: ZoneId): TimeRange = TimeRange(
        today.atStartOfDay(zone).toInstant().toEpochMilli(),
        today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(),
    )

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
        val ink = TodayPalette.of(config).day.ink
        return chosen.filter { showsHabit(it.habit.goal, it.evaluation, config) }.take(config.maxFacets).map { item ->
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
        TodayCalendarRefresh.ensureScheduled(context)
        // Le contenu dépend du jour et de l'heure : ces signaux le redessinent.
        if (intent.action in DAY_SIGNALS) {
            TodayWidgetReloads.request()
            val app = context.applicationContext as CadenceApp
            app.applicationScope.launch { TodayWidget().updateAll(context) }
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        TodayWidgetConfigStore(context).remove(appWidgetIds)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        TodayCalendarRefresh.cancel(context)
    }

    private companion object {
        val DAY_SIGNALS = setOf(Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)
    }
}

/**
 * La case se coche dans ce widget avant l'écriture ([WidgetCompletions]) ; la ligne part après
 * le maintien, quand la session relit la base. Les autres widgets suivent la base.
 */
class CompleteTodayTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val uid = parameters[taskUidKey] ?: return
        WidgetCompletions.toggle(context, uid) { TodayWidget().update(context, glanceId) }
    }
}

/** Coche ou décoche une occurrence, dans Cadence seulement (jamais d'écriture dans l'agenda). */
class ToggleTodayEventAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val key = EventInstanceKey(
            calendarId = parameters[eventCalendarKey] ?: return,
            eventId = parameters[eventIdKey] ?: return,
            instanceBegin = parameters[eventBeginKey] ?: return,
        )
        CalendarGraph.repository(context).toggleDone(key)
        // Une session ouverte suit déjà les occurrences faites ; les autres démarrent ici.
        TodayWidget().updateAll(context)
    }
}

private const val FACET_ICON_DP = 22
private const val CHECK_DP = 22

/** Cible tactile des cases et des marques d'événement, plus large que la case dessinée ([CHECK_DP]). */
private const val CHECK_TOUCH_DP = 32

/** Fenêtre qui regroupe les écritures d'une même opération en un seul rechargement. */
private const val RELOAD_QUIET_MS = 80L
private const val WHITE_ARGB = 0xFFFFFFFF.toInt()
private const val RIM_DP = 1
private const val OPAQUE_MASK = 0xFF000000.toInt()

/**
 * Cases et marques, blanches et teintées à l'affichage : une image par forme, partagée par toutes
 * les lignes et rendue une fois par session (elles ne dépendent que de la densité).
 */
private class TodayMarks(
    val checkBox: Bitmap,
    val checkDone: Bitmap,
    /** Anneau et disque fait des événements, teintés de la couleur de l'agenda. */
    val eventCalendar: Bitmap,
    val eventCalendarDone: Bitmap,
) {
    companion object {
        fun render(density: Float) = TodayMarks(
            checkBox = renderCheckBox(WHITE_ARGB, CHECK_DP, density),
            checkDone = renderCheckBoxDone(CHECK_DP, density),
            eventCalendar = renderEventMark(done = false, CHECK_DP, density),
            eventCalendarDone = renderEventMark(done = true, CHECK_DP, density),
        )
    }
}

private class TodayView(
    val appWidgetId: Int,
    val config: TodayWidgetConfig,
    val palette: TodayPalettes,
    /** Reflet du verre, null hors du verre ou à force nulle. */
    val sheen: Bitmap?,
    val marks: TodayMarks,
    /** « Cocher un événement » est actif : l'icône d'agenda coche l'occurrence au lieu d'ouvrir l'application. */
    val checkEvents: Boolean,
    /** `READ_CALENDAR` manque alors que les événements sont demandés : une ligne discrète la réclame. */
    val calendarAccessMissing: Boolean,
    val now: Instant,
    val selection: TodaySelection,
    val facets: List<FacetView>,
    val projects: Map<String, ProjectItem>,
    val tagNames: Map<String, String>,
    val tagColors: Map<String, TagColor>,
    val today: LocalDate,
    val zone: ZoneId,
)

private fun TodayPalettes.provider(alpha: Float = 1f, pick: (TodayPalette) -> Int): GlanceColor =
    ColorProvider(day = layerColor(pick(day), alpha), night = layerColor(pick(night), alpha))

/** Couleur d'une couche : [alpha] s'ajoute à celle de la teinte (verre translucide) au lieu de la remplacer. */
internal fun layerColor(argb: Int, alpha: Float = 1f): Color = Color(argb).let { it.copy(alpha = it.alpha * alpha) }

private fun constantProvider(argb: Int): GlanceColor = ColorProvider(day = Color(argb), night = Color(argb))

/**
 * En-tête, habitudes et liste. L'en-tête et les habitudes gardent leur hauteur ; la liste, qui
 * défile, prend le reste (`defaultWeight`). Les habitudes ne sont donc jamais poussées hors du
 * widget, quelle que soit sa taille ni le nombre de tâches.
 */
@Composable
private fun TodayContent(view: TodayView, held: Set<String>) {
    val context = LocalContext.current
    val config = view.config
    val palette = view.palette
    val text = TodayTextSizes.of(config.textSize)
    val size = LocalSize.current
    val habitsShown = view.facets.isNotEmpty()
    val tasksShown = config.showTasks && (view.selection.tasks.isNotEmpty() || view.selection.overdue.isNotEmpty())
    val eventsShown = config.showEvents && view.selection.events.isNotEmpty()
    val listWanted = tasksShown || eventsShown || view.calendarAccessMissing
    val compact = TodaySize.classOf(size.width.value, size.height.value) == TodaySizeClass.COMPACT
    val listShown = listWanted && TodayWidgetLayout.listFits(size.height.value, text, habitsShown)
    // Le verre est une surface translucide posée dans son liseré : la couche extérieure, teinte du
    // liseré, ne dépasse que sur RIM_DP tout autour ; le reflet est une image étirée sous le contenu.
    val rim = if (config.background == TodayBackground.VERRE && config.glassRim > 0) RIM_DP else 0
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(palette.provider { it.rim })
            .cornerRadius(config.cornerRadiusDp.dp)
            .padding(rim.dp),
    ) {
        Box(
            modifier = GlanceModifier.fillMaxSize()
                .background(palette.provider { it.surface })
                .cornerRadius((config.cornerRadiusDp - rim).coerceAtLeast(0).dp),
        ) {
            view.sheen?.let {
                Image(ImageProvider(it), null, modifier = GlanceModifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
            }
            Column(modifier = GlanceModifier.fillMaxSize().padding((12 - rim).dp)) {
                Header(view, text)
                Box(GlanceModifier.height(6.dp)) {}
                if (compact) {
                    CompactNext(view, text)
                } else {
                    if (config.habitPlacement == HabitPlacement.ABOVE && habitsShown) HabitsRow(view, text)
                    if (listShown) {
                        TodayList(view, held, text)
                    } else {
                        Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
                            if (config.showTasks && !listWanted && !habitsShown) EmptyLabel(context.getString(R.string.today_widget_empty), palette, text)
                        }
                    }
                    if (config.habitPlacement == HabitPlacement.BELOW && habitsShown) HabitsRow(view, text)
                }
            }
        }
    }
}

/**
 * Mise en page compacte (2x1, 2x2) : l'en-tête avec le compte, puis le prochain élément seul, ouvert
 * par un appui. Sans rien à montrer, la ligne « Rien à faire aujourd'hui ».
 */
@Composable
private fun ColumnScope.CompactNext(view: TodayView, text: TodayTextSizes) {
    val context = LocalContext.current
    val palette = view.palette
    val source = if (view.config.showTasks) view.selection else view.selection.copy(overdue = emptyList(), tasks = emptyList())
    val next = TodayCompactNext.of(source, view.zone)
    Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.CenterStart) {
        when (next) {
            null -> EmptyLabel(context.getString(R.string.today_widget_empty), palette, text)
            is TodayItem.Task -> Column {
                Text(
                    next.task.name,
                    maxLines = 2,
                    style = TextStyle(color = palette.provider { it.ink }, fontSize = text.body.sp, fontWeight = FontWeight.Medium),
                    modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivityIntent(openTaskIntent(context, next.task.uid) ?: Intent(context, MainActivity::class.java))),
                )
                next.task.dueLabel(view, context)?.let {
                    Text(it, maxLines = 1, style = TextStyle(color = palette.provider { p -> p.muted }, fontSize = text.small.sp))
                }
            }
            is TodayItem.Event -> Column {
                Text(
                    next.event.event.title,
                    maxLines = 2,
                    style = TextStyle(color = palette.provider { it.ink }, fontSize = text.body.sp, fontWeight = FontWeight.Medium),
                    modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivity<MainActivity>()),
                )
                Text(
                    TodayEventPresentation.timeLabel(next.event.event, view.zone, context.getString(R.string.today_event_all_day)),
                    maxLines = 1,
                    style = TextStyle(color = palette.provider { it.muted }, fontSize = text.small.sp),
                )
            }
        }
    }
}

/**
 * Les tâches (retards d'abord) puis celles du jour mêlées aux événements, dans l'ordre de la liste
 * Aujourd'hui de l'application, dans une liste qui défile. Sans permission d'agenda, une ligne
 * discrète la demande.
 */
@Composable
private fun ColumnScope.TodayList(view: TodayView, held: Set<String>, text: TodayTextSizes) {
    val context = LocalContext.current
    val selection = if (view.config.showTasks) view.selection else view.selection.copy(overdue = emptyList(), tasks = emptyList())
    val grouped = view.config.groupByDay
    LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
        taskSections(selection, view.config, view.today, view.zone).forEach { section ->
            if (section.labelled) {
                item(itemId = section.labelId()) {
                    val colour = view.palette.provider { it.muted }
                    SectionLabel(section.label(view, context), colour, text)
                }
            }
            items(section.items, itemId = { it.key.hashCode().toLong() }) { row ->
                when (row) {
                    is TodayItem.Task -> {
                        val task = row.task
                        // Regroupée par jour, la ligne ne répète pas la date de sa section : l'heure seule.
                        val due = if (grouped) task.dueTimeLabel(view) else task.dueLabel(view, context)
                        TaskRowView(task, view, due, checked = task.uid in held, text)
                    }
                    is TodayItem.Event -> EventRowView(row.event, view, text)
                }
            }
        }
        if (view.calendarAccessMissing) {
            item(itemId = TodayListIds.EVENTS) { CalendarAccessRow(view, text) }
        }
    }
}

/** Ligne unique et calme qui ouvre la demande de permission de lecture des agendas. */
@Composable
private fun CalendarAccessRow(view: TodayView, text: TodayTextSizes) {
    val context = LocalContext.current
    Text(
        context.getString(R.string.today_widget_calendar_access),
        maxLines = 1,
        style = TextStyle(color = view.palette.provider { it.muted }, fontSize = text.small.sp),
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 8.dp).clickable(actionStartActivity<CalendarAccessActivity>()),
    )
}

@Composable
private fun Header(view: TodayView, text: TodayTextSizes) {
    val context = LocalContext.current
    val palette = view.palette
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
        Text(
            context.getString(scopeTitle(view.config.taskScope)),
            maxLines = 1,
            style = TextStyle(color = palette.provider { it.ink }, fontSize = text.title.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity<MainActivity>()),
        )
        Box(
            modifier = GlanceModifier
                .background(palette.provider(alpha = 0.14f) { it.ink })
                .cornerRadius(10.dp)
                .padding(horizontal = 7.dp, vertical = 1.dp),
        ) {
            Text(
                view.selection.total.toString(),
                style = TextStyle(color = palette.provider { it.muted }, fontSize = text.small.sp, fontWeight = FontWeight.Medium),
            )
        }
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
    val discrete = view.config.discreteButtons
    Box(
        modifier = GlanceModifier.size(30.dp)
            .then(if (discrete) GlanceModifier else GlanceModifier.background(palette.provider(alpha = 0.18f) { it.accent }).cornerRadius(15.dp))
            .clickable(action),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            glyph,
            style = TextStyle(color = palette.provider { it.accent }, fontSize = 20.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun SectionLabel(text: String, colour: GlanceColor, sizes: TodayTextSizes) {
    Text(
        text,
        maxLines = 1,
        style = TextStyle(color = colour, fontSize = sizes.small.sp, fontWeight = FontWeight.Medium),
        modifier = GlanceModifier.padding(top = 4.dp, bottom = 2.dp),
    )
}

@Composable
private fun EmptyLabel(text: String, palette: TodayPalettes, sizes: TodayTextSizes) {
    Text(text, style = TextStyle(color = palette.provider { it.muted }, fontSize = sizes.body.sp))
}

@Composable
private fun TaskRowView(
    task: TaskItem,
    view: TodayView,
    dueLabel: String?,
    checked: Boolean,
    sizes: TodayTextSizes,
) {
    val palette = view.palette
    val config = view.config
    val projectArgb = task.projectUid?.let { view.projects[it]?.color }?.let(::parseColour)
    val projectColour = projectArgb?.let(::constantProvider)
    val accent = palette.provider { it.taskTint(task.priority, config.controlColour, projectArgb) }
    val projectNames = view.projects.mapValues { it.value.name }
    val meta = if (config.showTaskMeta) taskMeta(task, projectNames, view.tagNames) else null
    val metaTags = if (config.showTaskMeta) taskMetaTags(task, view.tagNames, view.tagColors) else emptyList()
    val context = LocalContext.current
    val openIntent = openTaskIntent(context, task.uid) ?: Intent(context, MainActivity::class.java)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (config.projectRail) {
            val rail = projectColour ?: palette.provider { it.accent }
            Box(modifier = GlanceModifier.width(3.dp).height(20.dp).background(rail).cornerRadius(2.dp)) {}
            Box(GlanceModifier.width(6.dp)) {}
        }
        // La case de 22 dp est centrée dans une cible de 32 dp ; cochée, elle est pleine, la coche évidée.
        val checkTarget = GlanceModifier.size(CHECK_TOUCH_DP.dp)
        val checkLabel = context.getString(
            if (checked) R.string.today_widget_uncheck_description else R.string.today_widget_check_description,
            task.name,
        )
        Box(
            modifier = if (config.checkFromWidget && !task.virtual) {
                checkTarget.clickable(actionRunCallback<CompleteTodayTaskAction>(actionParametersOf(taskUidKey to task.uid)))
            } else {
                checkTarget.clickable(actionStartActivityIntent(openIntent))
            },
            contentAlignment = Alignment.Center,
        ) {
            Image(
                ImageProvider(if (checked) view.marks.checkDone else view.marks.checkBox),
                checkLabel,
                modifier = GlanceModifier.size(CHECK_DP.dp),
                colorFilter = ColorFilter.tint(accent),
            )
        }
        Column(
            modifier = GlanceModifier.defaultWeight().padding(start = 3.dp).clickable(actionStartActivityIntent(openIntent)),
        ) {
            Text(
                task.name,
                maxLines = 1,
                style = TextStyle(
                    color = if (checked) palette.provider { it.muted } else palette.provider { it.ink },
                    fontSize = sizes.body.sp,
                    textDecoration = if (checked) TextDecoration.LineThrough else null,
                ),
            )
            if (metaTags.isEmpty()) {
                meta?.let {
                    Text(it, maxLines = 1, style = TextStyle(color = palette.provider { p -> p.muted }, fontSize = sizes.small.sp))
                }
            } else {
                // Les étiquettes gardent leur couleur : un point plein, clair la nuit, devant chaque « #nom ».
                val metaStyle = TextStyle(color = palette.provider { p -> p.muted }, fontSize = sizes.small.sp)
                Row(verticalAlignment = Alignment.Vertical.CenterVertically) {
                    taskMeta(task, projectNames, emptyMap())?.let { Text("$it · ", maxLines = 1, style = metaStyle) }
                    metaTags.forEachIndexed { index, tag ->
                        if (index > 0) Box(GlanceModifier.width(6.dp)) {}
                        Box(
                            GlanceModifier.size(6.dp).background(ColorProvider(day = Color(tag.color.lightArgb), night = Color(tag.color.darkArgb))).cornerRadius(3.dp),
                        ) {}
                        Box(GlanceModifier.width(3.dp)) {}
                        Text("#${tag.name}", maxLines = 1, style = metaStyle)
                    }
                }
            }
        }
        dueLabel?.let {
            Text(
                it,
                maxLines = 1,
                style = TextStyle(
                    color = palette.provider { p -> p.muted },
                    fontSize = sizes.small.sp,
                ),
            )
        }
    }
}

/**
 * Événement d'agenda, distinct d'une tâche : rail et icône d'agenda à la couleur de l'agenda (une
 * tâche a une case carrée), plage horaire à droite, colorée tant que l'événement est en cours.
 * Passé, le titre s'atténue ; fait, l'icône devient agenda coché et le titre est barré.
 */
@Composable
private fun EventRowView(event: EventWithDone, view: TodayView, sizes: TodayTextSizes) {
    val context = LocalContext.current
    val palette = view.palette
    val state = TodayEventPresentation.state(event, view.now, view.zone)
    val time = TodayEventPresentation.timeLabel(event.event, view.zone, context.getString(R.string.today_event_all_day))
    val calendarArgb = event.event.colorArgb.takeIf { it != 0 } ?: event.calendar.colorArgb
    // La teinte de l'agenda est éclaircie ou assombrie jusqu'à 4,5:1 sur la surface de chaque thème.
    val tint = ColorProvider(
        day = Color(readableTint(calendarArgb, opaque(palette.day.surface))),
        night = Color(readableTint(calendarArgb, opaque(palette.night.surface))),
    )
    val faded = state == TodayEventState.PAST || state == TodayEventState.DONE
    val markAction = if (view.checkEvents) {
        actionRunCallback<ToggleTodayEventAction>(
            actionParametersOf(
                eventCalendarKey to event.event.calendarId,
                eventIdKey to event.event.eventId,
                eventBeginKey to event.event.instanceBegin,
            ),
        )
    } else {
        actionStartActivity<MainActivity>()
    }
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 1.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (view.config.projectRail) {
            Box(modifier = GlanceModifier.width(3.dp).height(20.dp).background(constantProvider(calendarArgb)).cornerRadius(2.dp)) {}
            Box(GlanceModifier.width(6.dp)) {}
        }
        Box(
            modifier = GlanceModifier.size(CHECK_TOUCH_DP.dp).clickable(markAction),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                ImageProvider(if (state == TodayEventState.DONE) view.marks.eventCalendarDone else view.marks.eventCalendar),
                context.getString(R.string.today_event_check_description, event.event.title),
                modifier = GlanceModifier.size(CHECK_DP.dp),
                colorFilter = ColorFilter.tint(tint),
            )
        }
        Text(
            event.event.title,
            maxLines = 1,
            style = TextStyle(
                color = if (faded) palette.provider { it.muted } else palette.provider { it.ink },
                fontSize = sizes.body.sp,
                textDecoration = if (state == TodayEventState.DONE) TextDecoration.LineThrough else null,
            ),
            modifier = GlanceModifier.defaultWeight().padding(start = 3.dp).clickable(actionStartActivity<MainActivity>()),
        )
        Text(
            time,
            maxLines = 1,
            style = TextStyle(
                color = if (state == TodayEventState.ONGOING) tint else palette.provider { it.muted },
                fontSize = sizes.small.sp,
                fontWeight = if (state == TodayEventState.ONGOING) FontWeight.Medium else null,
            ),
        )
    }
}

/** Surface rendue opaque pour mesurer un contraste ; « Aucun » (transparent) se lit comme du noir. */
private fun opaque(argb: Int): Int = argb or OPAQUE_MASK

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
                    style = TextStyle(color = palette.provider { it.ink }, fontSize = sizes.small.sp, textAlign = TextAlign.Center),
                )
                Text(
                    value,
                    maxLines = 1,
                    style = TextStyle(color = palette.provider { it.muted }, fontSize = sizes.small.sp, textAlign = TextAlign.Center),
                )
            }
        }
    }
}

/**
 * Échéance en une pastille de texte : Hier, Auj., Demain ou « 27 oct. », suivie de l'heure.
 * « Auj. » ne s'écrit que hors des périmètres du jour, où il informe ; dans « Aujourd'hui » il répéterait le titre.
 */
private fun TaskItem.dueLabel(view: TodayView, context: Context): String? {
    val due = dueDay ?: return null
    val time = if (dueHasTime) dueDate?.atZone(view.zone)?.format(TIME_FORMAT) else null
    val inTodayScope = view.config.taskScope == TaskScope.OVERDUE_AND_TODAY || view.config.taskScope == TaskScope.TODAY
    val day = when (RelativeDay.of(due, view.today)) {
        RelativeDay.YESTERDAY -> context.getString(R.string.today_day_yesterday)
        RelativeDay.TODAY -> if (inTodayScope) null else context.getString(R.string.today_day_today)
        RelativeDay.TOMORROW -> context.getString(R.string.today_day_tomorrow)
        RelativeDay.OTHER -> due.format(DAY_FORMAT)
    }
    return listOfNotNull(day, time).joinToString(" ").ifEmpty { null }
}

/** Heure seule de l'échéance, quand la section donne déjà le jour. */
private fun TaskItem.dueTimeLabel(view: TodayView): String? =
    if (dueHasTime) dueDate?.atZone(view.zone)?.format(TIME_FORMAT) else null

private fun TodaySection.labelId(): Long = when {
    day != null -> TodayListIds.day(day)
    overdue -> TodayListIds.OVERDUE
    else -> TodayListIds.UNDATED
}

/** « En retard · 19 » sans regroupement ; sinon Hier, Aujourd'hui, Demain ou « Mardi 27 octobre ». */
private fun TodaySection.label(view: TodayView, context: Context): String {
    val day = day ?: return if (overdue) {
        context.getString(R.string.today_overdue_label, tasks.size)
    } else {
        context.getString(R.string.today_no_date_label)
    }
    return when (RelativeDay.of(day, view.today)) {
        RelativeDay.YESTERDAY -> context.getString(R.string.today_day_yesterday)
        RelativeDay.TODAY -> context.getString(R.string.today_scope_today)
        RelativeDay.TOMORROW -> context.getString(R.string.today_day_tomorrow)
        RelativeDay.OTHER -> day.format(SECTION_DAY_FORMAT).replaceFirstChar { it.titlecase(Locale.FRENCH) }
    }
}

private fun parseColour(hex: String): Int? =
    runCatching { AndroidColor.parseColor(hex) }.getOrNull()

private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.FRENCH)
private val SECTION_DAY_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)

private fun configIntent(context: Context, appWidgetId: Int): Intent =
    Intent(context, TodayWidgetConfigActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

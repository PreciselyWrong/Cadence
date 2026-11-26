package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.review.ReviewCache
import ch.nicolab.cadence.tasks.review.ReviewRepository
import ch.nicolab.cadence.tasks.links.PageCheckClient
import ch.nicolab.cadence.tasks.todomd.TodoMdClient
import ch.nicolab.cadence.tasks.syncstatus.SyncStatusClient
import ch.nicolab.cadence.tasks.planning.FocusRepository
import ch.nicolab.cadence.tasks.planning.PlanEdits
import ch.nicolab.cadence.tasks.reminder.TimedRemindersRepository
import ch.nicolab.cadence.tasks.reminder.TimedRemindersStore
import ch.nicolab.cadence.tasks.planning.PlanningStore
import ch.nicolab.cadence.tasks.reminder.PlanSlotsStore
import ch.nicolab.cadence.tasks.reminder.refreshPlanSlots
import java.io.File
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.HttpSyncApi
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.HABIT_ENTITIES
import ch.nicolab.cadence.tasks.sync.HabitSyncRegistry
import ch.nicolab.cadence.tasks.sync.HabitOwnership
import ch.nicolab.cadence.tasks.sync.HabitSyncStore
import ch.nicolab.cadence.tasks.sync.LocalHabits
import ch.nicolab.cadence.tasks.sync.pendingHabitWrites
import ch.nicolab.cadence.tasks.sync.SYNCED_ENTITIES
import ch.nicolab.cadence.tasks.sync.SyncEngine

internal fun createRepository(context: Context): TaskRepository = TasksRuntime.get(context).repository

internal fun createLinkPreviews(context: Context): ch.nicolab.cadence.tasks.links.LinkPreviews =
    TasksRuntime.get(context).linkPreviews

internal fun createServerConnection(context: Context): ServerConnection = TasksRuntime.get(context).connection

internal suspend fun currentServerSession(context: Context): ch.nicolab.cadence.tasks.sync.ServerSession? =
    TasksRuntime.get(context).connection.currentSession()

internal fun createReview(context: Context): ReviewRepository = TasksRuntime.get(context).review

internal fun createFocus(context: Context): FocusRepository = TasksRuntime.get(context).focus

internal fun createTimedReminders(context: Context): TimedRemindersRepository = TasksRuntime.get(context).timedReminders

internal fun createTodoMd(context: Context): TodoMdClient = TasksRuntime.get(context).todoMd

internal fun createPageChecks(context: Context): PageCheckClient = TasksRuntime.get(context).pageChecks

internal fun createAlignDue(context: Context): ch.nicolab.cadence.tasks.planning.AlignDueClient = TasksRuntime.get(context).alignDue

internal fun createBacklinks(context: Context): ch.nicolab.cadence.tasks.contentlinks.BacklinksClient = TasksRuntime.get(context).backlinks

internal fun createHistory(context: Context): ch.nicolab.cadence.tasks.history.HistoryClient = TasksRuntime.get(context).history

internal fun createPeople(context: Context): ch.nicolab.cadence.tasks.contentlinks.PeopleClient = TasksRuntime.get(context).people

internal fun createSyncStatus(context: Context): SyncStatusClient = TasksRuntime.get(context).syncStatus

internal fun createPlanEdits(context: Context): PlanEdits = TasksRuntime.get(context).planEdits

internal fun createTriage(context: Context): ch.nicolab.cadence.tasks.triage.TriageRepository = TasksRuntime.get(context).triage

internal fun createDecisions(context: Context): ch.nicolab.cadence.tasks.decisions.DecisionsRepository = TasksRuntime.get(context).decisions

internal fun createRelations(context: Context): ch.nicolab.cadence.tasks.relations.TaskRelationsRepository = TasksRuntime.get(context).relations

internal fun createPublicShare(context: Context): ch.nicolab.cadence.tasks.notes.PublicShareClient = TasksRuntime.get(context).publicShare

internal fun createTemplates(context: Context): ch.nicolab.cadence.tasks.project.TemplatesClient = TasksRuntime.get(context).templates

internal fun createViews(context: Context): ch.nicolab.cadence.tasks.views.ViewsClient = TasksRuntime.get(context).views

internal fun createAttachments(context: Context): ch.nicolab.cadence.tasks.attachments.AttachmentsClient = TasksRuntime.get(context).attachments

internal fun createCalendarFeeds(context: Context): ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeedsRepository = TasksRuntime.get(context).calendarFeeds

/** Dernières listes de revue lues, pour la lecture hors ligne ; effacées à la déconnexion. */
internal fun reviewCacheDir(context: Context): File = File(context.cacheDir, "review")

/** Une seule base, un seul moteur et une seule horloge par processus. */
internal class TasksRuntime private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database: TududiDatabase = Room.databaseBuilder(appContext, TududiDatabase::class.java, "tududi.db")
        .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13, MIGRATION_13_14, MIGRATION_14_15, MIGRATION_15_16, MIGRATION_16_17, MIGRATION_17_18, MIGRATION_18_19, MIGRATION_19_20, MIGRATION_20_21, MIGRATION_21_22, MIGRATION_22_23, MIGRATION_23_24, MIGRATION_24_25, MIGRATION_25_26, MIGRATION_26_27)
        .build()
    private val clockState = ClockStateStore(appContext)
    private val hlc = Hlc(node = clockState.node(), initial = clockState.load())
    private val habitStorage = HabitSyncRegistry.storage
    private val ownership = HabitOwnership(
        DataStoreHabitOwnerStore(appContext),
        habitStorage?.let { storage ->
            object : LocalHabits {
                override suspend fun hasRows() = storage.hasRows()
                override suspend fun clearOutbox() = storage.clearOutbox()
                override suspend fun deleteAll() = storage.deleteAll()
            }
        },
    )
    private val habitStore = habitStorage?.let { storage ->
        HabitSyncStore(storage, clockState.node(), allowed = ownership::syncAllowed) { op, reason, name ->
            database.failedOpDao().insert(
                FailedOpEntity(op.opId, op.entity, op.uid, reason, System.currentTimeMillis(), name),
            )
        }
    }
    private val store = RoomSyncStore(database, clockState, habits = habitStore)
    private val deviceZone = DeviceZone(appContext)
    // La connexion et le moteur se réfèrent l'un à l'autre : le moteur n'est lu qu'à l'exécution.
    val connection = ServerConnectionImpl(appContext, database, store, ownership) { engine }
    val api = HttpSyncApi { connection.currentSession() ?: throw AuthError("Aucun serveur configuré") }
    val linkPreviews = RoomLinkPreviews(database.linkPreviewDao(), api::linkMetadata)
    val engine: SyncEngine = SyncEngine(
        api,
        store,
        hlc,
        onProfile = connection::saveProfile,
        entities = if (habitStore != null) SYNCED_ENTITIES + HABIT_ENTITIES else SYNCED_ENTITIES,
        onSynced = {
            refreshPlanSlots(PlanSlotsStore(appContext), api::call)
            focus.sync()
            timedReminders.sync()
            ch.nicolab.cadence.tasks.live.AgentInbox.refresh(appContext)
        },
    )
    private val habitPending: Flow<Int> = habitStorage?.let { storage ->
        combine(storage.observePendingCount(), ownership.observeForeign()) { count, foreign -> pendingHabitWrites(count, foreign) }
    } ?: flowOf(0)
    val repository = RoomTaskRepository(
        appContext,
        database,
        api,
        hlc,
        clockState,
        connection,
        engine.state,
        deviceZone.zone,
        habitPending = habitPending,
    )
    val todoMd = TodoMdClient(api::call)
    val pageChecks = PageCheckClient(api::call)
    val alignDue = ch.nicolab.cadence.tasks.planning.AlignDueClient(api::call)
    val backlinks = ch.nicolab.cadence.tasks.contentlinks.BacklinksClient { method, path, query -> api.callJson(method, path, query) }
    val publicShare = ch.nicolab.cadence.tasks.notes.PublicShareClient(
        call = { method, path, body -> api.call(method, path, body = body) },
        baseUrlProvider = { connection.currentSession()?.baseUrl },
    )
    val templates = ch.nicolab.cadence.tasks.project.TemplatesClient { method, path, body -> api.call(method, path, body = body) }
    val views = ch.nicolab.cadence.tasks.views.ViewsClient(
        callJson = { method, path, query -> api.callJson(method, path, query) },
        callObj = { method, path, body -> api.call(method, path, body = body) },
    )
    val attachments = ch.nicolab.cadence.tasks.attachments.AttachmentsClient(
        session = { connection.currentSession() },
        callObj = { method, path, body -> api.call(method, path, body = body) },
        callJson = { method, path -> api.callJson(method, path) },
    )
    val calendarFeeds = ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeedsRepository(
        client = ch.nicolab.cadence.tasks.calendarfeeds.CalendarFeedsClient { method, path, query, body ->
            api.call(method, path, query = query, body = body)
        },
    )
    val history = ch.nicolab.cadence.tasks.history.HistoryClient { method, path, query -> api.callJson(method, path, query) }
    val people = ch.nicolab.cadence.tasks.contentlinks.PeopleClient(
        { method, path, query -> api.callJson(method, path, query) },
        appContext.getSharedPreferences("cadence_people", Context.MODE_PRIVATE),
    )
    val syncStatus = SyncStatusClient(api::call)

    val review = ReviewRepository(
        api::call,
        ReviewCache(reviewCacheDir(appContext)),
        defer = { call -> repository.defer(call).getOrThrow() },
    )

    val focus = FocusRepository(PlanningStore.of(appContext), api::call)

    val planEdits = PlanEdits(
        read = { PlanSlotsStore(appContext).entries() },
        write = { PlanSlotsStore(appContext).write(it) },
        defer = { call -> repository.defer(call).getOrThrow() },
        cancel = { key -> database.deferredCallDao().delete(key) > 0 },
    )

    val timedReminders = TimedRemindersRepository(TimedRemindersStore(appContext), api::call)

    val triage = ch.nicolab.cadence.tasks.triage.TriageRepository(
        store = ch.nicolab.cadence.tasks.triage.TriageStore.of(appContext),
        call = api::call,
        pendingCalls = { database.deferredCallDao().all().map { it.key }.toSet() },
        defer = { call -> repository.defer(call).getOrThrow() },
    )

    val decisions = ch.nicolab.cadence.tasks.decisions.DecisionsRepository(
        store = ch.nicolab.cadence.tasks.decisions.DecisionsStore.of(appContext),
        call = api::call,
        pendingCalls = { database.deferredCallDao().all().map { it.key }.toSet() },
        defer = { call -> repository.defer(call).getOrThrow() },
    )

    val relations = ch.nicolab.cadence.tasks.relations.TaskRelationsRepository(
        prefs = ch.nicolab.cadence.tasks.relations.TaskRelationsRepository.prefs(appContext),
        call = api::call,
        defer = { call -> repository.defer(call).map { } },
        cancelDeferred = { key -> database.deferredCallDao().delete(key) },
    )

    init {
        // Préférences de l'ancien résumé du jour (retiré en 1.21.0) : plus rien ne les lit.
        appContext.deleteSharedPreferences("cadence_brief")
        androidx.work.WorkManager.getInstance(appContext).cancelUniqueWork("brief-audio")
        appContext.getSystemService(android.app.NotificationManager::class.java).deleteNotificationChannel("brief_audio")
    }

    companion object {
        @Volatile
        private var instance: TasksRuntime? = null

        fun get(context: Context): TasksRuntime =
            instance ?: synchronized(this) {
                instance ?: TasksRuntime(context).also { instance = it }
            }
    }
}

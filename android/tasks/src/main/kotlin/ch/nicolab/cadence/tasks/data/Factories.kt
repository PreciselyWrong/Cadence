package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.review.ReviewCache
import ch.nicolab.cadence.tasks.review.ReviewRepository
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
import ch.nicolab.cadence.tasks.brief.BriefActions
import ch.nicolab.cadence.tasks.brief.BriefAgentsRepository
import ch.nicolab.cadence.tasks.brief.BriefPlanWrites
import ch.nicolab.cadence.tasks.brief.BriefRequests
import ch.nicolab.cadence.tasks.brief.BriefRepository
import ch.nicolab.cadence.tasks.brief.BriefSettingsRepository
import ch.nicolab.cadence.tasks.brief.BriefStore
import ch.nicolab.cadence.tasks.brief.BriefView
import ch.nicolab.cadence.tasks.brief.EveningRepository
import ch.nicolab.cadence.tasks.brief.DeferredBriefQueue
import ch.nicolab.cadence.tasks.brief.RepositoryBriefTasks
import java.time.ZoneId
import kotlinx.coroutines.flow.first

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

internal fun createSyncStatus(context: Context): SyncStatusClient = TasksRuntime.get(context).syncStatus

internal fun createBrief(context: Context): BriefRepository = TasksRuntime.get(context).brief

internal fun createBriefSettings(context: Context): BriefSettingsRepository = TasksRuntime.get(context).briefSettings

internal fun createBriefAgents(context: Context): BriefAgentsRepository = TasksRuntime.get(context).briefAgents

internal fun createBriefActions(context: Context): BriefActions = TasksRuntime.get(context).briefActions

internal fun createPlanEdits(context: Context): PlanEdits = TasksRuntime.get(context).planEdits

internal fun createBriefAudio(context: Context): ch.nicolab.cadence.tasks.brief.audio.BriefAudio = TasksRuntime.get(context).briefAudio

internal fun createBriefStore(context: Context): BriefStore = TasksRuntime.get(context).briefStore

internal fun createEvening(context: Context): EveningRepository = TasksRuntime.get(context).evening

internal fun createTriage(context: Context): ch.nicolab.cadence.tasks.triage.TriageRepository = TasksRuntime.get(context).triage

/** Dernières listes de revue lues, pour la lecture hors ligne ; effacées à la déconnexion. */
internal fun reviewCacheDir(context: Context): File = File(context.cacheDir, "review")

/** Une seule base, un seul moteur et une seule horloge par processus. */
internal class TasksRuntime private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database: TududiDatabase = Room.databaseBuilder(appContext, TududiDatabase::class.java, "tududi.db")
        .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13, MIGRATION_13_14, MIGRATION_14_15, MIGRATION_15_16, MIGRATION_16_17)
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
            brief.refreshToday()
            evening.refreshIfDue(briefStore.settings.value)
            ch.nicolab.cadence.tasks.brief.audio.BriefAudioScheduler.request(appContext)
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

    val briefStore = BriefStore.of(appContext)
    private val accountZone: suspend () -> ZoneId = { connection.observe().first()?.accountZone ?: ZoneId.systemDefault() }
    val brief = BriefRepository(database.briefDao(), api::call, accountZone, onSeen = { briefStore.markSeen(it, BriefView.MORNING) })
    val evening = EveningRepository(database.eveningDao(), api::call, accountZone, onSeen = { briefStore.markSeen(it, BriefView.EVENING) })
    val briefAudio = ch.nicolab.cadence.tasks.brief.audio.BriefAudio(appContext, brief, evening, api::download)
    val briefSettings = BriefSettingsRepository(briefStore, api::call) { call -> repository.defer(call).getOrThrow() }
    val triage = ch.nicolab.cadence.tasks.triage.TriageRepository(
        store = briefStore,
        call = api::call,
        pendingCalls = { database.deferredCallDao().all().map { it.key }.toSet() },
        defer = { call -> repository.defer(call).getOrThrow() },
    )
    val briefAgents = BriefAgentsRepository(api::call)
    val briefActions = BriefActions(
        tasks = RepositoryBriefTasks(repository),
        queue = DeferredBriefQueue(
            defer = { call -> repository.defer(call).getOrThrow() },
            cancelKey = { key -> database.deferredCallDao().delete(key) > 0 },
        ),
        zone = accountZone,
        plan = BriefPlanWrites { date, uids ->
            val current = api.call("GET", "/api/v1/daily-plan", mapOf("date" to date.toString()))
            BriefRequests.planWithout(current, uids)?.let { api.call("PUT", "/api/v1/daily-plan/$date", body = it) }
        },
    )

    companion object {
        @Volatile
        private var instance: TasksRuntime? = null

        fun get(context: Context): TasksRuntime =
            instance ?: synchronized(this) {
                instance ?: TasksRuntime(context).also { instance = it }
            }
    }
}

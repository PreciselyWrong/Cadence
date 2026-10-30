package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.sync.Hlc
import ch.nicolab.cadence.tasks.sync.HttpSyncApi
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.SyncEngine

internal fun createRepository(context: Context): TaskRepository = TasksRuntime.get(context).repository

internal fun createLinkPreviews(context: Context): ch.nicolab.cadence.tasks.links.LinkPreviews =
    TasksRuntime.get(context).linkPreviews

internal fun createServerConnection(context: Context): ServerConnection = TasksRuntime.get(context).connection

/** Une seule base, un seul moteur et une seule horloge par processus. */
internal class TasksRuntime private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database: TududiDatabase = Room.databaseBuilder(appContext, TududiDatabase::class.java, "tududi.db")
        .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
        .build()
    private val clockState = ClockStateStore(appContext)
    private val hlc = Hlc(node = clockState.node(), initial = clockState.load())
    private val store = RoomSyncStore(database, clockState)
    private val deviceZone = DeviceZone(appContext)
    // La connexion et le moteur se réfèrent l'un à l'autre : le moteur n'est lu qu'à l'exécution.
    val connection = ServerConnectionImpl(appContext, database, store) { engine }
    val api = HttpSyncApi { connection.currentSession() ?: throw AuthError("Aucun serveur configuré") }
    val linkPreviews = RoomLinkPreviews(database.linkPreviewDao(), api::linkMetadata)
    val engine: SyncEngine =SyncEngine(api, store, hlc, onProfile = connection::saveProfile)
    val repository = RoomTaskRepository(
        appContext,
        database,
        api,
        hlc,
        clockState,
        connection,
        engine.state,
        deviceZone.zone,
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

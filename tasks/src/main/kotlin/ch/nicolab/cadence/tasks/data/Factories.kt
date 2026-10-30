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

internal fun createServerConnection(context: Context): ServerConnection = TasksRuntime.get(context).connection

/** Une seule base, un seul moteur et une seule horloge par processus. */
internal class TasksRuntime private constructor(context: Context) {
    private val appContext = context.applicationContext
    private val database: TududiDatabase = Room.databaseBuilder(appContext, TududiDatabase::class.java, "tududi.db")
        .build()
    private val clockState = ClockStateStore(appContext)
    private val hlc = Hlc(node = clockState.node(), initial = clockState.load())
    private val store = RoomSyncStore(database, clockState)
    val connection = ServerConnectionImpl(appContext, database, store)
    val api = HttpSyncApi { connection.currentSession() ?: throw AuthError("Aucun serveur configuré") }
    val engine = SyncEngine(api, store, hlc, onProfile = connection::saveProfile)
    val repository = RoomTaskRepository(appContext, database, api, hlc, clockState, connection, engine.state)

    companion object {
        @Volatile
        private var instance: TasksRuntime? = null

        fun get(context: Context): TasksRuntime =
            instance ?: synchronized(this) {
                instance ?: TasksRuntime(context).also { instance = it }
            }
    }
}

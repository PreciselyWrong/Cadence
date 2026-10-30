package ch.nicolab.cadence.tasks

import android.content.Context
import ch.nicolab.cadence.tasks.data.createRepository
import ch.nicolab.cadence.tasks.data.createServerConnection

/** Câblage manuel du module, comme `CadenceApp` pour les habitudes. */
object TasksGraph {
    @Volatile private var repository: TaskRepository? = null
    @Volatile private var connection: ServerConnection? = null

    fun repository(context: Context): TaskRepository =
        repository ?: synchronized(this) {
            repository ?: createRepository(context.applicationContext).also { repository = it }
        }

    fun connection(context: Context): ServerConnection =
        connection ?: synchronized(this) {
            connection ?: createServerConnection(context.applicationContext).also { connection = it }
        }
}

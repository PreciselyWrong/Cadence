package ch.nicolab.cadence.tasks

import android.content.Context
import ch.nicolab.cadence.tasks.data.createRepository
import ch.nicolab.cadence.tasks.data.createLinkPreviews
import ch.nicolab.cadence.tasks.data.createReview
import ch.nicolab.cadence.tasks.data.createServerConnection
import ch.nicolab.cadence.tasks.review.ReviewRepository
import ch.nicolab.cadence.tasks.links.LinkPreviews

/** Câblage manuel du module, comme `CadenceApp` pour les habitudes. */
object TasksGraph {
    @Volatile private var repository: TaskRepository? = null
    @Volatile private var connection: ServerConnection? = null

    fun repository(context: Context): TaskRepository =
        repository ?: synchronized(this) {
            repository ?: createRepository(context.applicationContext).also { repository = it }
        }

    fun linkPreviews(context: Context): LinkPreviews = createLinkPreviews(context.applicationContext)

    /** Listes de la revue, servies par le serveur (en ligne, dernière lecture hors ligne). */
    fun review(context: Context): ReviewRepository = createReview(context.applicationContext)

    fun connection(context: Context): ServerConnection =
        connection ?: synchronized(this) {
            connection ?: createServerConnection(context.applicationContext).also { connection = it }
        }
}

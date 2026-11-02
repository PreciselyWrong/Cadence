package ch.nicolab.cadence.tasks

import android.content.Context
import androidx.annotation.VisibleForTesting
import ch.nicolab.cadence.tasks.data.createRepository
import ch.nicolab.cadence.tasks.data.createLinkPreviews
import ch.nicolab.cadence.tasks.data.createFocus
import ch.nicolab.cadence.tasks.data.createReview
import ch.nicolab.cadence.tasks.planning.FocusRepository
import ch.nicolab.cadence.tasks.data.createServerConnection
import ch.nicolab.cadence.tasks.data.createTodoMd
import ch.nicolab.cadence.tasks.todomd.TodoMdClient
import ch.nicolab.cadence.tasks.data.createSyncStatus
import ch.nicolab.cadence.tasks.syncstatus.SyncStatusClient
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

    /** Tests : un dépôt sur une base en mémoire à la place du vrai ; null rend la main au câblage normal. */
    @VisibleForTesting
    internal fun replaceRepository(value: TaskRepository?) {
        repository = value
    }

    fun linkPreviews(context: Context): LinkPreviews = createLinkPreviews(context.applicationContext)

    /** Listes de la revue, servies par le serveur (en ligne, dernière lecture hors ligne). */
    fun review(context: Context): ReviewRepository = createReview(context.applicationContext)

    /** Plages protégées et exceptions, servies par le serveur (dernière lecture gardée, envoi différé hors ligne). */
    fun focus(context: Context): FocusRepository = createFocus(context.applicationContext)

    /** État des dépôts git des projets TODO.md, servi par le serveur (en ligne seulement). */
    fun todoMd(context: Context): TodoMdClient = createTodoMd(context.applicationContext)

    /** Appareils et conflits vus du serveur (en ligne seulement). */
    fun syncStatus(context: Context): SyncStatusClient = createSyncStatus(context.applicationContext)

    fun connection(context: Context): ServerConnection =
        connection ?: synchronized(this) {
            connection ?: createServerConnection(context.applicationContext).also { connection = it }
        }
}

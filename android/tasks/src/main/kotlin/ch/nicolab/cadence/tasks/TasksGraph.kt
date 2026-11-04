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
import ch.nicolab.cadence.tasks.brief.BriefActions
import ch.nicolab.cadence.tasks.brief.BriefAgentsRepository
import ch.nicolab.cadence.tasks.brief.BriefRepository
import ch.nicolab.cadence.tasks.brief.BriefSettingsRepository
import ch.nicolab.cadence.tasks.brief.BriefStore
import ch.nicolab.cadence.tasks.data.createBrief
import ch.nicolab.cadence.tasks.data.createBriefActions
import ch.nicolab.cadence.tasks.data.createBriefAgents
import ch.nicolab.cadence.tasks.data.createBriefSettings
import ch.nicolab.cadence.tasks.data.createBriefStore

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

    /** Brief du jour, lu en ligne et gardé pour le hors ligne. */
    fun brief(context: Context): BriefRepository = createBrief(context.applicationContext)

    /** Réglages du brief (dernière lecture gardée, écriture différée hors ligne). */
    fun briefSettings(context: Context): BriefSettingsRepository = createBriefSettings(context.applicationContext)

    /** Réglages de l'agent (en ligne seulement). */
    fun briefAgents(context: Context): BriefAgentsRepository = createBriefAgents(context.applicationContext)

    /** Actions du brief : tâche et décision (file d'appels différés), avec annulation. */
    internal fun briefActions(context: Context): BriefActions = createBriefActions(context.applicationContext)

    /** Préférences du brief propres à l'appareil (notification « résumé prêt »). */
    fun briefStore(context: Context): BriefStore = createBriefStore(context.applicationContext)

    fun connection(context: Context): ServerConnection =
        connection ?: synchronized(this) {
            connection ?: createServerConnection(context.applicationContext).also { connection = it }
        }
}

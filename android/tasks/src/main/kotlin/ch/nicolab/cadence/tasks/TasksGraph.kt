package ch.nicolab.cadence.tasks

import android.content.Context
import androidx.annotation.VisibleForTesting
import ch.nicolab.cadence.tasks.data.createRepository
import ch.nicolab.cadence.tasks.data.createLinkPreviews
import ch.nicolab.cadence.tasks.data.createFocus
import ch.nicolab.cadence.tasks.data.createTimedReminders
import ch.nicolab.cadence.tasks.data.createReview
import ch.nicolab.cadence.tasks.planning.FocusRepository
import ch.nicolab.cadence.tasks.planning.PlanEdits
import ch.nicolab.cadence.tasks.reminder.TimedRemindersRepository
import ch.nicolab.cadence.tasks.data.createServerConnection
import ch.nicolab.cadence.tasks.data.createPageChecks
import ch.nicolab.cadence.tasks.data.createTodoMd
import ch.nicolab.cadence.tasks.links.PageCheckClient
import ch.nicolab.cadence.tasks.todomd.TodoMdClient
import ch.nicolab.cadence.tasks.data.createSyncStatus
import ch.nicolab.cadence.tasks.syncstatus.SyncStatusClient
import ch.nicolab.cadence.tasks.review.ReviewRepository
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.data.createPlanEdits

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

    /** Adresse et clé du serveur, pour les images qu'il sert ; null si aucun serveur n'est configuré. */
    internal suspend fun serverSession(context: Context) =
        ch.nicolab.cadence.tasks.data.currentServerSession(context.applicationContext)

    /** Listes de la revue, servies par le serveur (en ligne, dernière lecture hors ligne). */
    fun review(context: Context): ReviewRepository = createReview(context.applicationContext)

    /** Plages protégées et exceptions, servies par le serveur (dernière lecture gardée, envoi différé hors ligne). */
    fun focus(context: Context): FocusRepository = createFocus(context.applicationContext)

    /** Réglage des rappels à heure fixe, partagé avec le serveur (dernière lecture gardée, envoi différé hors ligne). */
    fun timedReminders(context: Context): TimedRemindersRepository = createTimedReminders(context.applicationContext)

    /** « Vérifier les pages » d'un projet, en ligne seulement ; rien n'est supprimé. */
    fun pageChecks(context: Context): PageCheckClient = createPageChecks(context.applicationContext)

    /** État des dépôts git des projets TODO.md, servi par le serveur (en ligne seulement). */
    fun todoMd(context: Context): TodoMdClient = createTodoMd(context.applicationContext)

    /** Rétroliens des notes et des tâches, lus en ligne. */
    fun backlinks(context: Context): ch.nicolab.cadence.tasks.contentlinks.BacklinksClient =
        ch.nicolab.cadence.tasks.data.createBacklinks(context.applicationContext)

    /** Personnes du choix `@`, lues en ligne et gardées pour le hors ligne. */
    fun people(context: Context): ch.nicolab.cadence.tasks.contentlinks.PeopleClient =
        ch.nicolab.cadence.tasks.data.createPeople(context.applicationContext)

    /** Appareils et conflits vus du serveur (en ligne seulement). */
    fun syncStatus(context: Context): SyncStatusClient = createSyncStatus(context.applicationContext)

    /** File « À trier », lue en ligne et gardée pour le hors ligne. */
    fun triage(context: Context): ch.nicolab.cadence.tasks.triage.TriageRepository =
        ch.nicolab.cadence.tasks.data.createTriage(context.applicationContext)

    /** Classement automatique : réglages, marques et annulation (en ligne), réponses aux suggestions (file différée). */
    fun autoClassify(context: Context): ch.nicolab.cadence.tasks.autoclassify.AutoClassifyRepository =
        ch.nicolab.cadence.tasks.autoclassify.autoClassifyRepository(context)

    /** Réglages de l'agent (en ligne seulement). */
    fun agents(context: Context): ch.nicolab.cadence.tasks.agents.AgentsRepository =
        ch.nicolab.cadence.tasks.data.createAgents(context.applicationContext)

    /** Écritures du plan du jour (Reporter, Placer) : plan local d'abord, appels différés ensuite. */
    internal fun planEdits(context: Context): PlanEdits = createPlanEdits(context.applicationContext)

    fun connection(context: Context): ServerConnection =
        connection ?: synchronized(this) {
            connection ?: createServerConnection(context.applicationContext).also { connection = it }
        }
}

package ch.nicolab.cadence.tasks

import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

/**
 * Seule porte d'entrée des écrans, du widget et des rappels vers les tâches.
 * Toute écriture est locale d'abord (base Room + file d'envoi) et réussit hors
 * ligne ; la synchronisation part ensuite en arrière-plan.
 */
interface TaskRepository {
    /** Tâches de premier niveau (sans sous-tâches), ouvertes et fermées. */
    fun observeTasks(): Flow<List<TaskItem>>
    fun observeTask(uid: String): Flow<TaskItem?>

    /** Toutes les tâches, sous-tâches comprises : pour la recherche. */
    fun observeAllTasks(): Flow<List<TaskItem>>
    fun observeSubtasks(parentUid: String): Flow<List<TaskItem>>
    fun observeProjects(): Flow<List<ProjectItem>>
    fun observeAreas(): Flow<List<AreaItem>>
    fun observeTags(): Flow<List<TagItem>>

    /** Objectifs, résultats clés et envies, en lecture seule sur l'appareil. */
    fun observeGoals(): Flow<List<GoalItem>>
    fun observeInbox(): Flow<List<InboxEntry>>

    /** Notes, épinglées d'abord puis de la plus récente à la plus ancienne. */
    fun observeNotes(): Flow<List<NoteItem>>
    fun observeNote(uid: String): Flow<NoteItem?>
    fun observeSyncStatus(): Flow<SyncStatus>

    /** Retourne l'uid de la tâche créée. */
    suspend fun createTask(draft: TaskDraft): String
    suspend fun updateTask(uid: String, change: TaskChange)

    /**
     * Une tâche simple passe à « terminée ». Une tâche récurrente avance à son
     * occurrence suivante (opération idempotente côté serveur).
     */
    suspend fun completeTask(uid: String)
    suspend fun reopenTask(uid: String)
    suspend fun skipOccurrence(uid: String)
    suspend fun deleteTask(uid: String)

    /**
     * Déplace l'occurrence courante d'une tâche récurrente. Demande le réseau :
     * renvoie un échec explicite hors ligne.
     */
    suspend fun moveRecurring(uid: String, scope: RecurringScope, newDate: LocalDate): Result<Unit>

    /**
     * Écrit les champs de [change] sur la note [uid], qui est créée si elle n'existe pas encore
     * (l'uid est choisi par l'appareil) : une note vide jamais enregistrée n'atteint donc pas le serveur.
     */
    suspend fun saveNote(uid: String, change: NoteChange)
    suspend fun deleteNote(uid: String)

    /** Change le statut du projet [uid] (valeur serveur, voir [ProjectStatus.wire]) ; sans effet si le projet est inconnu. */
    suspend fun setProjectStatus(uid: String, status: ProjectStatus)

    /** Désigne [taskUid] comme prochaine action du projet [projectUid] ; null retire le choix. Sans effet si le projet est inconnu. */
    suspend fun setNextAction(projectUid: String, taskUid: String?)

    /** Crée un domaine (l'uid est choisi par l'appareil) et retourne son uid. */
    suspend fun createArea(name: String): String

    suspend fun captureInbox(text: String): String
    suspend fun deleteInboxItem(uid: String)

    /** Demande une synchronisation au plus tôt (sans attendre la fin). */
    fun requestSync()
}

package ch.nicolab.cadence.tasks

import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.RefusedItem
import ch.nicolab.cadence.tasks.model.SyncConflictItem
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.OccurrenceFields
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.ProjectStatus
import ch.nicolab.cadence.tasks.model.RecurringScope
import ch.nicolab.cadence.tasks.model.SyncStatus
import ch.nicolab.cadence.tasks.model.TagEditProblem
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

    /** Liens trouvés par le serveur, lisibles hors ligne, les plus récents d'abord. */
    fun observeLinks(): Flow<List<LinkItem>>

    /** Note d'un lien ; vide ou null l'efface. Sans effet si le lien est inconnu. */
    suspend fun setLinkNote(uid: String, note: String?)

    /** Statut d'un lien (Tester, Garder, Plus tard, Jeter, ou Nouveau). Sans effet si le lien est inconnu. */
    suspend fun setLinkStatus(uid: String, status: LinkStatus)

    /** Étiquettes d'un lien (remplace l'ensemble). Sans effet si le lien est inconnu. */
    suspend fun setLinkTags(uid: String, tagUids: List<String>)

    /** Jour où revoir un lien mis de côté ; null l'efface. */
    suspend fun setLinkReviewDate(uid: String, date: java.time.LocalDate?)
    fun observeInbox(): Flow<List<InboxEntry>>

    /** Notes, épinglées d'abord puis de la plus récente à la plus ancienne. */
    fun observeNotes(): Flow<List<NoteItem>>
    fun observeNote(uid: String): Flow<NoteItem?>
    fun observeSyncStatus(): Flow<SyncStatus>

    /** Entités du téléphone que le serveur connecté ne connaît pas encore (serveur plus ancien). */
    fun observeUnsupportedEntities(): Flow<List<String>>

    /** Conflits perdus par le téléphone, les plus récents d'abord. */
    fun observeConflicts(): Flow<List<SyncConflictItem>>

    /** [keepLocal] renvoie la valeur du téléphone (nouvelle horloge, elle l'emporte) ; sinon le conflit est classé. */
    suspend fun resolveConflict(id: String, keepLocal: Boolean)

    /** Dernières opérations refusées par le serveur. */
    fun observeRefused(): Flow<List<RefusedItem>>
    suspend fun clearRefused()

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
     * Déplace l'occurrence courante d'une tâche récurrente, sur le serveur (il déplace aussi la règle). Hors
     * ligne, l'appel est gardé et part au prochain passage ([Delivery.QUEUED]).
     */
    suspend fun moveRecurring(uid: String, scope: RecurringScope, newDate: LocalDate): Result<Delivery>

    /**
     * Modifie une occurrence d'une série selon [scope] : « celle-ci » crée une tâche simple et laisse la
     * journée de côté, « celle-ci et les suivantes » coupe la série, « toutes » écrit la série. Hors ligne
     * comme en ligne (opérations de `docs/01-recurring-tasks-behavior.md`). [occurrence] est le jour de
     * l'occurrence touchée, null pour l'occurrence courante. Seuls les champs de [OccurrenceFields.scoped]
     * sont écrits ; le reste de [change] est à écrire par [updateTask].
     */
    suspend fun editRecurring(uid: String, scope: RecurringScope, occurrence: LocalDate?, change: TaskChange): Result<Unit>

    /** Supprime une occurrence selon [scope], avec les mêmes opérations hors ligne ; [occurrence] null = la courante. */
    suspend fun deleteRecurring(uid: String, scope: RecurringScope, occurrence: LocalDate?): Result<Unit>

    /**
     * Écrit les champs de [change] sur la note [uid], qui est créée si elle n'existe pas encore
     * (l'uid est choisi par l'appareil) : une note vide jamais enregistrée n'atteint donc pas le serveur.
     */
    suspend fun saveNote(uid: String, change: NoteChange)
    suspend fun deleteNote(uid: String)

    /** Change le statut du projet [uid] (valeur serveur, voir [ProjectStatus.wire]) ; sans effet si le projet est inconnu. */
    suspend fun setProjectStatus(uid: String, status: ProjectStatus)

    /** Pose (identifiant du jeu partagé) ou retire (null) l'icône du projet [uid] ; refuse un identifiant invalide. Sans effet si le projet est inconnu. */
    suspend fun setProjectIcon(uid: String, icon: String?)

    /** Pose ou retire l'icône de l'étiquette [uid]. */
    suspend fun setTagIcon(uid: String, icon: String?)

    /** Pose (`#rrggbb`) ou retire (null) la couleur de l'étiquette [uid] ; refuse toute autre valeur. Sans effet si l'étiquette est inconnue. */
    suspend fun setTagColor(uid: String, color: String?)

    /**
     * Place le projet [uid] sous [parentUid] (null : au premier niveau). Retourne false, sans rien écrire, quand le
     * projet ou le parent est inconnu ou que le déplacement ferait une boucle (sous lui-même ou l'un de ses sous-projets).
     */
    suspend fun moveProject(uid: String, parentUid: String?): Boolean

    /**
     * Renomme l'étiquette [uid] : [name] est le chemin complet. Ses sous-étiquettes suivent (le serveur renomme
     * l'arbre, seule l'étiquette modifiée est envoyée). Retourne null une fois écrit, sinon la raison du refus.
     */
    suspend fun renameTag(uid: String, name: String): TagEditProblem?

    /** Place l'étiquette [uid] sous [parentUid] (null : à la racine) ; son nom devient `parent/dernier-segment`. */
    suspend fun moveTag(uid: String, parentUid: String?): TagEditProblem?

    /** Désigne [taskUid] comme prochaine action du projet [projectUid] ; null retire le choix. Sans effet si le projet est inconnu. */
    suspend fun setNextAction(projectUid: String, taskUid: String?)

    /** Crée un domaine (l'uid est choisi par l'appareil) et retourne son uid. */
    suspend fun createArea(name: String): String

    /** Crée une étiquette nommée [name] (l'uid est choisi par l'appareil) ; une existante de même nom est rendue. */
    suspend fun createTag(name: String): String

    suspend fun captureInbox(text: String): String
    suspend fun deleteInboxItem(uid: String)

    /** Marque une idée traitée : elle quitte l'Inbox sans être supprimée (un lien reste dans la bibliothèque). */
    suspend fun processInboxItem(uid: String)

    /** Demande une synchronisation au plus tôt (sans attendre la fin). */
    fun requestSync()
}

package ch.nicolab.cadence.tasks

import ch.nicolab.cadence.tasks.model.AddressPlaces
import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.Delivery
import ch.nicolab.cadence.tasks.model.RefusedItem
import ch.nicolab.cadence.tasks.model.SyncConflictItem
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalChange
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkDraft
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

    /** Objectifs, résultats clés et envies. */
    fun observeGoals(): Flow<List<GoalItem>>

    /**
     * Écrit les champs changés de l'objectif ou de l'envie [uid] (entité `goal`). Sans effet si le but est inconnu,
     * si le titre serait vide ou si rien ne change.
     */
    suspend fun updateGoal(uid: String, change: GoalChange)

    /** Supprime l'objectif [uid] (et ses résultats clés, comme le serveur) ; ses tâches et projets perdent le lien. */
    suspend fun deleteGoal(uid: String)

    /**
     * Ajoute une envie [title] au groupe [bucket] de la liste d'envies (l'uid est choisi par l'appareil, entité `goal`).
     * Un titre vide n'écrit rien et rend null.
     */
    suspend fun createWish(title: String, bucket: GoalBucket): String?

    /** Liens enregistrés, lisibles hors ligne, les plus récents d'abord. */
    fun observeLinks(): Flow<List<LinkItem>>

    /** Note d'un lien ; vide ou null l'efface. Sans effet si le lien est inconnu. */
    suspend fun setLinkNote(uid: String, note: String?)

    /** Statut d'un lien (À voir ou Archivé). Sans effet si le lien est inconnu. */
    suspend fun setLinkStatus(uid: String, status: LinkStatus)

    /** Étiquettes d'un lien (remplace l'ensemble). Sans effet si le lien est inconnu. */
    suspend fun setLinkTags(uid: String, tagUids: List<String>)

    /** Titre d'un lien ; vide ou null le rend à celui de la page. */
    suspend fun setLinkTitle(uid: String, title: String?)

    /** Projet d'un lien ; null l'en sort. */
    suspend fun setLinkProject(uid: String, projectUid: String?)

    /** Nouvelle adresse : le serveur la valide et relit la page, par un appel différé nommé [label] s'il est refusé. */
    suspend fun setLinkUrl(uid: String, url: String, label: String)

    /**
     * Met dans les liens, exprès, une adresse écrite dans une tâche ou une note ([sourceType] `task` ou `note`) :
     * le serveur ne prend plus seul celles des tâches et des notes. Appel différé nommé [label].
     */
    suspend fun addLinkFrom(url: String, sourceType: String, sourceUid: String, label: String)

    /**
     * Enregistre [draft] dans les liens par l'appel différé `POST /api/v1/links` nommé [label] : un appareil ne crée pas
     * de ligne `link`, elle revient par la synchro une fois le serveur passé.
     */
    suspend fun addLink(draft: LinkDraft, label: String)

    /**
     * Défait [addLink] : retire l'appel s'il attend encore, sinon supprime le lien revenu de la synchro pour la même
     * source. Rend false quand rien n'a pu être défait (appel parti, lien pas encore revenu).
     */
    suspend fun withdrawLink(draft: LinkDraft): Boolean

    /** Supprime le lien pour de bon ; son adresse n'est plus reprise des tâches et des notes. */
    suspend fun deleteLink(uid: String)

    /**
     * Uid de la page de [projectUid] pour l'adresse [url] (même adresse normalisée, sans « www. » ni « / » final), ou
     * null. Lecture locale.
     */
    suspend fun projectPageUid(projectUid: String, url: String): String?

    /**
     * Ajoute [url] comme page du projet [projectUid] (uid choisi par l'appareil) : ligne Room et envoi `upsert` hors
     * ligne, comme une tâche. Une page déjà là pour cette adresse dans ce projet n'ajoute rien et rend son uid.
     * [url] doit être une adresse web (`http` ou `https`).
     */
    suspend fun addProjectPage(projectUid: String, url: String, title: String?, note: String?): String

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

    /** Tâches ouvertes qui citent [url] et projets qui l'ont enregistrée : lecture locale, hors ligne. */
    suspend fun placesOf(url: String): AddressPlaces

    /** Copie une tâche (contenu, dates, durée, liens) sous un nouvel uid ; null si elle n'existe plus. */
    suspend fun duplicateTask(uid: String): String?
    suspend fun updateTask(uid: String, change: TaskChange)

    /**
     * Une tâche simple passe à « terminée ». Une tâche récurrente avance à son
     * occurrence suivante (opération idempotente côté serveur).
     */
    suspend fun completeTask(uid: String)
    suspend fun reopenTask(uid: String)
    suspend fun skipOccurrence(uid: String)
    suspend fun deleteTask(uid: String)

    /** Transforme la tâche en projet côté serveur, par la file d'appels différés : elle reste masquée jusqu'à l'envoi ou le refus. */
    suspend fun convertToProject(uid: String, name: String)

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

    /** Épingle le projet (`pin_to_sidebar`, la barre latérale du web) ; rien n'est écrit si rien ne change. */
    suspend fun setProjectPinned(uid: String, pinned: Boolean)

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

    /** Remplace le texte d'une idée ; une idée inconnue n'écrit rien. */
    suspend fun renameInboxItem(uid: String, text: String)
    suspend fun deleteInboxItem(uid: String)

    /** Marque une idée traitée : elle quitte l'Inbox sans être supprimée (un lien reste dans la bibliothèque). */
    suspend fun processInboxItem(uid: String)

    /** Remet dans l'Inbox une idée traitée : « Annuler » d'une décision. Une idée inconnue n'écrit rien. */
    suspend fun reopenInboxItem(uid: String)

    /** Demande une synchronisation au plus tôt (sans attendre la fin). */
    fun requestSync()
}

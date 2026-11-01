package ch.nicolab.cadence.tasks.model

import java.time.Instant
import java.time.LocalDate

/** Statuts du serveur Tududi (`Task.STATUS`). */
object TaskStatus {
    const val NOT_STARTED = 0
    const val IN_PROGRESS = 1
    const val DONE = 2
    const val ARCHIVED = 3
    const val WAITING = 4
    const val CANCELLED = 5
    const val PLANNED = 6

    fun isClosed(status: Int) = status == DONE || status == ARCHIVED || status == CANCELLED
}

/** Priorités du serveur (`Task.PRIORITY`) ; null = aucune. */
object TaskPriority {
    const val LOW = 0
    const val MEDIUM = 1
    const val HIGH = 2
}

data class TaskItem(
    val uid: String,
    val name: String,
    val note: String? = null,
    val status: Int = TaskStatus.NOT_STARTED,
    val priority: Int? = null,
    /** Instant tel que stocké par le serveur ; sans heure, c'est la fin du jour dans le fuseau du compte. */
    val dueDate: Instant? = null,
    val dueHasTime: Boolean = false,
    /**
     * Jour calendaire de l'échéance : fuseau du compte sans heure (le serveur stocke
     * la fin du jour), fuseau de l'appareil avec heure.
     */
    val dueDay: LocalDate? = null,
    val deferUntil: Instant? = null,
    val reminderAt: Instant? = null,
    /** null ou "none" : tâche simple ; sinon "daily", "weekly", "monthly"… */
    val recurrenceType: String? = null,
    val projectUid: String? = null,
    val areaUid: String? = null,
    val parentTaskUid: String? = null,
    val tagUids: List<String> = emptyList(),
    val completedAt: Instant? = null,
    val pinnedAt: Instant? = null,
    /** Une modification locale attend encore d'être envoyée au serveur. */
    val pendingSync: Boolean = false,
    /** Début : sans heure, début du jour dans le fuseau du compte ; avec heure, un instant. */
    val startDate: Instant? = null,
    val startHasTime: Boolean = false,
    val startDay: LocalDate? = null,
    val estimatedMinutes: Int? = null,
    val repetition: Repetition = Repetition(RepeatType.NONE),
    /** Champs serveur que l'appareil ne sait pas modifier, lus tels quels (clé serveur, valeur en texte). */
    val extras: Map<String, String> = emptyMap(),
    /** Le projet de la tâche reflète un fichier TODO.md du serveur : seule la case se modifie ici. */
    val fileBacked: Boolean = false,
    /** Entonnoir (docs/34-review.md) : en vue depuis cet instant ; jamais une priorité ni une épingle. */
    val inViewAt: Instant? = null,
    /** Premier jour de la semaine décidée ; jamais une échéance. */
    val weekOf: LocalDate? = null,
    /** Date où revoir une idée mise de côté ; ni rappel ni agenda. */
    val reviewOn: LocalDate? = null,
    val reviewedAt: Instant? = null,
    /** Étiquette `someday` : « Plus tard », hors des suggestions et jamais en retard. */
    val someday: Boolean = false,
    /** Objectif ou résultat clé lié (`goal_uid`). */
    val goalUid: String? = null,
    /** Règle complète de la série (jours, fin, exceptions) ; sert à [RecurrenceExpansion]. */
    val recurrence: RecurrenceRule = RecurrenceRule(),
    /** Occurrence à venir d'une série ([RecurrenceExpansion]) : copie de la tâche enregistrée à un autre jour, ni cochable ni modifiable. */
    val virtual: Boolean = false,
) {
    /** Clé de liste : la tâche enregistrée et ses occurrences à venir partagent le même [uid]. */
    val rowKey: String get() = if (virtual) "$uid|$dueDay" else uid

    val isRecurring: Boolean get() = recurrenceType != null && recurrenceType != "none"
    val isClosed: Boolean get() = TaskStatus.isClosed(status)
}

enum class RepeatType(val wire: String) {
    NONE("none"), DAILY("daily"), WEEKLY("weekly"), MONTHLY("monthly"),

    /** Règle que l'appareil affiche mais ne sait pas écrire (mensuelle par jour de semaine, dernier jour…). */
    OTHER("other"),
}

data class Repetition(val type: RepeatType, val interval: Int = 1) {
    companion object {
        fun of(type: String?, interval: String?): Repetition {
            val kind = when (type) {
                null, "", "none" -> RepeatType.NONE
                "daily" -> RepeatType.DAILY
                "weekly" -> RepeatType.WEEKLY
                "monthly" -> RepeatType.MONTHLY
                else -> RepeatType.OTHER
            }
            val every = if (kind == RepeatType.NONE || kind == RepeatType.OTHER) 1 else interval?.toIntOrNull()?.coerceAtLeast(1) ?: 1
            return Repetition(kind, every)
        }
    }
}

data class ProjectItem(
    val uid: String,
    val name: String,
    val status: String? = null,
    val color: String? = null,
    val areaUid: String? = null,
    val pinToSidebar: Boolean = false,
    val sourceType: String? = null,
    /** Prochaine action choisie (`next_task_uid`) ; n'a de sens que tant que la tâche est ouverte et dans le projet. */
    val nextTaskUid: String? = null,
    val goalUid: String? = null,
    /** Identifiant d'icône du jeu partagé avec le web et les habitudes (`icon`) ; null : aucune icône choisie. */
    val icon: String? = null,
    /** Projet parent (`parent_project_uid`) ; null pour un projet de premier niveau. */
    val parentProjectUid: String? = null,
) {
    val isFileBacked: Boolean get() = sourceType == SOURCE_TODO_MD
    val projectStatus: ProjectStatus get() = ProjectStatus.fromWire(status)
}

/**
 * Statut d'un projet côté serveur, dans l'ordre du sélecteur. Terminé, abandonné et archivé
 * sont clos ; « en pause » forme le stash ; le reste est actif. Un statut inconnu ou absent
 * compte comme « pas commencé ».
 */
enum class ProjectStatus(val wire: String) {
    NOT_STARTED("not_started"),
    PLANNED("planned"),
    IN_PROGRESS("in_progress"),
    WAITING("waiting"),
    DONE("done"),
    CANCELLED("cancelled"),
    PAUSED("paused"),
    ARCHIVED("archived");

    val isClosed: Boolean get() = this == DONE || this == CANCELLED || this == ARCHIVED
    val isStash: Boolean get() = this == PAUSED

    companion object {
        fun fromWire(value: String?): ProjectStatus = entries.firstOrNull { it.wire == value } ?: NOT_STARTED
    }
}

/** `source_type` d'un projet reflétant un dossier TODO.md du serveur. */
const val SOURCE_TODO_MD = "todo_md"

data class AreaItem(val uid: String, val name: String, val color: String? = null)

/**
 * Étiquette. [name] est son chemin complet (`perso/sport`), voir [TagPaths] ; [parentUid] est posé par le
 * serveur, l'arbre se déduit pourtant du nom.
 */
data class TagItem(
    val uid: String,
    val name: String,
    val color: String? = null,
    val icon: String? = null,
    val parentUid: String? = null,
)

data class NoteItem(
    val uid: String,
    val title: String,
    val content: String,
    val projectUid: String? = null,
    val tagUids: List<String> = emptyList(),
    val color: String? = null,
    val updatedAt: Instant? = null,
    val pendingSync: Boolean = false,
    val pinned: Boolean = false,
)

/** Modification d'une note ; un champ nul est laissé tel quel. */
data class NoteChange(
    val title: String? = null,
    val content: String? = null,
    val color: String? = null,
    val clearColor: Boolean = false,
    val pinned: Boolean? = null,
    val projectUid: String? = null,
    val clearProject: Boolean = false,
    val tagUids: List<String>? = null,
)

data class InboxEntry(
    val uid: String,
    val content: String,
    val status: String,
    val createdAt: Instant?,
    val pendingSync: Boolean = false,
)

/** Création d'une tâche ; l'uid est choisi par l'appareil. */
data class TaskDraft(
    val name: String,
    val note: String? = null,
    val dueDate: LocalDate? = null,
    /** Heure locale "HH:mm" ; ignorée sans [dueDate]. */
    val dueTime: String? = null,
    val priority: Int? = null,
    val projectUid: String? = null,
    val tagUids: List<String> = emptyList(),
    /** Domaine désigné par `~nom` dans la saisie (`area_uid`). */
    val areaUid: String? = null,
    /** Fait de la tâche une sous-tâche. */
    val parentTaskUid: String? = null,
    /** Objectif ou envie dont la tâche est un pas (`goal_uid`). */
    val goalUid: String? = null,
    /** Rang parmi ses sœurs (`order`, outliner) ; null le laisse au serveur. */
    val order: Int? = null,
)

/**
 * Modification partielle : seuls les champs non null changent.
 * [clearDue] efface l'échéance ; [clearProject] retire le projet.
 */
data class TaskChange(
    val name: String? = null,
    val note: String? = null,
    val priority: Int? = null,
    /** Retire la priorité (aucune). */
    val clearPriority: Boolean = false,
    val status: Int? = null,
    val dueDate: LocalDate? = null,
    val dueTime: String? = null,
    val clearDue: Boolean = false,
    val projectUid: String? = null,
    val clearProject: Boolean = false,
    val tagUids: List<String>? = null,
    val startDate: LocalDate? = null,
    /** Heure locale "HH:mm" ; une heure seule garde le jour de début déjà prévu. */
    val startTime: String? = null,
    val clearStart: Boolean = false,
    val estimatedMinutes: Int? = null,
    val clearEstimate: Boolean = false,
    val repetition: Repetition? = null,
    /** Entonnoir : true met en vue (l'instant déjà posé est gardé), false retire de la vue. */
    val inView: Boolean? = null,
    /** Premier jour de la semaine décidée ; [clearWeek] retire la semaine. */
    val weekOf: LocalDate? = null,
    val clearWeek: Boolean = false,
    val reviewOn: LocalDate? = null,
    val clearReviewOn: Boolean = false,
    /** true ajoute l'étiquette `someday` et sort de la vue et de la semaine ; false la retire. */
    val later: Boolean? = null,
    /** true épingle la tâche (`pinned_at` = maintenant), false la désépingle. Jamais à portée de série. */
    val pinned: Boolean? = null,
    /** Horodate la décision (`reviewed_at`) : ce que compte « décidées cette semaine ». */
    val reviewed: Boolean = false,
    /** Outliner : fait de la tâche une sous-tâche de [parentTaskUid] ; [clearParent] la remonte au premier niveau. */
    val parentTaskUid: String? = null,
    val clearParent: Boolean = false,
    /** Rang parmi ses sœurs (`order`). */
    val order: Int? = null,
)

enum class RecurringScope(val wire: String) { THIS("this"), FOLLOWING("following"), ALL("all") }

/** Sort d'une écriture qui demande le serveur : partie tout de suite, ou gardée pour le prochain passage. */
enum class Delivery { SENT, QUEUED }

sealed interface SyncStatus {
    /** Aucun serveur configuré : l'app fonctionne seule. */
    data object NotConnected : SyncStatus
    data object Syncing : SyncStatus
    data class Idle(val lastSyncAt: Instant?, val pendingOps: Int) : SyncStatus

    /** Le téléphone n'a pas de réseau : tout s'écrit localement, envoyé au retour de la connexion. */
    data class Offline(val lastSyncAt: Instant?, val pendingOps: Int) : SyncStatus
    data class Failed(val message: String, val pendingOps: Int) : SyncStatus
}

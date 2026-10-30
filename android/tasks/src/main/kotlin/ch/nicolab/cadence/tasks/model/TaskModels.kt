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
) {
    val isRecurring: Boolean get() = recurrenceType != null && recurrenceType != "none"
    val isClosed: Boolean get() = TaskStatus.isClosed(status)
}

data class ProjectItem(
    val uid: String,
    val name: String,
    val status: String? = null,
    val color: String? = null,
    val areaUid: String? = null,
    val pinToSidebar: Boolean = false,
)

data class AreaItem(val uid: String, val name: String, val color: String? = null)

data class TagItem(val uid: String, val name: String, val color: String? = null)

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
)

/**
 * Modification partielle : seuls les champs non null changent.
 * [clearDue] efface l'échéance ; [clearProject] retire le projet.
 */
data class TaskChange(
    val name: String? = null,
    val note: String? = null,
    val priority: Int? = null,
    val status: Int? = null,
    val dueDate: LocalDate? = null,
    val dueTime: String? = null,
    val clearDue: Boolean = false,
    val projectUid: String? = null,
    val clearProject: Boolean = false,
    val tagUids: List<String>? = null,
)

enum class RecurringScope(val wire: String) { THIS("this"), FOLLOWING("following"), ALL("all") }

sealed interface SyncStatus {
    /** Aucun serveur configuré : l'app fonctionne seule. */
    data object NotConnected : SyncStatus
    data object Syncing : SyncStatus
    data class Idle(val lastSyncAt: Instant?, val pendingOps: Int) : SyncStatus
    data class Failed(val message: String, val pendingOps: Int) : SyncStatus
}

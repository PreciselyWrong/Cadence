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
) {
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
)

data class AreaItem(val uid: String, val name: String, val color: String? = null)

data class TagItem(val uid: String, val name: String, val color: String? = null)

data class NoteItem(
    val uid: String,
    val title: String,
    val content: String,
    val projectUid: String? = null,
    val tagUids: List<String> = emptyList(),
    val color: String? = null,
    val updatedAt: Instant? = null,
    val pendingSync: Boolean = false,
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
    /** Fait de la tâche une sous-tâche. */
    val parentTaskUid: String? = null,
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
)

enum class RecurringScope(val wire: String) { THIS("this"), FOLLOWING("following"), ALL("all") }

sealed interface SyncStatus {
    /** Aucun serveur configuré : l'app fonctionne seule. */
    data object NotConnected : SyncStatus
    data object Syncing : SyncStatus
    data class Idle(val lastSyncAt: Instant?, val pendingOps: Int) : SyncStatus
    data class Failed(val message: String, val pendingOps: Int) : SyncStatus
}

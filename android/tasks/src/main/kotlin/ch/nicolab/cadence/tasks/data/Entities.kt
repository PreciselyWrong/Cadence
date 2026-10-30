package ch.nicolab.cadence.tasks.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Copie locale d'une tâche. Les dates restent les chaînes ISO envoyées par le serveur :
 * une occurrence récurrente se désigne par sa date exacte, octet pour octet.
 */
@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val uid: String,
    val name: String,
    val note: String?,
    val status: Int,
    val priority: Int?,
    val dueDateRaw: String?,
    val dueHasTime: Boolean,
    val deferUntilRaw: String?,
    val reminderAtRaw: String?,
    val recurrenceType: String?,
    val projectUid: String?,
    val areaUid: String?,
    val parentTaskUid: String?,
    val tagUidsJson: String,
    val completedAtRaw: String?,
    val pinnedAtRaw: String?,
    val fieldClocksJson: String,
    /** Champs serveur inconnus de l'appareil, gardés tels quels. */
    val extrasJson: String,
) {
    val isRecurring: Boolean get() = recurrenceType != null && recurrenceType != "none"
}

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val uid: String,
    val name: String,
    val status: String?,
    val color: String?,
    val areaUid: String?,
    val pinToSidebar: Boolean,
)

@Entity(tableName = "areas")
data class AreaEntity(
    @PrimaryKey val uid: String,
    val name: String,
    val color: String?,
)

@Entity(tableName = "tags")
data class TagEntity(
    @PrimaryKey val uid: String,
    val name: String,
    val color: String?,
)

@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val uid: String,
    val title: String,
    val content: String,
    val color: String?,
    val projectUid: String?,
    val tagUidsJson: String,
    val updatedAtRaw: String?,
)

@Entity(tableName = "inbox_items")
data class InboxItemEntity(
    @PrimaryKey val uid: String,
    val content: String,
    val status: String,
    val createdAtRaw: String?,
)

/** File d'envoi : une écriture locale, dans l'ordre de création (ordre du rowid). */
@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey val opId: String,
    val entity: String,
    val uid: String,
    val action: String,
    val payloadJson: String,
    val createdAtMs: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
)

/** Opération rejetée par le serveur : gardée pour diagnostic, elle ne sera pas renvoyée. */
@Entity(tableName = "failed_ops")
data class FailedOpEntity(
    @PrimaryKey val opId: String,
    val entity: String,
    val uid: String,
    val reason: String?,
    val atMs: Long,
    /** Libellé de la ligne au moment du rejet (son nom), pour que le diagnostic parle à l'utilisateur. */
    val displayName: String? = null,
)

@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)

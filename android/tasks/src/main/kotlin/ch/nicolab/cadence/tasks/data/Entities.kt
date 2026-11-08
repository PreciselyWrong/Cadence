package ch.nicolab.cadence.tasks.data

import androidx.room.ColumnInfo
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
    /** Entonnoir (docs/34-review.md) : « En vue » depuis cet instant ; null = hors de vue. */
    val inViewAtRaw: String? = null,
    /** « Cette semaine » : premier jour (`YYYY-MM-DD`) de la semaine choisie. */
    val weekOf: String? = null,
    /** « Quand ? » : tâche classée sans moment choisi (`needs_when`, posé par le serveur). */
    @ColumnInfo(defaultValue = "0") val needsWhen: Boolean = false,
    /** Date de réexamen d'une idée mise de côté (`YYYY-MM-DD`) ; jamais une échéance. */
    val reviewOn: String? = null,
    /** Dernière décision prise en revue. */
    val reviewedAtRaw: String? = null,
    /** Clé de la ligne du TODO.md dont vient la tâche (`source_key`, posé par le serveur) ; seule la case se modifie alors ici. */
    val sourceKey: String? = null,
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
    /** `todo_md` pour un projet reflétant un fichier TODO.md du serveur (lecture seule ici). */
    val sourceType: String? = null,
    /** « Garder tel quel » d'un projet stagnant en revue ; posé par le serveur. */
    val reviewedAtRaw: String? = null,
    /** Prochaine action choisie (`next_task_uid`) : une tâche ouverte du projet, effacée par le serveur à sa clôture. */
    val nextTaskUid: String? = null,
    /** Objectif ou résultat clé lié (`goal_uid`). */
    val goalUid: String? = null,
    /** Identifiant d'icône du jeu partagé (`icon`). */
    val icon: String? = null,
    /** Projet parent (`parent_project_uid`). */
    val parentProjectUid: String? = null,
    /** Bannière du projet (`image_url`) ; posée depuis le web, affichée seulement ici. */
    val imageUrl: String? = null,
)

/** Objectif, résultat clé (un objectif parent) ou envie de la liste d'envies (`bucket`). */
@Entity(tableName = "goals")
data class GoalEntity(
    @PrimaryKey val uid: String,
    val title: String,
    val why: String?,
    val horizon: String?,
    val targetDateRaw: String?,
    val status: String?,
    val color: String?,
    val bucket: String?,
    val areaUid: String?,
    val parentGoalUid: String?,
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
    /** Identifiant d'icône du jeu partagé (`icon`). */
    val icon: String? = null,
    /** Étiquette parente (`parent_uid`) ; le nom porte déjà le chemin complet. */
    val parentUid: String? = null,
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
    @ColumnInfo(defaultValue = "0") val pinned: Boolean = false,
)

/** Aperçu d'un lien (titre, image) rapporté par le serveur, gardé pour fonctionner hors ligne. */
@Entity(tableName = "link_previews")
data class LinkPreviewEntity(
    @PrimaryKey val url: String,
    val title: String?,
    val description: String?,
    val imageUrl: String?,
    val fetchedAtMs: Long,
    val failed: Boolean,
)

/**
 * Lien trouvé par le serveur dans une idée, une tâche ou une note (entité `link`). Métadonnées en lecture
 * seule ; la note et le statut s'écrivent ici et partent par la file d'envoi.
 */
@Entity(tableName = "links")
data class LinkEntity(
    @PrimaryKey val uid: String,
    val url: String,
    val title: String?,
    val description: String?,
    val imageUrl: String?,
    val siteName: String?,
    val kind: String?,
    val githubStars: Int?,
    val githubLanguage: String?,
    val githubLastCommitRaw: String?,
    val readmeExcerpt: String?,
    val note: String?,
    val status: String?,
    val tagUidsJson: String,
    val sourceType: String?,
    val sourceUid: String?,
    val fetchStatus: String?,
    val createdAtRaw: String?,
    /** Jour de revue d'un lien mis de côté (YYYY-MM-DD), écrit par le serveur ou le téléphone. */
    val reviewAtRaw: String? = null,
    val projectUid: String? = null,
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

/**
 * Champ d'une écriture du téléphone écartée par le serveur, qui avait une valeur plus récente : les deux
 * valeurs, au format du serveur ([localJson], [serverJson]) et lisibles ([localText], [serverText]).
 * Une ligne par champ (`entity|uid|field`) : un nouveau conflit sur le même champ remplace l'ancien.
 */
@Entity(tableName = "sync_conflicts")
data class SyncConflictEntity(
    @PrimaryKey val id: String,
    val entity: String,
    val uid: String,
    val field: String,
    val localJson: String,
    val serverJson: String?,
    val localText: String,
    val serverText: String?,
    val displayName: String?,
    val atMs: Long,
)

/** Appel à l'API fait hors ligne (revue, routine, occurrence déplacée), rejoué au passage suivant. */
@Entity(tableName = "deferred_calls")
data class DeferredCallEntity(
    @PrimaryKey val key: String,
    val method: String,
    val path: String,
    val bodyJson: String?,
    val label: String,
    val createdAtMs: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
)

@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)

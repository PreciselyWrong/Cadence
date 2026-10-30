package ch.nicolab.cadence.tasks.data

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

data class TaskRow(
    @Embedded val task: TaskEntity,
    /** Une opération d'envoi attend pour cette tâche. */
    val pendingSync: Boolean,
)

data class InboxRow(
    @Embedded val item: InboxItemEntity,
    val pendingSync: Boolean,
)

@Dao
interface TaskDao {
    @Query(
        """SELECT tasks.*, EXISTS(SELECT 1 FROM outbox WHERE outbox.entity = 'task' AND outbox.uid = tasks.uid) AS pendingSync
        FROM tasks WHERE parentTaskUid IS NULL""",
    )
    fun observeTopLevel(): Flow<List<TaskRow>>

    @Query(
        """SELECT tasks.*, EXISTS(SELECT 1 FROM outbox WHERE outbox.entity = 'task' AND outbox.uid = tasks.uid) AS pendingSync
        FROM tasks WHERE uid = :uid""",
    )
    fun observeOne(uid: String): Flow<TaskRow?>

    @Query(
        """SELECT tasks.*, EXISTS(SELECT 1 FROM outbox WHERE outbox.entity = 'task' AND outbox.uid = tasks.uid) AS pendingSync
        FROM tasks WHERE parentTaskUid = :parentUid""",
    )
    fun observeChildren(parentUid: String): Flow<List<TaskRow>>

    @Query("SELECT * FROM tasks WHERE uid = :uid")
    suspend fun get(uid: String): TaskEntity?

    @Upsert
    suspend fun upsert(task: TaskEntity)

    @Query("DELETE FROM tasks WHERE uid = :uid")
    suspend fun delete(uid: String)

    @Query("DELETE FROM tasks WHERE uid NOT IN (SELECT uid FROM outbox WHERE entity = 'task')")
    suspend fun deleteSynced()
}

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Upsert
    suspend fun upsert(project: ProjectEntity)

    @Query("DELETE FROM projects WHERE uid = :uid")
    suspend fun delete(uid: String)

    @Query("DELETE FROM projects")
    suspend fun deleteAll()
}

@Dao
interface AreaDao {
    @Query("SELECT * FROM areas ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<AreaEntity>>

    @Upsert
    suspend fun upsert(area: AreaEntity)

    @Query("DELETE FROM areas WHERE uid = :uid")
    suspend fun delete(uid: String)

    @Query("DELETE FROM areas")
    suspend fun deleteAll()
}

@Dao
interface TagDao {
    @Query("SELECT * FROM tags ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<TagEntity>>

    @Upsert
    suspend fun upsert(tag: TagEntity)

    @Query("DELETE FROM tags WHERE uid = :uid")
    suspend fun delete(uid: String)

    @Query("DELETE FROM tags")
    suspend fun deleteAll()
}

@Dao
interface InboxDao {
    @Query(
        """SELECT inbox_items.*, EXISTS(SELECT 1 FROM outbox WHERE outbox.entity = 'inbox_item' AND outbox.uid = inbox_items.uid) AS pendingSync
        FROM inbox_items ORDER BY createdAtRaw DESC""",
    )
    fun observeAll(): Flow<List<InboxRow>>

    @Upsert
    suspend fun upsert(item: InboxItemEntity)

    @Query("DELETE FROM inbox_items WHERE uid = :uid")
    suspend fun delete(uid: String)

    @Query("DELETE FROM inbox_items WHERE uid NOT IN (SELECT uid FROM outbox WHERE entity = 'inbox_item')")
    suspend fun deleteSynced()
}

@Dao
interface OutboxDao {
    @Insert
    suspend fun insert(op: OutboxEntity)

    @Query("SELECT COUNT(*) FROM outbox")
    fun observeCount(): Flow<Int>

    @Query("SELECT * FROM outbox ORDER BY rowid LIMIT :limit")
    suspend fun pending(limit: Int): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE entity = :entity AND uid = :uid ORDER BY rowid")
    suspend fun forUid(entity: String, uid: String): List<OutboxEntity>

    @Query("DELETE FROM outbox WHERE opId IN (:opIds)")
    suspend fun deleteByIds(opIds: List<String>)

    @Query("UPDATE outbox SET attempts = attempts + 1, lastError = :message WHERE opId IN (:opIds)")
    suspend fun markFailed(opIds: List<String>, message: String)
}

@Dao
interface FailedOpDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(op: FailedOpEntity)
}

@Dao
interface SyncMetaDao {
    @Query("SELECT value FROM sync_meta WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Query("SELECT value FROM sync_meta WHERE `key` = :key")
    fun observe(key: String): Flow<String?>

    @Upsert
    suspend fun put(meta: SyncMetaEntity)

    @Query("DELETE FROM sync_meta WHERE `key` = :key")
    suspend fun delete(key: String)
}

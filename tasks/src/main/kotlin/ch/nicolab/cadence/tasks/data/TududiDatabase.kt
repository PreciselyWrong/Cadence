package ch.nicolab.cadence.tasks.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        TaskEntity::class,
        ProjectEntity::class,
        AreaEntity::class,
        TagEntity::class,
        InboxItemEntity::class,
        OutboxEntity::class,
        FailedOpEntity::class,
        SyncMetaEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class TududiDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun projectDao(): ProjectDao
    abstract fun areaDao(): AreaDao
    abstract fun tagDao(): TagDao
    abstract fun inboxDao(): InboxDao
    abstract fun outboxDao(): OutboxDao
    abstract fun failedOpDao(): FailedOpDao
    abstract fun syncMetaDao(): SyncMetaDao
}

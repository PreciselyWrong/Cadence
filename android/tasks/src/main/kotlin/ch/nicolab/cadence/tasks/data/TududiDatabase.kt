package ch.nicolab.cadence.tasks.data

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        TaskEntity::class,
        ProjectEntity::class,
        AreaEntity::class,
        TagEntity::class,
        NoteEntity::class,
        InboxItemEntity::class,
        OutboxEntity::class,
        FailedOpEntity::class,
        SyncMetaEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class TududiDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun projectDao(): ProjectDao
    abstract fun areaDao(): AreaDao
    abstract fun tagDao(): TagDao
    abstract fun noteDao(): NoteDao
    abstract fun inboxDao(): InboxDao
    abstract fun outboxDao(): OutboxDao
    abstract fun failedOpDao(): FailedOpDao
    abstract fun syncMetaDao(): SyncMetaDao
}

/** Ajoute le nom de la ligne rejetée au journal des échecs. */
internal val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE failed_ops ADD COLUMN displayName TEXT")
    }
}

/**
 * Ajoute les notes. Le curseur est retiré : le prochain passage refait un instantané complet
 * (les écritures en attente sont conservées) pour que les notes existantes arrivent.
 */
internal val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `notes` (`uid` TEXT NOT NULL, `title` TEXT NOT NULL, `content` TEXT NOT NULL, " +
                "`color` TEXT, `projectUid` TEXT, `tagUidsJson` TEXT NOT NULL, `updatedAtRaw` TEXT, PRIMARY KEY(`uid`))",
        )
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

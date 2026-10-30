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
        LinkPreviewEntity::class,
        InboxItemEntity::class,
        OutboxEntity::class,
        FailedOpEntity::class,
        SyncMetaEntity::class,
    ],
    version = 5,
    exportSchema = true,
)
abstract class TududiDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun projectDao(): ProjectDao
    abstract fun areaDao(): AreaDao
    abstract fun tagDao(): TagDao
    abstract fun noteDao(): NoteDao
    abstract fun linkPreviewDao(): LinkPreviewDao
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

/**
 * Épingle des notes (écriture depuis l'appareil) et cache des aperçus de liens. Le curseur est retiré :
 * le prochain instantané apporte l'état « épinglée » des notes déjà reçues.
 */
internal val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `link_previews` (`url` TEXT NOT NULL, `title` TEXT, `description` TEXT, " +
                "`imageUrl` TEXT, `fetchedAtMs` INTEGER NOT NULL, `failed` INTEGER NOT NULL, PRIMARY KEY(`url`))",
        )
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

/**
 * Origine d'un projet (`source_type`, `todo_md` pour un fichier TODO.md du serveur). Le curseur est retiré :
 * le prochain instantané apporte la valeur des projets déjà reçus.
 */
internal val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE projects ADD COLUMN sourceType TEXT")
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

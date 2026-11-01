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
        GoalEntity::class,
        TagEntity::class,
        NoteEntity::class,
        LinkPreviewEntity::class,
        InboxItemEntity::class,
        OutboxEntity::class,
        FailedOpEntity::class,
        SyncMetaEntity::class,
    ],
    version = 8,
    exportSchema = true,
)
abstract class TududiDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun projectDao(): ProjectDao
    abstract fun areaDao(): AreaDao
    abstract fun goalDao(): GoalDao
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

/**
 * Entonnoir de décision (`in_view_at`, `week_of`, `review_on`, `reviewed_at` des tâches, `reviewed_at` des
 * projets) en colonnes. Le curseur est retiré : le prochain instantané remplit ces colonnes depuis le serveur
 * (les valeurs étaient jusque-là gardées dans `extrasJson`).
 */
internal val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tasks ADD COLUMN inViewAtRaw TEXT")
        db.execSQL("ALTER TABLE tasks ADD COLUMN weekOf TEXT")
        db.execSQL("ALTER TABLE tasks ADD COLUMN reviewOn TEXT")
        db.execSQL("ALTER TABLE tasks ADD COLUMN reviewedAtRaw TEXT")
        db.execSQL("ALTER TABLE projects ADD COLUMN reviewedAtRaw TEXT")
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

/**
 * Prochaine action et objectif lié d'un projet, et table des objectifs. Le curseur est retiré : le prochain
 * instantané apporte les objectifs et les valeurs des projets déjà reçus.
 */
internal val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE projects ADD COLUMN nextTaskUid TEXT")
        db.execSQL("ALTER TABLE projects ADD COLUMN goalUid TEXT")
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `goals` (`uid` TEXT NOT NULL, `title` TEXT NOT NULL, `why` TEXT, `horizon` TEXT, " +
                "`targetDateRaw` TEXT, `status` TEXT, `color` TEXT, `bucket` TEXT, `areaUid` TEXT, `parentGoalUid` TEXT, " +
                "PRIMARY KEY(`uid`))",
        )
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

/**
 * Icône et parent des projets (sous-projets), icône et parent des étiquettes (noms devenus des chemins
 * `perso/sport` côté serveur). Le curseur est retiré : le prochain instantané retélécharge les étiquettes
 * renommées et remplit les nouvelles colonnes.
 */
internal val MIGRATION_7_8 = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE projects ADD COLUMN icon TEXT")
        db.execSQL("ALTER TABLE projects ADD COLUMN parentProjectUid TEXT")
        db.execSQL("ALTER TABLE tags ADD COLUMN icon TEXT")
        db.execSQL("ALTER TABLE tags ADD COLUMN parentUid TEXT")
        db.execSQL("DELETE FROM sync_meta WHERE `key` = 'cursor'")
    }
}

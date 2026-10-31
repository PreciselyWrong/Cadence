package ch.nicolab.cadence.data.sync

import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Journal des écritures d'habitudes, tenu par SQLite lui-même : chaque insertion, modification ou
 * suppression d'une table synchronisée note dans `habit_sync_outbox` les champs qui ont changé et
 * l'instant de l'écriture. Aucun point d'écriture du dépôt ne peut donc l'oublier, widget, rappel,
 * import Health Connect ou restauration compris.
 *
 * - Le déclencheur d'insertion tourne avant l'écriture pour comparer avec la ligne qu'un
 *   `INSERT OR REPLACE` va remplacer : seuls les champs réellement changés sont notés.
 * - Appliquer une ligne du serveur pose `applying` dans `habit_sync_state` et coupe tout cela.
 * - L'horloge d'un champ dépasse la plus haute horloge serveur déjà vue (`floor_ms`), comme
 *   `Hlc.now()` côté tâches : une écriture faite après avoir lu une modification distante lui succède.
 */
object HabitSyncTriggers {
    /** À incrémenter à chaque changement des déclencheurs : ils sont recréés à l'ouverture suivante. */
    const val VERSION = "2"

    const val STATE_VERSION = "triggers_version"
    const val STATE_APPLYING = "applying"
    const val STATE_FLOOR = "floor_ms"

    private const val NAME_PREFIX = "hs_"

    private const val QUIET = "(SELECT value FROM habit_sync_state WHERE `key` = 'applying') IS NULL"

    /** Millisecondes depuis l'époque, au moins une de plus que la plus haute horloge serveur connue. */
    internal const val NOW =
        "MAX(CAST(strftime('%s','now') AS INTEGER) * 1000 + CAST(substr(strftime('%f','now'), 4) AS INTEGER), " +
            "COALESCE((SELECT CAST(value AS INTEGER) FROM habit_sync_state WHERE `key` = 'floor_ms'), 0) + 1)"

    /** À poser sur le constructeur de la base : crée ou met à jour les déclencheurs à l'ouverture. */
    val callback = object : RoomDatabase.Callback() {
        override fun onOpen(db: SupportSQLiteDatabase) {
            install(db)
        }
    }

    fun install(db: SupportSQLiteDatabase) {
        val current = db.query("SELECT value FROM habit_sync_state WHERE `key` = '$STATE_VERSION'").use {
            if (it.moveToFirst()) it.getString(0) else null
        }
        if (current == VERSION) return
        db.beginTransaction()
        try {
            existingTriggers(db).forEach { db.execSQL("DROP TRIGGER IF EXISTS $it") }
            HabitSyncSpecs.all.flatMap(::statementsFor).forEach(db::execSQL)
            db.execSQL("INSERT OR REPLACE INTO habit_sync_state (`key`, value) VALUES ('$STATE_VERSION', '$VERSION')")
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun existingTriggers(db: SupportSQLiteDatabase): List<String> =
        db.query("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '$NAME_PREFIX%'").use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.getString(0)) }
        }

    internal fun statementsFor(spec: EntitySpec): List<String> {
        val entity = spec.entity
        val table = spec.table
        val newUid = spec.uidSql("NEW")
        val oldUid = spec.uidSql("OLD")
        val sameRow = "${spec.uidSql("t")} = $newUid"
        val onInsert = spec.fields.joinToString("\n") { field ->
            """
            INSERT OR REPLACE INTO habit_sync_outbox (entity, uid, field, changedMs)
            SELECT '$entity', $newUid, '${field.wire}', $NOW
            WHERE NOT EXISTS (SELECT 1 FROM $table t WHERE $sameRow)
               OR (SELECT t.${field.column} FROM $table t WHERE $sameRow) IS NOT NEW.${field.column};
            """.trimIndent()
        }
        val onUpdate = spec.fields.joinToString("\n") { field ->
            """
            INSERT OR REPLACE INTO habit_sync_outbox (entity, uid, field, changedMs)
            SELECT '$entity', $newUid, '${field.wire}', $NOW WHERE OLD.${field.column} IS NOT NEW.${field.column};
            """.trimIndent()
        }
        return listOf(
            """
            CREATE TRIGGER $NAME_PREFIX${table}_i BEFORE INSERT ON $table WHEN $QUIET
            BEGIN
            $onInsert
            END
            """.trimIndent(),
            // Un `INSERT OR REPLACE` supprime puis recrée : la marque posée par la suppression tombe ici.
            """
            CREATE TRIGGER $NAME_PREFIX${table}_a AFTER INSERT ON $table WHEN $QUIET
            BEGIN
            DELETE FROM habit_sync_outbox WHERE entity = '$entity' AND uid = $newUid AND field = '${HabitSyncSpecs.DELETE_MARK}';
            END
            """.trimIndent(),
            """
            CREATE TRIGGER $NAME_PREFIX${table}_u AFTER UPDATE ON $table WHEN $QUIET
            BEGIN
            $onUpdate
            END
            """.trimIndent(),
            """
            CREATE TRIGGER $NAME_PREFIX${table}_d AFTER DELETE ON $table WHEN $QUIET
            BEGIN
            INSERT OR REPLACE INTO habit_sync_outbox (entity, uid, field, changedMs)
            VALUES ('$entity', $oldUid, '${HabitSyncSpecs.DELETE_MARK}', $NOW);
            END
            """.trimIndent(),
        )
    }

    /** Note tous les champs de toutes les lignes comme à envoyer (première synchro d'un téléphone déjà rempli). */
    fun markAllDirty(db: SupportSQLiteDatabase) {
        HabitSyncSpecs.all.forEach { spec ->
            spec.fields.forEach { field ->
                db.execSQL(
                    "INSERT OR REPLACE INTO habit_sync_outbox (entity, uid, field, changedMs) " +
                        "SELECT '${spec.entity}', ${spec.uidSql("t")}, '${field.wire}', $NOW FROM ${spec.table} t",
                )
            }
        }
    }
}

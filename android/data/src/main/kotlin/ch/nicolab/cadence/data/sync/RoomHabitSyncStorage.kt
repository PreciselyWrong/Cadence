package ch.nicolab.cadence.data.sync

import android.content.ContentValues
import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteDatabase
import androidx.room.withTransaction
import androidx.sqlite.db.SupportSQLiteDatabase
import ch.nicolab.cadence.data.local.CadenceDatabase
import ch.nicolab.cadence.data.local.entities.HabitSyncStateEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

/**
 * Habitudes stockées dans Room, lues et écrites en SQL à partir de [HabitSyncSpecs]. Les écritures
 * serveur passent par une transaction qui pose `applying` : les déclencheurs de [HabitSyncTriggers]
 * ne notent alors rien.
 */
class RoomHabitSyncStorage(private val database: CadenceDatabase) : HabitSyncStorage {
    private val dao get() = database.habitSyncDao()
    private val db: SupportSQLiteDatabase get() = database.openHelper.writableDatabase

    override suspend fun pendingEntries(maxRows: Int): List<OutboxEntry> {
        val out = mutableListOf<OutboxEntry>()
        var rows = 0
        for (spec in HabitSyncSpecs.all) {
            if (rows >= maxRows) break
            val limit = (maxRows - rows) * spec.fields.size + 1
            val chunk = dao.pendingOf(spec.entity, limit).map { OutboxEntry(it.entity, it.uid, it.field, it.changedMs) }
            // Une page pleine peut couper la dernière ligne en deux : on la laisse au tour suivant.
            val complete = if (chunk.size >= limit) chunk.dropLastWhile { it.uid == chunk.last().uid } else chunk
            rows += complete.map { it.uid }.distinct().size
            out += complete
        }
        return out
    }

    override suspend fun row(entity: String, uid: String): Map<String, Any?>? = withContext(Dispatchers.IO) {
        val spec = HabitSyncSpecs.byEntity.getValue(entity)
        findRow(spec, spec.locate(uid))
    }

    override suspend fun clear(entries: Collection<OutboxEntry>) {
        database.withTransaction {
            entries.forEach { dao.clear(it.entity, it.uid, it.field, it.changedMs) }
        }
    }

    override suspend fun apply(entity: String, data: JsonObject): ApplyResult = withContext(Dispatchers.IO) {
        val spec = HabitSyncSpecs.byEntity.getValue(entity)
        val uid = HabitWire.uidOf(data)
        val columns = HabitWire.wireToColumns(spec, data)
        try {
            database.runInTransaction<ApplyResult> { applyInTransaction(spec, uid, columns) }
        } catch (error: SQLiteConstraintException) {
            // Parent absent (supprimé ici, ou pas encore reçu) : la ligne n'a nulle part où se poser.
            ApplyResult.Skipped("contrainte : ${error.message}")
        }
    }

    private fun applyInTransaction(spec: EntitySpec, uid: String, columns: Map<String, Any?>): ApplyResult {
        db.execSQL("INSERT OR REPLACE INTO habit_sync_state (`key`, value) VALUES ('${HabitSyncTriggers.STATE_APPLYING}', '1')")
        try {
            val pending = pendingFields(spec.entity, uid)
            if (HabitSyncSpecs.DELETE_MARK in pending) return ApplyResult.Skipped("suppression en attente")
            val locate = spec.locate(uid)
            if (findRow(spec, locate) != null) {
                val kept = columns.filterKeys { column -> spec.byColumn.getValue(column).wire !in pending }
                if (kept.isNotEmpty()) update(spec.table, kept, locate)
                return ApplyResult.Applied()
            }
            var replacedEntry: String? = null
            if (spec.naturalKey.isNotEmpty()) {
                val key = spec.naturalKey.associateWith { columns[it] }
                if (key.values.all { it != null }) {
                    findRow(spec, key.mapValues { it.value!! })?.let { rival ->
                        val rivalUid = uidOf(spec, key)
                        if (rivalUid != null && rivalUid != uid) {
                            if (pendingFields(spec.entity, rivalUid).isNotEmpty()) {
                                return ApplyResult.Skipped("la clé naturelle est prise par une écriture en attente")
                            }
                            if (spec.entity == "health_connect_import") replacedEntry = rival["entryId"] as? String
                            delete(spec.table, spec.locate(rivalUid))
                            db.execSQL("DELETE FROM habit_sync_outbox WHERE entity = ? AND uid = ?", arrayOf(spec.entity, rivalUid))
                        }
                    }
                }
            }
            insert(spec.table, locate + columns)
            return ApplyResult.Applied(replacedEntry)
        } finally {
            db.execSQL("DELETE FROM habit_sync_state WHERE `key` = '${HabitSyncTriggers.STATE_APPLYING}'")
        }
    }

    override suspend fun delete(entity: String, uid: String) {
        withContext(Dispatchers.IO) {
            val spec = HabitSyncSpecs.byEntity.getValue(entity)
            database.runInTransaction {
                db.execSQL("INSERT OR REPLACE INTO habit_sync_state (`key`, value) VALUES ('${HabitSyncTriggers.STATE_APPLYING}', '1')")
                try {
                    delete(spec.table, spec.locate(uid))
                    db.execSQL("DELETE FROM habit_sync_outbox WHERE entity = ? AND uid = ?", arrayOf(entity, uid))
                } finally {
                    db.execSQL("DELETE FROM habit_sync_state WHERE `key` = '${HabitSyncTriggers.STATE_APPLYING}'")
                }
            }
        }
    }

    override suspend fun deleteEntry(entryUid: String) {
        withContext(Dispatchers.IO) { db.execSQL("DELETE FROM habit_entries WHERE id = ?", arrayOf(entryUid)) }
    }

    override suspend fun displayName(entity: String, uid: String): String? = withContext(Dispatchers.IO) {
        val spec = HabitSyncSpecs.byEntity.getValue(entity)
        val sql = when {
            entity == "habit_group" || entity == "habit" -> "SELECT name FROM ${spec.table} t WHERE ${spec.uidSql("t")} = ?"
            else -> "SELECT h.name FROM ${spec.table} t JOIN habits h ON h.id = t.habitId WHERE ${spec.uidSql("t")} = ?"
        }
        db.query(sql, arrayOf(uid)).use { if (it.moveToFirst()) it.getString(0) else null }
    }

    override suspend fun markAllDirty() {
        withContext(Dispatchers.IO) { database.runInTransaction { HabitSyncTriggers.markAllDirty(db) } }
    }

    override suspend fun raiseClockFloor(ms: Long) {
        val current = dao.state(HabitSyncTriggers.STATE_FLOOR)?.toLongOrNull() ?: 0L
        if (ms > current) dao.putState(HabitSyncStateEntity(HabitSyncTriggers.STATE_FLOOR, ms.toString()))
    }

    override fun observeLastChange(): Flow<Long> = dao.observeLastChange()

    private fun pendingFields(entity: String, uid: String): Set<String> =
        db.query("SELECT field FROM habit_sync_outbox WHERE entity = ? AND uid = ?", arrayOf(entity, uid)).use { cursor ->
            buildSet { while (cursor.moveToNext()) add(cursor.getString(0)) }
        }

    private fun uidOf(spec: EntitySpec, key: Map<String, Any?>): String? {
        val where = key.keys.joinToString(" AND ") { "t.$it = ?" }
        return db.query(
            "SELECT ${spec.uidSql("t")} FROM ${spec.table} t WHERE $where",
            key.values.map { it.toString() }.toTypedArray(),
        ).use { if (it.moveToFirst()) it.getString(0) else null }
    }

    private fun findRow(spec: EntitySpec, key: Map<String, Any>): Map<String, Any?>? {
        val where = key.keys.joinToString(" AND ") { "$it = ?" }
        return db.query("SELECT * FROM ${spec.table} WHERE $where", key.values.map { it.toString() }.toTypedArray()).use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            buildMap {
                for (index in 0 until cursor.columnCount) {
                    val value: Any? = when (cursor.getType(index)) {
                        android.database.Cursor.FIELD_TYPE_NULL -> null
                        android.database.Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index)
                        else -> cursor.getString(index)
                    }
                    put(cursor.getColumnName(index), value)
                }
            }
        }
    }

    private fun insert(table: String, values: Map<String, Any?>) {
        // `insert` rend -1 au lieu de lever : une contrainte violée doit annuler la transaction.
        if (db.insert(table, SQLiteDatabase.CONFLICT_NONE, contentValues(values)) == -1L) {
            throw SQLiteConstraintException("insertion refusée dans $table")
        }
    }

    private fun update(table: String, values: Map<String, Any?>, key: Map<String, Any>) {
        val where = key.keys.joinToString(" AND ") { "$it = ?" }
        db.update(table, SQLiteDatabase.CONFLICT_NONE, contentValues(values), where, key.values.map { it.toString() }.toTypedArray())
    }

    private fun delete(table: String, key: Map<String, Any>) {
        val where = key.keys.joinToString(" AND ") { "$it = ?" }
        db.delete(table, where, key.values.map { it.toString() }.toTypedArray())
    }

    private fun contentValues(values: Map<String, Any?>) = ContentValues().apply {
        values.forEach { (column, value) ->
            when (value) {
                null -> putNull(column)
                is Long -> put(column, value)
                else -> put(column, value.toString())
            }
        }
    }
}

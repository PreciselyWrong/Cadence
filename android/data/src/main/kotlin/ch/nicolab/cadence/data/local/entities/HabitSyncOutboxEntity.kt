package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity

/**
 * Un champ d'habitude modifié sur l'appareil et pas encore envoyé. Les déclencheurs SQL
 * (`HabitSyncTriggers`) l'écrivent à chaque écriture, d'où qu'elle vienne ; `field` vaut
 * `*delete` pour une suppression. [changedMs] date l'écriture et devient l'horloge du champ.
 */
@Entity(tableName = "habit_sync_outbox", primaryKeys = ["entity", "uid", "field"])
data class HabitSyncOutboxEntity(
    val entity: String,
    val uid: String,
    val field: String,
    val changedMs: Long,
)

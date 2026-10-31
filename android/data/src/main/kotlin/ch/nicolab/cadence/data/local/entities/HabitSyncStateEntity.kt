package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Réglages internes de la synchro des habitudes : `applying` coupe les déclencheurs pendant qu'une
 * ligne serveur est appliquée, `floor_ms` est la plus haute horloge serveur vue (un champ écrit
 * ensuite doit la dépasser, comme avec l'horloge hybride des tâches).
 */
@Entity(tableName = "habit_sync_state")
data class HabitSyncStateEntity(
    @PrimaryKey val key: String,
    val value: String,
)

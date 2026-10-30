package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

/**
 * Chronomètre en cours d'une habitude. Une habitude n'en a qu'un : la clé est son
 * identifiant. Seuls les segments terminés et l'instant de reprise sont écrits - le temps
 * écoulé reste dérivé, donc juste après un redémarrage du processus.
 */
@Entity(
    tableName = "habit_timers",
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class HabitTimerEntity(
    @PrimaryKey val habitId: String,
    val accumulatedSeconds: Long,
    /** Époque en millisecondes du début du segment courant, nul si le chronomètre est arrêté. */
    val runningSinceEpochMs: Long?,
)

package ch.nicolab.cadence.data.local.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "learned_question_settings",
    foreignKeys = [
        ForeignKey(
            entity = HabitEntity::class,
            parentColumns = ["id"],
            childColumns = ["habitId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("habitId")],
)
data class LearnedQuestionSettingsEntity(
    @PrimaryKey val habitId: String,
    val enabled: Boolean,
    /** Heure locale « HH:mm » à laquelle la question apparaît. */
    val askAt: String,
    val thresholdPercent: Int,
    /** Noms `DayOfWeek` séparés par des virgules, vide quand aucun jour n'est muet. */
    val mutedWeekdays: String,
    @ColumnInfo(defaultValue = "1") val silentDuringPauses: Boolean = true,
)

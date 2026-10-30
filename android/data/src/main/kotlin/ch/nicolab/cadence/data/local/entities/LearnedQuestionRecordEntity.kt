package ch.nicolab.cadence.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

/**
 * Une question traitée pour un jour donné, quelle qu'ait été la réponse. La clé composite
 * garantit qu'un jour ne reçoit qu'une seule réponse, même après un double tap.
 */
@Entity(
    tableName = "learned_question_records",
    primaryKeys = ["habitId", "localDate"],
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
data class LearnedQuestionRecordEntity(
    val habitId: String,
    val localDate: String,
    val outcome: String,
    val valueMinor: Long? = null,
    val recordedAtEpochMs: Long,
)

package ch.nicolab.cadence.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import ch.nicolab.cadence.data.local.entities.LearnedQuestionRecordEntity
import ch.nicolab.cadence.data.local.entities.LearnedQuestionSettingsEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface LearnedQuestionDao {
    @Query(
        """
        SELECT (SELECT COUNT(*) FROM learned_question_records) +
            (SELECT COALESCE(SUM(enabled + thresholdPercent + LENGTH(mutedWeekdays) + CAST(REPLACE(askAt, ':', '') AS INTEGER) + 1), 0) FROM learned_question_settings)
        """,
    )
    fun observeRevision(): Flow<Long>

    @Query("SELECT * FROM learned_question_settings WHERE habitId = :habitId")
    suspend fun getSettings(habitId: String): LearnedQuestionSettingsEntity?

    @Query("SELECT * FROM learned_question_settings")
    suspend fun getAllSettings(): List<LearnedQuestionSettingsEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSettings(settings: LearnedQuestionSettingsEntity)

    @Query("SELECT * FROM learned_question_records WHERE habitId = :habitId ORDER BY localDate")
    suspend fun getRecords(habitId: String): List<LearnedQuestionRecordEntity>

    @Query("SELECT * FROM learned_question_records WHERE habitId = :habitId AND localDate = :localDate")
    suspend fun getRecord(habitId: String, localDate: String): LearnedQuestionRecordEntity?

    @Query("SELECT * FROM learned_question_records ORDER BY habitId, localDate")
    suspend fun getAllRecords(): List<LearnedQuestionRecordEntity>

    /** La première réponse d'un jour gagne : un second envoi n'écrase jamais la trace. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertRecord(record: LearnedQuestionRecordEntity)
}

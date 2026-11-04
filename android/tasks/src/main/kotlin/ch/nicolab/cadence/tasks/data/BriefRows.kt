package ch.nicolab.cadence.tasks.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Brief du jour tel que le serveur l'a donné (`brief`, JSON brut), gardé pour la lecture hors ligne. Une ligne par
 * date locale ; un brief absent côté serveur efface la ligne.
 */
@Entity(tableName = "brief")
data class BriefEntity(
    @PrimaryKey val date: String,
    val json: String,
    val version: Int,
    val status: String,
    val generatedAt: String?,
    val fetchedAtMs: Long,
)

@Dao
interface BriefDao {
    @Upsert
    suspend fun put(brief: BriefEntity)

    @Query("SELECT * FROM brief WHERE `date` = :date")
    fun observe(date: String): Flow<BriefEntity?>

    @Query("DELETE FROM brief WHERE `date` = :date")
    suspend fun delete(date: String)
}

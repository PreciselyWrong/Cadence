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

/**
 * Dernier bilan du soir lu, pour la lecture hors ligne. Une ligne par date locale. Table à part du `brief` : le bilan
 * n'a ni version ni statut (le serveur le recalcule à chaque lecture), et `brief` a la date pour clé unique.
 */
@Entity(tableName = "evening")
data class EveningEntity(
    @PrimaryKey val date: String,
    val json: String,
    val fetchedAtMs: Long,
)

@Dao
interface EveningDao {
    @Upsert
    suspend fun put(evening: EveningEntity)

    @Query("SELECT * FROM evening WHERE `date` = :date")
    fun observe(date: String): Flow<EveningEntity?>

    @Query("DELETE FROM evening WHERE `date` = :date")
    suspend fun delete(date: String)

    /** Les bilans des jours passés ne servent plus. */
    @Query("DELETE FROM evening WHERE `date` < :date")
    suspend fun deleteBefore(date: String)
}

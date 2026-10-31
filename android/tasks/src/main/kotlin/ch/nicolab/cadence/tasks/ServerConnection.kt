package ch.nicolab.cadence.tasks

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import java.time.DayOfWeek
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow

/**
 * [accountZone] : fuseau du compte Tududi, qui fixe le jour des échéances sans heure ;
 * [firstDayOfWeek] : premier jour de sa semaine, qui fixe « Cette semaine » ;
 * [quietHours] : sa plage silencieuse, lue dans [accountZone], que les alarmes locales respectent.
 */
data class ConnectionInfo(
    val serverUrl: String,
    val userEmail: String?,
    val accountZone: ZoneId = ZoneId.systemDefault(),
    val firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY,
    val quietHours: QuietHours? = null,
) {
    val quiet: QuietPolicy get() = QuietPolicy(quietHours, accountZone)
}

/** Lien avec le serveur Tududi : adresse et clé API (`tt_…`) de cet appareil. */
interface ServerConnection {
    fun observe(): Flow<ConnectionInfo?>

    /**
     * Vérifie l'adresse et la clé auprès du serveur (`GET /api/v1/sync/meta`),
     * puis les garde ; la première synchronisation démarre ensuite.
     */
    suspend fun connect(serverUrl: String, token: String): Result<ConnectionInfo>

    /** Oublie la clé et vide les données synchronisées de l'appareil. */
    suspend fun disconnect()
}

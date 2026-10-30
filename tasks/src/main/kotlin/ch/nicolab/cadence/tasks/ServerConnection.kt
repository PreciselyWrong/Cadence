package ch.nicolab.cadence.tasks

import kotlinx.coroutines.flow.Flow

data class ConnectionInfo(val serverUrl: String, val userEmail: String?)

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

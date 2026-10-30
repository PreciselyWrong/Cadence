package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.preferences.core.stringPreferencesKey
import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.sync.AccountProfile
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.HttpSyncApi
import ch.nicolab.cadence.tasks.sync.ServerSession
import ch.nicolab.cadence.tasks.sync.SyncStore
import ch.nicolab.cadence.tasks.sync.SyncScheduler
import java.io.IOException
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

private val Context.connectionStore by preferencesDataStore(name = "tududi_connection")

private object ConnectionKeys {
    val SERVER_URL = stringPreferencesKey("server_url")
    val USER_EMAIL = stringPreferencesKey("user_email")
    val ACCOUNT_TIMEZONE = stringPreferencesKey("account_timezone")
    val TOKEN_CIPHER = stringPreferencesKey("token_cipher")
    val TOKEN_IV = stringPreferencesKey("token_iv")
}

internal class ServerConnectionImpl(
    private val context: Context,
    private val database: TududiDatabase,
    private val store: SyncStore,
) : ServerConnection {

    override fun observe(): Flow<ConnectionInfo?> = context.connectionStore.data
        .map { prefs ->
            prefs[ConnectionKeys.SERVER_URL]?.let {
                ConnectionInfo(it, prefs[ConnectionKeys.USER_EMAIL], parseZone(prefs[ConnectionKeys.ACCOUNT_TIMEZONE]))
            }
        }
        .distinctUntilChanged()

    /** Null si aucun serveur n'est configuré ou si la clé ne se déchiffre plus. */
    suspend fun currentSession(): ServerSession? {
        val prefs = context.connectionStore.data.first()
        val url = prefs[ConnectionKeys.SERVER_URL] ?: return null
        val cipher = prefs[ConnectionKeys.TOKEN_CIPHER] ?: return null
        val iv = prefs[ConnectionKeys.TOKEN_IV] ?: return null
        val token = runCatching { TokenCipher.decrypt(cipher, iv) }.getOrNull() ?: return null
        return ServerSession(url, token)
    }

    override suspend fun connect(serverUrl: String, token: String): Result<ConnectionInfo> {
        val url = normalizeServerUrl(serverUrl)
            ?: return Result.failure(IllegalArgumentException("Adresse du serveur invalide"))
        val api = HttpSyncApi { ServerSession(url, token) }
        return try {
            api.meta()
            val profile = api.profile()
            val (cipher, iv) = TokenCipher.encrypt(token)
            context.connectionStore.edit { prefs ->
                prefs[ConnectionKeys.SERVER_URL] = url
                prefs[ConnectionKeys.TOKEN_CIPHER] = cipher
                prefs[ConnectionKeys.TOKEN_IV] = iv
                applyProfile(prefs, profile)
            }
            // Le prochain passage repart d'un instantané complet, pour ce serveur.
            store.saveCursor(null)
            SyncScheduler.schedulePeriodic(context)
            SyncScheduler.requestNow(context)
            Result.success(ConnectionInfo(url, profile.email, parseZone(profile.timezone)))
        } catch (error: AuthError) {
            Result.failure(IllegalStateException("Clé API refusée", error))
        } catch (error: IOException) {
            Result.failure(IllegalStateException("Serveur injoignable", error))
        }
    }

    /** Appelé à chaque synchronisation : un changement de fuseau sur le web est pris en compte. */
    suspend fun saveProfile(profile: AccountProfile) {
        context.connectionStore.edit { prefs -> applyProfile(prefs, profile) }
    }

    override suspend fun disconnect() {
        context.connectionStore.edit { prefs -> prefs.clear() }
        withContext(Dispatchers.IO) { database.clearAllTables() }
        SyncScheduler.cancel(context)
    }
}

private fun applyProfile(prefs: MutablePreferences, profile: AccountProfile) {
    setOrRemove(prefs, ConnectionKeys.USER_EMAIL, profile.email)
    setOrRemove(prefs, ConnectionKeys.ACCOUNT_TIMEZONE, profile.timezone)
}

private fun <T : Any> setOrRemove(prefs: MutablePreferences, key: Preferences.Key<T>, value: T?) {
    if (value == null) prefs.remove(key) else prefs[key] = value
}

/** Un fuseau absent ou inconnu retombe sur celui de l'appareil. */
private fun parseZone(raw: String?): ZoneId =
    raw?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

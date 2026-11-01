package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.tasks.ConnectionInfo
import ch.nicolab.cadence.tasks.ServerConnection
import ch.nicolab.cadence.tasks.model.Funnel
import ch.nicolab.cadence.tasks.sync.AccountProfile
import ch.nicolab.cadence.tasks.sync.AuthError
import ch.nicolab.cadence.tasks.sync.HabitOwnership
import ch.nicolab.cadence.tasks.sync.HttpSyncApi
import ch.nicolab.cadence.tasks.sync.ProtocolError
import ch.nicolab.cadence.tasks.sync.ServerSession
import ch.nicolab.cadence.tasks.sync.SyncEngine
import ch.nicolab.cadence.tasks.sync.SyncScheduler
import ch.nicolab.cadence.tasks.sync.SyncStore
import java.io.IOException
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
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
    val FIRST_DAY_OF_WEEK = intPreferencesKey("first_day_of_week")
    val QUIET_ENABLED = booleanPreferencesKey("quiet_hours_enabled")
    val QUIET_START = stringPreferencesKey("quiet_hours_start")
    val QUIET_END = stringPreferencesKey("quiet_hours_end")
    val TOKEN_CIPHER = stringPreferencesKey("token_cipher")
    val TOKEN_IV = stringPreferencesKey("token_iv")
}

internal class ServerConnectionImpl(
    private val context: Context,
    private val database: TududiDatabase,
    private val store: SyncStore,
    private val ownership: HabitOwnership,
    private val engineProvider: () -> SyncEngine,
) : ServerConnection {

    override fun observe(): Flow<ConnectionInfo?> = context.connectionStore.data
        .map { prefs ->
            prefs[ConnectionKeys.SERVER_URL]?.let {
                ConnectionInfo(
                    it,
                    prefs[ConnectionKeys.USER_EMAIL],
                    parseZone(prefs[ConnectionKeys.ACCOUNT_TIMEZONE]),
                    Funnel.firstDayOf(prefs[ConnectionKeys.FIRST_DAY_OF_WEEK]),
                    QuietHours.parse(
                        prefs[ConnectionKeys.QUIET_ENABLED] == true,
                        prefs[ConnectionKeys.QUIET_START],
                        prefs[ConnectionKeys.QUIET_END],
                    ),
                )
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
            val previousUrl = context.connectionStore.data.first()[ConnectionKeys.SERVER_URL]
            context.connectionStore.edit { prefs ->
                prefs[ConnectionKeys.SERVER_URL] = url
                prefs[ConnectionKeys.TOKEN_CIPHER] = cipher
                prefs[ConnectionKeys.TOKEN_IV] = iv
                applyProfile(prefs, profile)
            }
            // Le prochain passage repart d'un instantané complet, pour ce serveur.
            store.saveCursor(null)
            // Les habitudes d'un autre compte ne partent jamais vers celui-ci : la personne choisit.
            val owned = ownership.onConnect(HabitOwnership.accountId(url, profile.uid, profile.email)) ==
                HabitOwnership.Outcome.OWNED
            // Un autre serveur ne connaît pas les habitudes du téléphone : elles repartent en entier.
            if (owned && previousUrl != url) store.serverChanged()
            SyncScheduler.schedulePeriodic(context)
            SyncScheduler.requestNow(context)
            Result.success(
                ConnectionInfo(
                    url,
                    profile.email,
                    parseZone(profile.timezone),
                    Funnel.firstDayOf(profile.firstDayOfWeek),
                    profile.quietHours,
                ),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: AuthError) {
            Result.failure(IllegalStateException("Clé API refusée", error))
        } catch (error: ProtocolError) {
            Result.failure(IllegalStateException("Réponse inattendue du serveur", error))
        } catch (error: IOException) {
            Result.failure(IllegalStateException("Serveur injoignable", error))
        } catch (error: Exception) {
            Result.failure(IllegalStateException("Connexion impossible", error))
        }
    }

    /** Appelé à chaque synchronisation : un changement de fuseau sur le web est pris en compte. */
    suspend fun saveProfile(profile: AccountProfile) {
        val prefs = context.connectionStore.edit { prefs -> applyProfile(prefs, profile) }
        prefs[ConnectionKeys.SERVER_URL]?.let { url ->
            ownership.adoptIfUnknown(HabitOwnership.accountId(url, profile.uid, profile.email))
        }
    }

    override fun observeForeignHabits(): Flow<Boolean> = ownership.observeForeign()

    override suspend fun keepForeignHabitsLocal() = ownership.keepLocal()

    override suspend fun deleteForeignHabits() {
        engineProvider().whileIdle {
            ownership.deleteLocal()
            // Les habitudes du compte connecté n'ont pas été reçues tant que la synchro était coupée.
            store.saveCursor(null)
        }
        SyncScheduler.requestNow(context)
    }

    /**
     * Ordre voulu : le moteur cesse d'écrire, WorkManager est arrêté, puis on efface
     * sous le verrou du moteur pour qu'aucun passage ne ramène des lignes.
     */
    override suspend fun disconnect() {
        val engine = engineProvider()
        engine.markClosed()
        SyncScheduler.cancel(context)
        engine.whileIdle {
            context.connectionStore.edit { prefs -> prefs.clear() }
            ownership.onDisconnect()
            withContext(Dispatchers.IO) {
                database.clearAllTables()
                reviewCacheDir(context).deleteRecursively()
            }
        }
    }
}

private fun applyProfile(prefs: MutablePreferences, profile: AccountProfile) {
    setOrRemove(prefs, ConnectionKeys.USER_EMAIL, profile.email)
    setOrRemove(prefs, ConnectionKeys.ACCOUNT_TIMEZONE, profile.timezone)
    setOrRemove(prefs, ConnectionKeys.FIRST_DAY_OF_WEEK, profile.firstDayOfWeek)
    setOrRemove(prefs, ConnectionKeys.QUIET_ENABLED, profile.quietHours?.enabled)
    setOrRemove(prefs, ConnectionKeys.QUIET_START, profile.quietHours?.start?.toString())
    setOrRemove(prefs, ConnectionKeys.QUIET_END, profile.quietHours?.end?.toString())
}

private fun <T : Any> setOrRemove(prefs: MutablePreferences, key: Preferences.Key<T>, value: T?) {
    if (value == null) prefs.remove(key) else prefs[key] = value
}

/** Un fuseau absent ou inconnu retombe sur celui de l'appareil. */
private fun parseZone(raw: String?): ZoneId =
    raw?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

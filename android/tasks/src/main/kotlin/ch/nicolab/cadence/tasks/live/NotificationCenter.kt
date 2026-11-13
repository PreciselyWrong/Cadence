package ch.nicolab.cadence.tasks.live

import android.content.Context
import android.util.Log
import java.io.IOException
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Centre des notifications (écran « Notifications », cloche) : lues et non lues, en ligne seulement. Le compteur
 * non lu vient de `GET /api/notifications/unread-count` et se relit à chaque passe de [AgentInbox.refresh].
 */
object NotificationCenter {
    private const val TAG = "NotificationCenter"
    private const val LIST_PATH = "/api/notifications?limit=50"

    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    /** Le compteur reste à sa dernière valeur hors ligne. */
    suspend fun refreshUnread(context: Context) {
        try {
            val count = liveRequest(context, "GET", "/api/notifications/unread-count")["count"] as? JsonPrimitive
            count?.intOrNull?.let { _unread.value = it }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.i(TAG, "Unread count not read", error)
        }
    }

    /** Les dernières notifications, plus récente d'abord ; [IOException] hors ligne ou sur un refus du serveur. */
    suspend fun list(context: Context): List<CenterNotification> = CenterNotifications.parse(liveRequest(context, "GET", LIST_PATH))

    /** Marque une notification lue ; vrai si le serveur l'a notée. */
    suspend fun markRead(context: Context, uid: String): Boolean = try {
        liveRequest(context, "POST", "/api/notifications/" + URLEncoder.encode(uid, "UTF-8") + "/read")
        refreshUnread(context)
        true
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Log.w(TAG, "Notification not marked read", error)
        false
    }

    /** « Tout marquer comme lu » ; vrai si le serveur l'a noté. */
    suspend fun markAllRead(context: Context): Boolean = try {
        liveRequest(context, "POST", "/api/notifications/mark-all-read")
        refreshUnread(context)
        true
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Log.w(TAG, "Notifications not marked read", error)
        false
    }
}

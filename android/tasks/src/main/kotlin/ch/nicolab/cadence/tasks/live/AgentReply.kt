package ch.nicolab.cadence.tasks.live

import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.edit
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import ch.nicolab.cadence.tasks.data.currentServerSession
import ch.nicolab.cadence.tasks.widget.runAsync
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Pourquoi une réponse n'est pas partie ; le texte reste affiché dans la notification. */
enum class ReplyFailure { BUSY, GONE, NOT_CONFIGURED, REFUSED, NO_SERVER }

/** Suite d'un essai d'envoi. */
sealed interface ReplyStep {
    data object Sent : ReplyStep

    /** Nouvel essai plus tard ; [offline] : faute de réseau (sans limite d'essais). */
    data class Retry(val offline: Boolean) : ReplyStep

    data class Failed(val reason: ReplyFailure, val code: Int? = null) : ReplyStep
}

/** Règles pures de la réponse en texte libre à un agent (`POST /api<replyPath>`, `{ "text": … }`). */
object AgentReply {
    /** Essais au plus pour une réponse refusée le temps qu'une autre se termine (409) ou un serveur en panne. */
    const val MAX_ATTEMPTS = 5

    // Identifiant comme `backend/modules/plugins/core/manifest.js` ; segments sans point, donc sans `.` ni `..`.
    private val REPLY_PATH = Regex("""^/plugins/([a-z][a-z0-9-]{1,31})/x(/[A-Za-z0-9_-]+)+$""")

    /** [path] s'il est bien une route du plugin [pluginId] lui-même ; null sinon (pas de « Répondre »). */
    fun validPath(path: String?, pluginId: String?): String? {
        val match = path?.let(REPLY_PATH::matchEntire) ?: return null
        return path.takeIf { pluginId != null && match.groupValues[1] == pluginId }
    }

    fun url(baseUrl: String, replyPath: String): String = baseUrl.trimEnd('/') + "/api" + replyPath

    fun body(text: String): String = buildJsonObject { put("text", text) }.toString()

    /**
     * [code] null : pas de réponse du serveur (hors ligne, coupure) → on attend le réseau. 409 : une réponse est en
     * cours, 5xx passager : quelques essais. 404, 503, autre 4xx : l'envoi s'arrête et le texte reste à l'écran.
     */
    fun step(code: Int?, attempt: Int): ReplyStep {
        val more = attempt + 1 < MAX_ATTEMPTS
        return when {
            code == null -> ReplyStep.Retry(offline = true)
            code in 200..299 -> ReplyStep.Sent
            code == HttpURLConnection.HTTP_NOT_FOUND -> ReplyStep.Failed(ReplyFailure.GONE)
            code == HttpURLConnection.HTTP_UNAVAILABLE -> ReplyStep.Failed(ReplyFailure.NOT_CONFIGURED)
            code == HttpURLConnection.HTTP_CONFLICT -> if (more) ReplyStep.Retry(offline = false) else ReplyStep.Failed(ReplyFailure.BUSY)
            code == 408 || code == 429 || code >= 500 -> if (more) ReplyStep.Retry(offline = false) else ReplyStep.Failed(ReplyFailure.REFUSED, code)
            else -> ReplyStep.Failed(ReplyFailure.REFUSED, code)
        }
    }
}

/** Réponses en cours d'envoi, gardées sur disque jusqu'à leur envoi ou leur refus : le texte ne se perd pas. */
internal class PendingReplies private constructor(private val prefs: SharedPreferences) {
    data class Pending(val notification: LiveNotification, val text: String)

    fun save(id: String, pending: Pending) {
        val body = buildJsonObject {
            put("notification", LiveNotification.encode(pending.notification))
            put("text", pending.text)
        }
        prefs.edit { putString(id, body.toString()) }
    }

    fun read(id: String): Pending? {
        val body = prefs.getString(id, null)?.let { runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return null
        val notification = LiveNotification.decode(body.text("notification")) ?: return null
        val text = body.text("text") ?: return null
        return Pending(notification, text)
    }

    fun remove(id: String) = prefs.edit { remove(id) }

    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull

    companion object {
        fun of(context: Context) = PendingReplies(context.applicationContext.getSharedPreferences("agent_replies", Context.MODE_PRIVATE))
    }
}

/**
 * « Répondre » d'une notification d'agent : le texte est gardé, la notification montre « Envoi… », puis un travail
 * l'envoie (réseau requis, rejoué au retour du réseau). « Copier la réponse » d'une réponse refusée la met dans le
 * presse-papiers.
 */
class AgentReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_REPLY -> reply(context, intent)
            ACTION_COPY -> copy(context, intent.getStringExtra(EXTRA_TEXT) ?: return)
        }
    }

    private fun reply(context: Context, intent: Intent) {
        val notification = LiveNotification.decode(intent.getStringExtra(EXTRA_NOTIFICATION)) ?: return
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_TEXT)?.toString()?.trim().orEmpty()
        val notifier = LiveNotifier(context, LiveStreamStore.of(context))
        runAsync {
            if (text.isEmpty()) {
                // Rien de saisi : on rend la notification telle quelle, sans l'indicateur d'envoi d'Android.
                notifier.post(notification)
                return@runAsync
            }
            val id = UUID.randomUUID().toString()
            PendingReplies.of(context).save(id, PendingReplies.Pending(notification, text))
            notifier.post(notification, ReplyState.Sending(text))
            AgentReplyWorker.enqueue(context, notification.uid, id)
        }
    }

    private fun copy(context: Context, text: String) {
        context.getSystemService(ClipboardManager::class.java)
            ?.setPrimaryClip(ClipData.newPlainText(context.getString(ch.nicolab.cadence.tasks.R.string.live_reply_copy), text))
    }

    companion object {
        const val ACTION_REPLY = "ch.nicolab.cadence.tasks.live.REPLY"
        const val ACTION_COPY = "ch.nicolab.cadence.tasks.live.COPY_REPLY"
        const val KEY_TEXT = "agent_reply_text"
        const val EXTRA_NOTIFICATION = "agent_notification"
        const val EXTRA_TEXT = "agent_reply"
    }
}

/** Envoie une réponse gardée ; sans réseau ou devant un 409, attend et rejoue ; un refus laisse le texte affiché. */
class AgentReplyWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.success()
        val replies = PendingReplies.of(applicationContext)
        val pending = replies.read(id) ?: return Result.success()
        val notifier = LiveNotifier(applicationContext, LiveStreamStore.of(applicationContext))
        val session = currentServerSession(applicationContext)
        val step = if (session == null) {
            ReplyStep.Failed(ReplyFailure.NO_SERVER)
        } else {
            AgentReply.step(send(session.baseUrl, session.token, pending), runAttemptCount)
        }
        return when (step) {
            ReplyStep.Sent -> {
                replies.remove(id)
                NotificationManagerCompat.from(applicationContext).cancel(LiveNotifier.TAG, pending.notification.uid.hashCode())
                Result.success()
            }
            is ReplyStep.Retry -> {
                notifier.post(pending.notification, ReplyState.Waiting(pending.text, offline = step.offline))
                Result.retry()
            }
            is ReplyStep.Failed -> {
                replies.remove(id)
                notifier.post(pending.notification, ReplyState.NotSent(pending.text, step.reason, step.code))
                Result.success()
            }
        }
    }

    /** Code HTTP de la réponse, ou null si le serveur n'a pas répondu. */
    private suspend fun send(baseUrl: String, token: String, pending: PendingReplies.Pending): Int? = withContext(Dispatchers.IO) {
        val path = AgentReply.validPath(pending.notification.replyPath, pending.notification.pluginId) ?: return@withContext 404
        try {
            val connection = (URL(AgentReply.url(baseUrl, path)).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                doOutput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            try {
                connection.outputStream.use { it.write(AgentReply.body(pending.text).toByteArray(Charsets.UTF_8)) }
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: IOException) {
            Log.i(TAG, "Agent reply not sent yet", error)
            null
        }
    }

    companion object {
        private const val TAG = "AgentReply"
        private const val KEY_ID = "reply_id"
        private const val TIMEOUT_MS = 15_000

        /** Une chaîne par message : deux réponses au même message partent dans l'ordre. */
        fun enqueue(context: Context, uid: String, id: String) {
            val request = OneTimeWorkRequestBuilder<AgentReplyWorker>()
                .setInputData(workDataOf(KEY_ID to id))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("agent-reply:$uid", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}

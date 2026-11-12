package ch.nicolab.cadence.tasks.live

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.service.notification.StatusBarNotification
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.data.currentServerSession
import ch.nicolab.cadence.tasks.plugins.PluginPageActivity
import ch.nicolab.cadence.tasks.plugins.PluginsStore
import ch.nicolab.cadence.tasks.plugins.pluginsClient
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler
import ch.nicolab.cadence.tasks.sync.ServerSession
import ch.nicolab.cadence.tasks.widget.openTaskIntent
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Réglage « Notifications instantanées des agents » (oui par défaut) et mémoire des uids déjà montrés. */
class LiveStreamStore private constructor(private val prefs: SharedPreferences) {
    fun enabled(): Boolean = prefs.getBoolean(KEY_ENABLED, true)

    fun setEnabled(value: Boolean) {
        prefs.edit { putBoolean(KEY_ENABLED, value) }
    }

    /** Émet la valeur courante puis chaque changement. */
    fun changes(): Flow<Boolean> = callbackFlow {
        send(enabled())
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key -> if (key == KEY_ENABLED) trySend(enabled()) }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }.distinctUntilChanged()

    /** Ordre gardé (un `StringSet` le perd) : la mémoire oublie les plus anciens. */
    fun seen(): List<String> = prefs.getString(KEY_SEEN, null)?.split('\n')?.filter(String::isNotEmpty).orEmpty()

    fun saveSeen(uids: List<String>) {
        prefs.edit { putString(KEY_SEEN, uids.joinToString("\n")) }
    }

    companion object {
        private const val PREFS = "live_stream"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_SEEN = "seen"

        fun of(context: Context) = LiveStreamStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}

/**
 * Démarre et arrête le service du flux. Il tourne quand un serveur est connecté et que le réglage est actif ;
 * Android ne laisse démarrer un service au premier plan que depuis l'app visible ou certains évènements (démarrage
 * du téléphone, mise à jour de l'app) : ailleurs l'essai échoue sans bruit et le prochain retour dans l'app le relance.
 */
object LiveStream {
    private const val TAG = "LiveStream"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Suit la connexion et le réglage pendant toute la vie du processus. */
    fun watch(context: Context) {
        val app = context.applicationContext
        scope.launch {
            combine(TasksGraph.connection(app).observe().map { it != null }, LiveStreamStore.of(app).changes()) { connected, enabled ->
                connected && enabled
            }.distinctUntilChanged().collect { wanted -> if (wanted) start(app) else stop(app) }
        }
    }

    /** Retour dans l'app, démarrage du téléphone : relance le service s'il devrait tourner. */
    suspend fun ensure(context: Context) {
        val app = context.applicationContext
        if (!LiveStreamStore.of(app).enabled()) return
        if (TasksGraph.connection(app).observe().first() == null) return
        start(app)
    }

    private fun start(context: Context) {
        if (LiveStreamService.running) return
        try {
            ContextCompat.startForegroundService(context, Intent(context, LiveStreamService::class.java))
        } catch (error: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException (Android 12+) : l'app n'est pas au premier plan.
            Log.i(TAG, "Live stream not started from background", error)
        } catch (error: SecurityException) {
            Log.w(TAG, "Live stream start refused", error)
        }
    }

    fun stop(context: Context) {
        context.stopService(Intent(context, LiveStreamService::class.java))
    }
}

/**
 * Service au premier plan qui garde ouvert `GET /api/notifications/stream` (`docs/36-notifications.md`, Live
 * stream) avec le jeton `tt_` du compte, et montre aussitôt chaque notification routée vers `mobile`. Pas de
 * FCM ni de relais : le serveur personnel parle directement au téléphone. Les heures calmes sont appliquées par le
 * serveur, qui n'émet qu'à la fin de la plage. Hors ligne, rien n'est rattrapé (le flux est un signal).
 */
class LiveStreamService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    @Volatile
    private var connection: HttpURLConnection? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        LiveChannels.ensure(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            goForeground()
        } catch (error: RuntimeException) {
            // Relance par le système (START_STICKY) refusée en arrière-plan : le prochain retour dans l'app relance.
            Log.w(TAG, "Live stream could not go foreground", error)
            stopSelf()
            return START_NOT_STICKY
        }
        if (job?.isActive != true) job = scope.launch { listenForever() }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        job?.cancel()
        // Débloque la lecture en cours, qui n'écoute pas l'annulation.
        connection?.disconnect()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun goForeground() {
        val notification = LiveChannels.ongoing(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ONGOING_ID, notification)
        }
    }

    private suspend fun listenForever() {
        val store = LiveStreamStore.of(this)
        val notifier = LiveNotifier(this, store)
        var wait: Long? = null
        while (scope.isActive) {
            val session = currentServerSession(this)
            if (session == null || !store.enabled()) {
                stopSelf()
                return
            }
            val reached = try {
                listen(session, notifier)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.i(TAG, "Live stream dropped", error)
                false
            }
            wait = if (reached) Reconnect.FIRST_MS else Reconnect.next(wait)
            delay(wait)
        }
    }

    /** Vrai si le serveur a répondu `ready` : la pause suivante repart de 5 s. */
    private suspend fun listen(session: ServerSession, notifier: LiveNotifier): Boolean {
        var reached = false
        val http = (URL(session.baseUrl.trimEnd('/') + STREAM_PATH).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            // Le serveur écrit au moins toutes les 25 s : un silence plus long est une connexion morte.
            readTimeout = READ_TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${session.token}")
            setRequestProperty("Accept", "text/event-stream")
            setRequestProperty("Cache-Control", "no-cache")
        }
        connection = http
        try {
            val code = http.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("HTTP $code")
            val parser = SseParser()
            http.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                while (scope.isActive) {
                    val line = reader.readLine() ?: break
                    val event = parser.feed(line) ?: continue
                    if (event.event == READY) reached = true
                    // Bandeau des messages non lus : relu à la connexion et à chaque notification, routée ou non.
                    if (event.event == READY || event.event == LiveNotification.EVENT || event.event == LiveRead.EVENT) AgentInbox.refresh(this)
                    // Lue, rejetée ou supprimée ailleurs (autre client, page du plugin) : la notification part.
                    notifier.cancel(LiveRead.uids(event))
                    val notification = LiveNotification.of(event) ?: continue
                    if (notification.forMobile) notifier.show(notification)
                }
            }
        } catch (error: IOException) {
            if (!reached) throw error
        } finally {
            http.disconnect()
            connection = null
        }
        return reached
    }

    companion object {
        @Volatile
        var running = false
            private set

        private const val TAG = "LiveStream"
        private const val STREAM_PATH = "/api/notifications/stream"
        private const val READY = "ready"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 60_000
        private const val ONGOING_ID = 4_301
    }
}

/**
 * Canaux : « Agents · à décider » (HIGH, `warning` et `error`), « Agents · infos » (DEFAULT, `info` et `success`), et
 * « Connexion aux agents » (minimal) pour la notification permanente. L'ancien canal unique « Agents » est retiré.
 */
internal object LiveChannels {
    const val DECIDE = "cadence_agents_decide"
    const val INFO = "cadence_agents_info"
    const val CONNECTION = "cadence_agents_connection"
    private const val LEGACY_AGENTS = "cadence_agents"

    fun id(channel: AgentChannel): String = if (channel == AgentChannel.DECIDE) DECIDE else INFO

    fun ensure(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.deleteNotificationChannel(LEGACY_AGENTS)
        manager.createNotificationChannel(
            NotificationChannel(DECIDE, context.getString(R.string.live_channel_decide), NotificationManager.IMPORTANCE_HIGH),
        )
        manager.createNotificationChannel(
            NotificationChannel(INFO, context.getString(R.string.live_channel_info), NotificationManager.IMPORTANCE_DEFAULT),
        )
        manager.createNotificationChannel(
            NotificationChannel(CONNECTION, context.getString(R.string.live_channel_connection), NotificationManager.IMPORTANCE_MIN).apply {
                description = context.getString(R.string.live_channel_connection_description)
                setShowBadge(false)
            },
        )
    }

    /** Toucher la notification permanente ouvre les réglages de son canal, où Android permet de la masquer. */
    fun ongoing(context: Context): android.app.Notification {
        val hide = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            .putExtra(Settings.EXTRA_CHANNEL_ID, CONNECTION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return NotificationCompat.Builder(context, CONNECTION)
            .setSmallIcon(R.drawable.tasks_ic_agent)
            .setContentTitle(context.getString(R.string.live_channel_connection))
            .setContentText(context.getString(R.string.live_ongoing_text))
            .setContentIntent(PendingIntent.getActivity(context, HIDE_REQUEST, hide, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .build()
    }

    private const val HIDE_REQUEST = 4_302
}

/**
 * Page d'un plugin sur la requête d'une notification ; le fichier vient du menu des plugins (relu en ligne s'il ne
 * connaît pas encore ce plugin). Null si le plugin n'a pas de page.
 */
internal suspend fun pluginPageIntent(context: Context, target: LiveTarget.Plugin): Intent? {
    val store = PluginsStore.of(context)
    val item = store.menu().firstOrNull { it.id == target.id }
        ?: pluginsClient(context).menu().getOrNull()?.also(store::saveMenu)?.firstOrNull { it.id == target.id }
        ?: return null
    return PluginPageActivity.intent(context, item, target.query).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/** Où en est une réponse saisie depuis la notification ; le texte y reste visible tant qu'il n'est pas parti. */
internal sealed interface ReplyState {
    val text: String

    data class Sending(override val text: String) : ReplyState

    data class Waiting(override val text: String, val offline: Boolean) : ReplyState

    /** Reçue par le serveur : l'agent réfléchit ; sa réponse arrivera par le flux comme une nouvelle notification. */
    data class Sent(override val text: String) : ReplyState

    data class NotSent(override val text: String, val reason: ReplyFailure, val code: Int?) : ReplyState
}

/**
 * Une notification Android par message, une seule fois par uid ; titre et texte du serveur, en texte brut. Groupées
 * par agent sous un résumé, qui seul sonne (une fois par rafale) ; le nom de l'agent en sous-titre, la couleur du
 * niveau. Un message qui attend une réponse (`data.replyPath`, route du plugin lui-même) porte « Répondre ».
 */
internal class LiveNotifier(private val context: Context, private val store: LiveStreamStore) {
    private val manager = NotificationManagerCompat.from(context)

    suspend fun show(notification: LiveNotification) {
        val next = SeenUids.add(store.seen(), notification.uid) ?: return
        store.saveSeen(next)
        post(notification)
    }

    /** Pose ou remplace la notification de [notification] ; [reply] : l'état d'une réponse saisie. */
    suspend fun post(notification: LiveNotification, reply: ReplyState? = null) {
        // Sans permission rien ne s'affiche ; l'uid reste noté pour ne pas le reposer plus tard.
        if (!TaskReminderScheduler.notificationsAllowed(context)) return
        LiveChannels.ensure(context)
        val label = AgentStyle.label(notification, context.getString(R.string.live_agent_fallback))
        val title = notification.title.ifBlank { label }
        val channel = AgentStyle.channel(notification.level)
        val group = AgentStyle.group(notification)
        val builder = NotificationCompat.Builder(context, LiveChannels.id(channel))
            .setSmallIcon(R.drawable.tasks_ic_agent)
            .setColor(levelColor(notification.level))
            .setContentTitle(title)
            .setContentText(notification.message)
            .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(notification.message))
            .setSubText(label)
            .setCategory(if (AgentStyle.isFailure(notification)) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(if (channel == AgentChannel.DECIDE) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setGroup(group)
            // Le résumé du groupe porte la sonnerie : une rafale ne sonne qu'une fois, une mise à jour jamais.
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .addExtras(Bundle().apply {
                putString(EXTRA_UID, notification.uid)
                putString(EXTRA_LABEL, label)
            })
        intentFor(LiveTarget.of(notification.openPath, notification.taskUid))?.let { intent ->
            builder.setContentIntent(
                PendingIntent.getActivity(
                    context,
                    notification.uid.hashCode(),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }
        val canReply = AgentReply.validPath(notification.replyPath, notification.pluginId) != null
        when (reply) {
            null -> {
                if (canReply) builder.addAction(replyAction(notification))
                builder.addAction(0, context.getString(R.string.live_mark_read), markReadIntent(listOf(notification.uid), "read:" + notification.uid))
            }
            is ReplyState.Sending, is ReplyState.Waiting -> {
                val state = if (reply is ReplyState.Waiting && reply.offline) R.string.live_reply_waiting else R.string.live_reply_sending
                builder.setRemoteInputHistory(arrayOf<CharSequence>(reply.text))
                    .setSubText(context.getString(state, label))
                    .setAutoCancel(false)
            }
            is ReplyState.Sent -> {
                builder.setRemoteInputHistory(arrayOf<CharSequence>(reply.text))
                    .setSubText(context.getString(R.string.live_reply_sent, label))
                    .setTimeoutAfter(SENT_TIMEOUT_MS)
                    .addAction(0, context.getString(R.string.live_mark_read), markReadIntent(listOf(notification.uid), "read:" + notification.uid))
            }
            is ReplyState.NotSent -> {
                val why = failureText(reply)
                val yours = context.getString(R.string.live_reply_yours, reply.text)
                builder.setSubText(context.getString(R.string.live_reply_not_sent, label))
                    .setContentText(why)
                    .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(why + "\n\n" + yours + "\n\n" + notification.message))
                    .setAutoCancel(false)
                if (reply.reason != ReplyFailure.GONE && canReply) builder.addAction(0, context.getString(R.string.live_reply_resend), resendIntent(notification, reply.text))
                builder.addAction(0, context.getString(R.string.live_reply_copy), copyIntent(notification.uid, reply.text))
            }
        }
        manager.notify(TAG, notification.uid.hashCode(), builder.build())
        val now = System.currentTimeMillis()
        val ring = AgentStyle.alertSummary(lastAlert[group], now, newMessage = reply == null)
        if (ring) lastAlert[group] = now
        updateSummary(group, ring)
    }

    /** Retire les notifications de [uids] (lues ailleurs, rejetées, supprimées) et met leurs résumés à jour. */
    fun cancel(uids: Collection<String>) {
        if (uids.isEmpty()) return
        val wanted = uids.toSet()
        val groups = activeChildren().filter { it.notification.extras.getString(EXTRA_UID) in wanted }.mapNotNull { it.notification.group }.toSet()
        wanted.forEach { manager.cancel(TAG, it.hashCode()) }
        groups.forEach { updateSummary(it, ring = false) }
    }

    private fun activeChildren(): List<StatusBarNotification> = runCatching {
        context.getSystemService(NotificationManager::class.java).activeNotifications
            .filter { it.tag == TAG && it.notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY == 0 }
    }.getOrDefault(emptyList())

    /** Résumé du groupe : nom de l'agent, nombre et titres des messages, « Tout marquer comme lu ». Retiré si vide. */
    private fun updateSummary(group: String, ring: Boolean) {
        val children = activeChildren().filter { it.notification.group == group }
        if (children.isEmpty()) {
            manager.cancel(SUMMARY_TAG, group.hashCode())
            return
        }
        val label = children.firstNotNullOfOrNull { it.notification.extras.getString(EXTRA_LABEL) } ?: context.getString(R.string.live_agent_fallback)
        val decide = children.any { it.notification.channelId == LiveChannels.DECIDE }
        val uids = children.mapNotNull { it.notification.extras.getString(EXTRA_UID) }
        val count = context.resources.getQuantityString(R.plurals.live_summary_count, children.size, children.size)
        val inbox = NotificationCompat.InboxStyle().setSummaryText(label)
        children.take(SUMMARY_LINES).forEach { child ->
            child.notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.let(inbox::addLine)
        }
        val summary = NotificationCompat.Builder(context, LiveChannels.id(if (decide) AgentChannel.DECIDE else AgentChannel.INFO))
            .setSmallIcon(R.drawable.tasks_ic_agent)
            .setColor(levelColor(if (decide) "warning" else "info"))
            .setContentTitle(label)
            .setContentText(count)
            .setSubText(label)
            .setStyle(inbox)
            .setGroup(group)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
            .setOnlyAlertOnce(!ring)
            .setSilent(!ring)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .addAction(0, context.getString(R.string.live_mark_all_read), markReadIntent(uids, "read-all:$group"))
            .build()
        manager.notify(SUMMARY_TAG, group.hashCode(), summary)
    }

    /** Couleur d'accent du niveau, prise dans la palette claire du thème. */
    private fun levelColor(level: String?): Int = when (level) {
        "error" -> LightPalette.error
        "warning" -> LightPalette.warning
        "success" -> LightPalette.success
        else -> LightPalette.primary
    }.toArgb()

    private fun failureText(reply: ReplyState.NotSent): String = when (reply.reason) {
        ReplyFailure.BUSY -> context.getString(R.string.live_reply_busy)
        ReplyFailure.GONE -> context.getString(R.string.live_reply_gone)
        ReplyFailure.NOT_CONFIGURED -> context.getString(R.string.live_reply_not_configured)
        ReplyFailure.NO_SERVER -> context.getString(R.string.live_reply_no_server)
        ReplyFailure.REFUSED -> context.getString(R.string.live_reply_refused, reply.code ?: 0)
    }

    /** « Répondre » : saisie libre dans la notification, reçue par [AgentReplyReceiver] (intent modifiable exigé). */
    private fun replyAction(notification: LiveNotification): NotificationCompat.Action {
        val intent = Intent(context, AgentReplyReceiver::class.java)
            .setAction(AgentReplyReceiver.ACTION_REPLY)
            .putExtra(AgentReplyReceiver.EXTRA_NOTIFICATION, LiveNotification.encode(notification))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val pending = PendingIntent.getBroadcast(context, ("reply:" + notification.uid).hashCode(), intent, flags)
        val input = RemoteInput.Builder(AgentReplyReceiver.KEY_TEXT)
            .setLabel(context.getString(R.string.live_reply_hint))
            .build()
        return NotificationCompat.Action.Builder(0, context.getString(R.string.live_reply_action), pending)
            .addRemoteInput(input)
            .setAllowGeneratedReplies(false)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build()
    }

    private fun broadcast(request: String, intent: Intent): PendingIntent = PendingIntent.getBroadcast(
        context,
        request.hashCode(),
        intent.setClass(context, AgentReplyReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun markReadIntent(uids: List<String>, request: String) = broadcast(
        request,
        Intent(AgentReplyReceiver.ACTION_MARK_READ).putExtra(AgentReplyReceiver.EXTRA_UIDS, uids.toTypedArray()),
    )

    private fun resendIntent(notification: LiveNotification, text: String) = broadcast(
        "resend:" + notification.uid,
        Intent(AgentReplyReceiver.ACTION_RESEND)
            .putExtra(AgentReplyReceiver.EXTRA_NOTIFICATION, LiveNotification.encode(notification))
            .putExtra(AgentReplyReceiver.EXTRA_TEXT, text),
    )

    private fun copyIntent(uid: String, text: String) = broadcast(
        "copy:$uid",
        Intent(AgentReplyReceiver.ACTION_COPY).putExtra(AgentReplyReceiver.EXTRA_TEXT, text),
    )

    /** Page du plugin si le menu la connaît, la tâche, ou l'app. */
    private suspend fun intentFor(target: LiveTarget): Intent? = when (target) {
        is LiveTarget.Plugin -> pluginPageIntent(context, target) ?: launchIntent()
        is LiveTarget.Task -> openTaskIntent(context, target.uid)
        LiveTarget.App -> launchIntent()
    }

    private fun launchIntent(): Intent? = context.packageManager.getLaunchIntentForPackage(context.packageName)

    companion object {
        const val TAG = "agents"
        private const val SUMMARY_TAG = "agents-summary"
        private const val EXTRA_UID = "cadence_agent_uid"
        private const val EXTRA_LABEL = "cadence_agent_label"
        private const val SUMMARY_LINES = 5

        /** « Envoyé · … réfléchit » s'efface seul si la réponse de l'agent tarde. */
        private const val SENT_TIMEOUT_MS = 2 * 60 * 1000L

        /** Dernière sonnerie par groupe, le temps du processus : une rafale ne sonne qu'une fois. */
        private val lastAlert = java.util.concurrent.ConcurrentHashMap<String, Long>()
    }
}

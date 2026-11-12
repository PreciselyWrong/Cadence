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
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
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
                    if (event.event == READY || event.event == LiveNotification.EVENT) AgentInbox.refresh(this)
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

/** Canaux : « Agents » pour les messages, « Connexion aux agents » (minimal) pour la notification permanente. */
internal object LiveChannels {
    const val AGENTS = "cadence_agents"
    const val CONNECTION = "cadence_agents_connection"

    fun ensure(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(AGENTS, context.getString(R.string.live_channel_agents), NotificationManager.IMPORTANCE_HIGH),
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
            .setSmallIcon(R.drawable.tasks_ic_notification)
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

/** Une notification Android par message, une seule fois par uid ; titre et texte du serveur, en texte brut. */
internal class LiveNotifier(private val context: Context, private val store: LiveStreamStore) {
    suspend fun show(notification: LiveNotification) {
        val next = SeenUids.add(store.seen(), notification.uid) ?: return
        store.saveSeen(next)
        // Sans permission rien ne s'affiche ; l'uid reste noté pour ne pas le reposer plus tard.
        if (!TaskReminderScheduler.notificationsAllowed(context)) return
        LiveChannels.ensure(context)
        val title = notification.title.ifBlank { context.getString(R.string.live_channel_agents) }
        val builder = NotificationCompat.Builder(context, LiveChannels.AGENTS)
            .setSmallIcon(R.drawable.tasks_ic_notification)
            .setContentTitle(title)
            .setContentText(notification.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notification.message))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
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
        NotificationManagerCompat.from(context).notify(TAG, notification.uid.hashCode(), builder.build())
    }

    /** Page du plugin si le menu la connaît, la tâche, ou l'app. */
    private suspend fun intentFor(target: LiveTarget): Intent? = when (target) {
        is LiveTarget.Plugin -> pluginPageIntent(context, target) ?: launchIntent()
        is LiveTarget.Task -> openTaskIntent(context, target.uid)
        LiveTarget.App -> launchIntent()
    }

    private fun launchIntent(): Intent? = context.packageManager.getLaunchIntentForPackage(context.packageName)

    private companion object {
        const val TAG = "agents"
    }
}

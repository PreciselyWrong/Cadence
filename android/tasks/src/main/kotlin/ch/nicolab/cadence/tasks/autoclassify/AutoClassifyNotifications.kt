package ch.nicolab.cadence.tasks.autoclassify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler
import ch.nicolab.cadence.tasks.widget.runAsync
import java.time.Instant

/** Ce qui se passe à chaque passage : quelles suggestions notifier, et lesquelles la mémoire oublie. */
object ClassifyNotifyPlan {
    /**
     * Les suggestions en attente qu'on n'a pas encore notifiées. Rien pendant une plage silencieuse : elles
     * restent non notifiées et sont reprises au passage suivant, une fois la plage finie.
     */
    fun due(
        pending: List<PendingSuggestion>,
        notified: Set<String>,
        notify: Boolean,
        now: Instant,
        quiet: QuietPolicy,
    ): List<PendingSuggestion> {
        if (!notify) return emptyList()
        if (quiet.hours?.endAfter(now, quiet.zone) != null) return emptyList()
        return pending.filter { it.uid !in notified }
    }

    /** Notifications affichées dont la suggestion n'est plus en attente (classée ailleurs, ignorée ou expirée). */
    fun stale(shown: Set<String>, pendingUids: Set<String>): Set<String> = shown - pendingUids

    /** La mémoire ne garde que les suggestions encore en attente : une suggestion résolue ou expirée s'oublie. */
    fun remembered(pendingUids: Set<String>, notified: Set<String>): Set<String> = notified.filterTo(mutableSetOf()) { it in pendingUids }
}

/** Texte d'une notification de classement : ce que « Tout accepter » appliquera, rien de plus. */
object AcceptAllText {
    /**
     * Projet (meilleure option, sinon le domaine), tags proposés, priorité, séparés par « · », seulement ceux présents ;
     * null si « Tout accepter » ne changerait rien. Ni nouveau projet ni nouveau tag, comme le serveur.
     */
    fun summary(card: ClassifyCard, projectLabel: (String) -> String, priorityLabel: (Int) -> String): String? {
        val parts = buildList {
            projectName(card.project)?.let { add(projectLabel(it)) }
            card.tags?.options?.takeIf { it.isNotEmpty() }?.let { names -> add(names.joinToString(" ") { "#$it" }) }
            card.priority?.let { add(priorityLabel(it)) }
        }
        return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    private fun projectName(offer: ProjectOffer?): String? {
        offer ?: return null
        return offer.options.firstOrNull()?.name?.takeIf(String::isNotBlank)
            ?: offer.area?.name?.takeIf(String::isNotBlank)
    }
}

/** Mémoire locale : uids déjà notifiés, et le réglage « notifier » lu depuis le serveur (gardé une heure). */
class AutoClassifyStore private constructor(private val prefs: SharedPreferences) {
    fun notified(): Set<String> = prefs.getStringSet(KEY_NOTIFIED, null).orEmpty().toSet()

    fun saveNotified(uids: Set<String>) {
        prefs.edit { putStringSet(KEY_NOTIFIED, uids.toSet()) }
    }

    fun notifyCache(): NotifyCache? =
        if (prefs.contains(KEY_NOTIFY)) NotifyCache(prefs.getBoolean(KEY_NOTIFY, true), prefs.getLong(KEY_NOTIFY_AT, 0L)) else null

    fun saveNotifyCache(cache: NotifyCache) {
        prefs.edit {
            putBoolean(KEY_NOTIFY, cache.notify)
            putLong(KEY_NOTIFY_AT, cache.atMillis)
        }
    }

    data class NotifyCache(val notify: Boolean, val atMillis: Long)

    companion object {
        private const val PREFS = "auto_classify"
        private const val KEY_NOTIFIED = "notified"
        private const val KEY_NOTIFY = "notify"
        private const val KEY_NOTIFY_AT = "notify_at"

        fun of(context: Context) = AutoClassifyStore(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE))
    }
}

/**
 * Notifie les suggestions nouvelles après chaque synchro réussie. Une notification par suggestion, actions
 * « Tout accepter », « Aucun » ou « Jeter », « Fusionner », puis « Ouvrir » (la file « À trier »).
 */
class AutoClassifyNotifier(
    private val context: Context,
    private val repository: AutoClassifyRepository,
    private val store: AutoClassifyStore,
    private val quiet: suspend () -> QuietPolicy,
    private val clock: () -> Instant = Instant::now,
) {
    suspend fun notifyPending() {
        if (notifyEnabled() != true) return
        val pending = repository.suggestions().getOrNull() ?: return
        val notified = store.notified()
        val pendingUids = pending.mapTo(mutableSetOf()) { it.uid }
        ClassifyNotifyPlan.stale(notified, pendingUids).forEach(::cancel)
        val due = ClassifyNotifyPlan.due(pending, notified, notify = true, now = clock(), quiet = quiet())
        due.forEach(::post)
        store.saveNotified(ClassifyNotifyPlan.remembered(pendingUids, notified + due.map { it.uid }))
    }

    /** Le réglage du serveur, relu au plus une fois par heure ; hors ligne, la dernière valeur connue. */
    private suspend fun notifyEnabled(): Boolean? {
        val cached = store.notifyCache()
        val now = clock().toEpochMilli()
        if (cached != null && now - cached.atMillis < SETTINGS_TTL_MS) return cached.notify
        val fresh = repository.settings().getOrNull()?.notify ?: return cached?.notify
        store.saveNotifyCache(AutoClassifyStore.NotifyCache(fresh, now))
        return fresh
    }

    private fun post(suggestion: PendingSuggestion) {
        // Sans permission, rien ne s'affiche ; la suggestion est tout de même notée pour ne pas la reposer plus tard.
        if (!TaskReminderScheduler.notificationsAllowed(context)) return
        ensureChannel()
        val text = if (suggestion.isDuplicate) {
            context.getString(R.string.auto_classify_notif_duplicate)
        } else {
            AutoClassifyPayload.classify(suggestion.payload)?.let { card ->
                AcceptAllText.summary(
                    card,
                    projectLabel = { context.getString(R.string.auto_classify_notif_project, it) },
                    priorityLabel = { context.getString(if (it == 2) R.string.auto_classify_notif_priority_high else R.string.auto_classify_notif_priority_medium) },
                )
            } ?: context.getString(R.string.auto_classify_notif_classify)
        }
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.tasks_ic_notification)
            .setContentTitle(suggestion.headline.ifBlank { context.getString(R.string.auto_classify_title) })
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
        val open = openTriagePendingIntent(context)
        open?.let(builder::setContentIntent)
        actionsOf(suggestion).forEach { (label, action) ->
            builder.addAction(0, context.getString(label), actionPendingIntent(context, action, suggestion.uid))
        }
        // Troisième bouton : la carte dans « À trier », pour un autre choix que les deux proposés.
        open?.let { builder.addAction(0, context.getString(R.string.auto_classify_action_open), it) }
        NotificationManagerCompat.from(context).notify(TAG, suggestion.uid.hashCode(), builder.build())
    }

    /** Retire la notification d'une suggestion résolue ailleurs ; sans effet si elle n'est plus affichée. */
    private fun cancel(uid: String) {
        NotificationManagerCompat.from(context).cancel(TAG, uid.hashCode())
    }

    private fun ensureChannel() {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.auto_classify_channel_name), NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    private companion object {
        const val SETTINGS_TTL_MS = 60 * 60 * 1000L
    }
}

/** Libellés et actions d'une notification selon le type de suggestion. */
internal fun actionsOf(suggestion: PendingSuggestion): List<Pair<Int, String>> = if (suggestion.isDuplicate) {
    listOf(
        R.string.auto_classify_action_drop to AutoClassifyRequests.ACTION_DROP_NEW,
        R.string.auto_classify_action_merge to AutoClassifyRequests.ACTION_MERGE,
    )
} else {
    listOf(
        R.string.auto_classify_action_accept_all to AutoClassifyRequests.ACTION_ACCEPT_ALL,
        R.string.auto_classify_action_dismiss to AutoClassifyRequests.ACTION_DISMISS,
    )
}

/** Reçoit une action de notification : la réponse part à la file, la notification s'efface. */
class AutoClassifyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uid = intent.getStringExtra(EXTRA_SUGGESTION) ?: return
        val label = context.getString(R.string.auto_classify_title)
        val call = AutoClassifyRequests.forNotificationAction(intent.action, uid, label) ?: return
        NotificationManagerCompat.from(context).cancel(TAG, uid.hashCode())
        runAsync { TasksGraph.autoClassify(context).answer(call) }
    }
}

private fun actionPendingIntent(context: Context, action: String, uid: String): PendingIntent {
    val intent = Intent(context, AutoClassifyReceiver::class.java)
        .setAction(action)
        .putExtra(EXTRA_SUGGESTION, uid)
    return PendingIntent.getBroadcast(
        context,
        "$action:$uid".hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

/** Ouvre l'app sur la file « À trier ». */
internal fun openTriagePendingIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.putExtra(EXTRA_OPEN_TRIAGE, true)
        ?: return null
    return PendingIntent.getActivity(context, OPEN_TRIAGE_REQUEST, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

/** Extra de l'activité : ouvre « À trier ». */
const val EXTRA_OPEN_TRIAGE = "open_triage"

internal const val TAG = "auto-classify"
internal const val CHANNEL_ID = "tududi_auto_classify"
private const val EXTRA_SUGGESTION = "suggestion_uid"
private const val OPEN_TRIAGE_REQUEST = 4_201

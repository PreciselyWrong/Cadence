package ch.nicolab.cadence.tasks.proposals

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.compose.ui.graphics.toArgb
import ch.nicolab.cadence.designsystem.theme.LightPalette
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.live.LiveChannels
import ch.nicolab.cadence.tasks.live.LiveNotification
import ch.nicolab.cadence.tasks.live.LiveNotifier
import ch.nicolab.cadence.tasks.reminder.TaskReminderScheduler

/**
 * Notification « Ta semaine est prête » (ou revue, ou échec). Le serveur pose une notification `proposal` ; l'app
 * choisit le texte, sans nommer l'agent. Canal calme (« Agents · infos »), un tap ouvre la feuille de la semaine,
 * Planifier si elle a échoué, ou la revue.
 */
internal object ProposalNotifications {
    const val EXTRA_ROUTE = "proposal_route"
    const val EXTRA_UID = "proposal_uid"
    const val ROUTE_SHOW = "show"
    const val ROUTE_PLAN = "plan"
    const val ROUTE_REVIEW = "review"
    const val ROUTE_CAREER = "career"

    /** Route et texte d'une notification de proposition, ou null si le statut n'en demande aucun. */
    fun present(kind: String?, status: String?): Presentation? {
        val failed = status == ProposalStatus.FAILED.wire
        val ready = status == ProposalStatus.READY.wire
        if (!failed && !ready) return null
        return when (ProposalKind.of(kind)) {
            ProposalKind.WEEK -> if (ready) Presentation(R.string.proposal_week_ready, R.string.proposal_week_ready_text, ROUTE_SHOW)
            else Presentation(R.string.proposal_week_failed, R.string.proposal_failed_text, ROUTE_PLAN)
            ProposalKind.REVIEW -> if (ready) Presentation(R.string.proposal_review_ready, R.string.proposal_review_ready_text, ROUTE_REVIEW)
            else Presentation(R.string.proposal_review_failed, R.string.proposal_failed_text, ROUTE_REVIEW)
            ProposalKind.CAREER -> if (ready) Presentation(R.string.proposal_career_ready, R.string.proposal_career_ready_text, ROUTE_CAREER)
            else Presentation(R.string.proposal_career_failed, R.string.proposal_failed_text, ROUTE_CAREER)
            null -> null
        }
    }

    data class Presentation(val title: Int, val text: Int, val route: String)

    /** Pose la notification ; sans permission rien ne s'affiche (l'identifiant reste noté par le flux). */
    fun post(context: Context, notification: LiveNotification, uid: String) {
        if (!TaskReminderScheduler.notificationsAllowed(context)) return
        val presentation = present(notification.kind, notification.proposalStatus) ?: return
        LiveChannels.ensure(context)
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.putExtra(EXTRA_ROUTE, presentation.route)
            ?.putExtra(EXTRA_UID, uid)
        val tap = intent?.let {
            PendingIntent.getActivity(context, uid.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val failed = notification.proposalStatus == ProposalStatus.FAILED.wire
        val title = context.getString(presentation.title)
        val builder = NotificationCompat.Builder(context, LiveChannels.INFO)
            .setSmallIcon(R.drawable.tasks_ic_agent)
            .setColor(if (failed) LightPalette.error.toArgb() else LightPalette.success.toArgb())
            .setContentTitle(title)
            .setContentText(context.getString(presentation.text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(presentation.text)))
            .setCategory(if (failed) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
        tap?.let(builder::setContentIntent)
        NotificationManagerCompat.from(context).notify(LiveNotifier.TAG, uid.hashCode(), builder.build())
    }
}

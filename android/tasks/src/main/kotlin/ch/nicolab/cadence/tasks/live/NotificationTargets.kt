package ch.nicolab.cadence.tasks.live

import ch.nicolab.cadence.tasks.proposals.ProposalKind
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Ce qu'ouvre le toucher d'une notification : la même règle que le web (`handleNotificationClick`, `docs/36-notifications.md`). */
sealed interface NotificationTarget {
    /** Semaine prête : sa feuille. */
    data class ProposalSheet(val uid: String) : NotificationTarget

    /** Revue prête : l'écran de la revue (Bilan). */
    data object Review : NotificationTarget

    /** Carrière : son écran (Bilan). */
    data object Career : NotificationTarget

    /** « Trier mes mails » (`mail_ready`). */
    data object MailDeck : NotificationTarget

    /** Page d'un plugin, avec sa requête. */
    data class Plugin(val page: LiveTarget.Plugin) : NotificationTarget

    data class Task(val uid: String) : NotificationTarget

    data class Project(val uid: String) : NotificationTarget

    /** Rien à ouvrir : l'écran des notifications. */
    data object Center : NotificationTarget
}

/** Les champs d'une notification qui décident de sa cible (`data` côté serveur). */
data class NotificationPayload(
    val kind: String? = null,
    val proposalUid: String? = null,
    val pluginId: String? = null,
    val openPath: String? = null,
    val taskUid: String? = null,
    val projectUid: String? = null,
)

/** Règles pures des cibles : le toucher de l'écran et celui de la notification système passent par elles. */
object NotificationTargets {
    private const val MAIL_READY = "mail_ready"
    private const val MAIL = "mail"
    private const val CENTER = "center"
    private const val REVIEW = "review"
    private const val CAREER = "career"
    private val UID = Regex("""^[A-Za-z0-9_-]{1,64}$""")

    fun of(payload: NotificationPayload): NotificationTarget {
        if (payload.kind == MAIL_READY) return NotificationTarget.MailDeck
        payload.proposalUid?.takeIf(UID::matches)?.let { uid ->
            return when (ProposalKind.of(payload.kind)) {
                ProposalKind.REVIEW -> NotificationTarget.Review
                ProposalKind.CAREER -> NotificationTarget.Career
                ProposalKind.WEEK, null -> NotificationTarget.ProposalSheet(uid)
            }
        }
        if (payload.pluginId != null) {
            (LiveTarget.of(payload.openPath, null) as? LiveTarget.Plugin)?.let { return NotificationTarget.Plugin(it) }
        }
        payload.taskUid?.takeIf(UID::matches)?.let { return NotificationTarget.Task(it) }
        payload.projectUid?.takeIf(UID::matches)?.let { return NotificationTarget.Project(it) }
        return NotificationTarget.Center
    }

    /** Forme gardée dans l'extra d'une notification ou d'un intent ; [decode] la relit et la revalide. */
    fun encode(target: NotificationTarget): String = when (target) {
        is NotificationTarget.ProposalSheet -> "proposal:${target.uid}"
        NotificationTarget.Review -> REVIEW
        NotificationTarget.Career -> CAREER
        NotificationTarget.MailDeck -> MAIL
        is NotificationTarget.Plugin -> "plugin:${target.page.id}${target.page.query}"
        is NotificationTarget.Task -> "task:${target.uid}"
        is NotificationTarget.Project -> "project:${target.uid}"
        NotificationTarget.Center -> CENTER
    }

    /** Null pour une valeur absente, inconnue ou invalide : rien n'est ouvert. */
    fun decode(raw: String?): NotificationTarget? = when {
        raw == null -> null
        raw == REVIEW -> NotificationTarget.Review
        raw == CAREER -> NotificationTarget.Career
        raw == MAIL -> NotificationTarget.MailDeck
        raw == CENTER -> NotificationTarget.Center
        raw.startsWith("proposal:") -> raw.removePrefix("proposal:").takeIf(UID::matches)?.let(NotificationTarget::ProposalSheet)
        raw.startsWith("task:") -> raw.removePrefix("task:").takeIf(UID::matches)?.let(NotificationTarget::Task)
        raw.startsWith("project:") -> raw.removePrefix("project:").takeIf(UID::matches)?.let(NotificationTarget::Project)
        raw.startsWith("plugin:") -> (LiveTarget.of("/plugins/" + raw.removePrefix("plugin:"), null) as? LiveTarget.Plugin)?.let(NotificationTarget::Plugin)
        else -> null
    }
}

/** Une notification du centre (`GET /api/notifications`, lues et non lues), dans l'ordre du serveur : la plus récente d'abord. */
data class CenterNotification(
    val uid: String,
    val title: String,
    val message: String,
    val createdAt: String,
    val read: Boolean,
    val agentLabel: String?,
    val payload: NotificationPayload,
)

object CenterNotifications {
    fun parse(body: JsonObject): List<CenterNotification> =
        (body["notifications"] as? JsonArray).orEmpty().mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val uid = item.text("uid") ?: return@mapNotNull null
            val data = item["data"] as? JsonObject
            CenterNotification(
                uid = uid,
                title = item.text("title").orEmpty(),
                message = item.text("message").orEmpty(),
                createdAt = item.text("created_at").orEmpty(),
                read = item["read_at"].let { it != null && it !is JsonNull },
                agentLabel = data?.text("agentLabel"),
                payload = NotificationPayload(
                    kind = data?.text("kind"),
                    proposalUid = data?.text("proposal_uid"),
                    pluginId = data?.text("pluginId"),
                    openPath = data?.text("openPath"),
                    taskUid = data?.text("taskUid"),
                    projectUid = data?.text("projectUid"),
                ),
            )
        }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.ifBlank { null }
}

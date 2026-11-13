package ch.nicolab.cadence.tasks.live

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Un événement du flux SSE : son nom (`message` par défaut), son `id` et ses lignes `data` jointes par `\n`. */
data class SseEvent(val event: String, val id: String?, val data: String)

/**
 * Lecture ligne à ligne du flux `text/event-stream` : un événement part à la ligne vide. Les commentaires
 * (`: ping`) et les champs inconnus sont ignorés ; un bloc sans `data` n'émet rien, comme dans un navigateur.
 */
class SseParser {
    private var event: String? = null
    private var id: String? = null
    private val data = StringBuilder()
    private var hasData = false

    fun feed(line: String): SseEvent? {
        if (line.isEmpty()) return flush()
        if (line.startsWith(":")) return null
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        val value = if (colon < 0) "" else line.substring(colon + 1).removePrefix(" ")
        when (field) {
            "event" -> event = value
            "id" -> id = value
            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
            }
        }
        return null
    }

    private fun flush(): SseEvent? {
        val ready = if (hasData) SseEvent(event?.ifEmpty { null } ?: "message", id, data.toString()) else null
        event = null
        id = null
        data.setLength(0)
        hasData = false
        return ready
    }
}

/** Ce qu'un event `notification` porte (`docs/36-notifications.md`, Live stream), réduit à ce que le téléphone affiche. */
data class LiveNotification(
    val uid: String,
    val title: String,
    val message: String,
    val sources: List<String>,
    val openPath: String?,
    val taskUid: String?,
    val pluginId: String? = null,
    /** Route du plugin qui reçoit une réponse en texte libre (`POST /api<replyPath>`), si l'agent en attend une. */
    val replyPath: String? = null,
    /** Profil de l'agent (`data.agent`) : les notifications d'un même agent se regroupent. */
    val agent: String? = null,
    /** Nom à afficher de l'agent (`data.agentLabel`). */
    val agentLabel: String? = null,
    /** `message`, `answer`, `job_failure` ou `agent_error` (`data.kind`). */
    val kind: String? = null,
    /** Niveau de la notification : `info`, `success`, `warning` ou `error`. */
    val level: String? = null,
    /** Proposition d'agent (`data.proposal_uid`, `docs/47-proposals.md`) : son uid et son statut. */
    val proposalUid: String? = null,
    val proposalStatus: String? = null,
) {
    /** Routée vers le téléphone : le serveur envoie aussi au flux ce qui ne va qu'au bureau. */
    val forMobile: Boolean get() = MOBILE in sources

    companion object {
        const val EVENT = "notification"
        const val MOBILE = "mobile"

        /** Null pour un autre event, un JSON illisible ou une notification sans uid. */
        fun of(event: SseEvent): LiveNotification? {
            if (event.event != EVENT) return null
            val body = runCatching { Json.parseToJsonElement(event.data).jsonObject }.getOrNull() ?: return null
            val uid = body.text("uid") ?: event.id?.ifBlank { null } ?: return null
            val data = body["data"] as? JsonObject
            return LiveNotification(
                uid = uid,
                title = body.text("title").orEmpty(),
                message = body.text("message").orEmpty(),
                sources = (body["sources"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull },
                openPath = data?.text("openPath"),
                taskUid = data?.text("taskUid"),
                pluginId = data?.text("pluginId"),
                replyPath = data?.text("replyPath"),
                agent = data?.text("agent"),
                agentLabel = data?.text("agentLabel"),
                kind = data?.text("kind"),
                level = body.text("level"),
                proposalUid = data?.text("proposal_uid"),
                proposalStatus = data?.text("status"),
            )
        }

        /** Forme gardée dans l'intent de « Répondre » et dans la réponse en attente, relue par [decode]. */
        fun encode(notification: LiveNotification): String = buildJsonObject {
            put("uid", notification.uid)
            put("title", notification.title)
            put("message", notification.message)
            put("sources", buildJsonArray { notification.sources.forEach { add(JsonPrimitive(it)) } })
            notification.level?.let { put("level", it) }
            put(
                "data",
                buildJsonObject {
                    notification.openPath?.let { put("openPath", it) }
                    notification.taskUid?.let { put("taskUid", it) }
                    notification.pluginId?.let { put("pluginId", it) }
                    notification.replyPath?.let { put("replyPath", it) }
                    notification.agent?.let { put("agent", it) }
                    notification.agentLabel?.let { put("agentLabel", it) }
                    notification.kind?.let { put("kind", it) }
                },
            )
        }.toString()

        fun decode(raw: String?): LiveNotification? = raw?.let { of(SseEvent(EVENT, null, it)) }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.ifBlank { null }
    }
}

/** Event `notification_read` : notifications marquées lues, rejetées ou supprimées, par n'importe quel client. */
object LiveRead {
    const val EVENT = "notification_read"

    /** Uids de `data: {"uids": [...]}` ; vide pour un autre event ou un corps illisible. */
    fun uids(event: SseEvent): List<String> {
        if (event.event != EVENT) return emptyList()
        val body = runCatching { Json.parseToJsonElement(event.data).jsonObject }.getOrNull() ?: return emptyList()
        return (body["uids"] as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.takeIf { value -> value.isString }?.contentOrNull?.ifBlank { null } }
            .distinct()
    }
}

/** Les deux canaux des messages d'agents. */
enum class AgentChannel { DECIDE, INFO }

/** Présentation pure d'une notification d'agent : canal, identité, groupe. */
object AgentStyle {
    /** `warning` et `error` demandent une décision (canal HIGH) ; `info`, `success` et le reste informent. */
    fun channel(level: String?): AgentChannel = if (level == "warning" || level == "error") AgentChannel.DECIDE else AgentChannel.INFO

    /** Nom de l'agent à afficher ; [fallback] (« Agent ») s'il n'est pas donné. */
    fun label(notification: LiveNotification, fallback: String): String =
        notification.agentLabel?.trim()?.ifEmpty { null } ?: fallback

    /** Groupe Android : un par agent, sinon un par plugin, sinon un seul. */
    fun group(notification: LiveNotification): String =
        "agent:" + (notification.agent ?: notification.pluginId ?: "default")

    /** Une rafale (fin des heures calmes, plusieurs agents qui répondent) ne sonne qu'une fois par [BURST_MS]. */
    const val BURST_MS = 30_000L

    /** Le résumé du groupe sonne pour un nouveau message, sauf s'il vient de sonner pour la même rafale. */
    fun alertSummary(lastAlertMs: Long?, nowMs: Long, newMessage: Boolean): Boolean =
        newMessage && (lastAlertMs == null || nowMs - lastAlertMs >= BURST_MS)

    /** Échec d'une tâche planifiée ou d'un agent : catégorie « erreur » d'Android. */
    fun isFailure(notification: LiveNotification): Boolean = notification.kind == "job_failure" || notification.kind == "agent_error"
}

/** Ce qu'ouvre le toucher d'une notification. */
sealed interface LiveTarget {
    /** Page du plugin [id], [query] (avec son `?`, ou vide) ajoutée à son adresse. */
    data class Plugin(val id: String, val query: String) : LiveTarget

    data class Task(val uid: String) : LiveTarget

    data object App : LiveTarget

    companion object {
        // Identifiant comme `backend/modules/plugins/core/manifest.js` ; requête sans espace, `#` ni guillemet.
        private val PLUGIN_PATH = Regex("""^/plugins/([a-z][a-z0-9-]{1,31})/?(\?[A-Za-z0-9._~%&=+,:@/-]*)?$""")
        private val TASK_UID = Regex("""^[A-Za-z0-9_-]{1,64}$""")

        /**
         * Seul un chemin interne `/plugins/<id>[?…]` ouvre une page ; une adresse, `//hôte`, un autre chemin ou un
         * caractère douteux retombe sur la tâche (`taskUid`) puis sur l'app.
         */
        fun of(openPath: String?, taskUid: String?): LiveTarget {
            openPath?.let(PLUGIN_PATH::matchEntire)?.let { match ->
                return Plugin(match.groupValues[1], match.groupValues[2])
            }
            taskUid?.takeIf(TASK_UID::matches)?.let { return Task(it) }
            return App
        }
    }
}

/** Derniers uids notifiés, du plus ancien au plus récent : une notification n'est montrée qu'une fois. */
object SeenUids {
    const val MAX = 200

    /** Null si [uid] est déjà vu ; sinon la liste qui le retient, réduite aux [max] derniers. */
    fun add(seen: List<String>, uid: String, max: Int = MAX): List<String>? {
        if (uid in seen) return null
        return (seen + uid).takeLast(max)
    }
}

/** Pause avant de se reconnecter : 5 s, doublée à chaque échec jusqu'à 60 s ; repart à 5 s après un `ready`. */
object Reconnect {
    const val FIRST_MS = 5_000L
    const val MAX_MS = 60_000L

    fun next(previousMs: Long?): Long = if (previousMs == null) FIRST_MS else (previousMs * 2).coerceAtMost(MAX_MS)
}

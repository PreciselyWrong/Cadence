package ch.nicolab.cadence.tasks.triage

import java.net.URLEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Ce que fait une action de la carte : la décision, sa charge, et si Gmail s'ouvre aussi. */
data class MailAdvice(val decision: MailDecision, val payload: JsonObject, val opensMail: Boolean)

/** Avancement du paquet : cartes décidées sur le total à l'ouverture (« 4 / 17 »). */
data class DeckProgress(val done: Int, val total: Int) {
    val fraction: Float get() = if (total == 0) 1f else done.toFloat() / total
}

/**
 * Règles du paquet « Trier mes mails » (`docs/43-mail-triage.md`), comme le web (`frontend/components/Triage/mailDeck.ts`) :
 * les cartes Mail de la file une à une. Une carte à options suit le conseil de l'agent ; une carte d'avant le paquet v2
 * garde son ancien conseil.
 */
object MailDeck {
    /** Plugin dont la page porte le chat avec les agents. */
    const val CHAT_PLUGIN = "hermes"

    /** Longueur maximale d'une remarque « Répondre par un mot ». */
    const val NOTE_MAX_LENGTH = 500

    /** Sous ce seuil, archiver un par un dans le paquet est aussi rapide. */
    const val BATCH_MIN = 2

    private val EMPTY = JsonObject(emptyMap())

    /** Les cartes Mail lisibles, dans l'ordre de la file (cartes passées en dernier, fait par la file). */
    fun cards(items: List<TriageItemDto>): List<Pair<TriageItemDto, MailCardData>> =
        items.filter { it.type == MAIL_TYPE }.mapNotNull { item -> MailPayload.parse(item.payload)?.let { item to it } }

    /**
     * Les cartes que l'agent conseille d'archiver (newsletters, reçus…), proposées ensemble à l'ouverture : un geste
     * pour le bruit, puis l'essentiel. Une carte dont la dernière action a échoué reste dans le paquet, où son erreur
     * s'affiche.
     */
    fun archiveBatch(cards: List<Pair<TriageItemDto, MailCardData>>): List<Pair<TriageItemDto, MailCardData>> {
        val batch = cards.filter { (_, card) ->
            card.recommended == MailOption.ARCHIVE &&
                MailOption.ARCHIVE in card.options &&
                card.actionError == null
        }
        return if (batch.size >= BATCH_MIN) batch else emptyList()
    }

    /** Le conseil d'un glissement droit : l'option recommandée, sinon la première ; sans options, l'ancien conseil. */
    fun recommendation(card: MailCardData): MailAdvice {
        if (card.options.isEmpty()) return legacyRecommendation(card)
        return adviceFor(card.recommended ?: card.options.first(), card)
    }

    /** Ce que fait une action de la carte. Seule Répondre ouvre Gmail ; le brouillon se prépare côté serveur. */
    fun adviceFor(option: MailOption, card: MailCardData): MailAdvice = MailAdvice(
        option.decision,
        if (option == MailOption.TASK) taskPayload(card) else EMPTY,
        opensMail = option == MailOption.REPLY,
    )

    /** La tâche née du mail : nom de l'agent (ou objet, ou résumé), puis l'échéance suggérée ou, à défaut, l'horizon. */
    fun taskPayload(card: MailCardData): JsonObject = buildJsonObject {
        put("name", card.taskName)
        val due = card.dueDate
        if (due != null) put("due_date", due) else card.horizon?.let { put("horizon", it) }
    }

    /** Charge de « Répondre par un mot » : le texte rogné, ou null si la remarque est vide. */
    fun noteText(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() }?.take(NOTE_MAX_LENGTH)

    fun notePayload(text: String): JsonObject = buildJsonObject { put("text", text) }

    /** Avancement : [remaining] cartes restent, le total grandit si la file en apporte plus que prévu. */
    fun progress(remaining: Int, total: Int): DeckProgress {
        val opened = maxOf(total, remaining)
        return DeckProgress(done = (opened - remaining).coerceAtLeast(0), total = opened)
    }

    /** Requête de la page du plugin : la conversation s'ouvre sur ce mail. */
    fun chatQuery(mailUid: String): String = "?view=chat&mail=" + URLEncoder.encode(mailUid, "UTF-8")

    /** Cartes d'avant le paquet v2 (sans options) : le conseil `kind` et le bouton principal d'alors. */
    private fun legacyRecommendation(card: MailCardData): MailAdvice = when {
        card.kind == "reply" && card.gmailUrl != null -> MailAdvice(MailDecision.REPLY, EMPTY, opensMail = true)
        card.kind == "read" && card.gmailUrl != null -> MailAdvice(MailDecision.DISMISS, EMPTY, opensMail = true)
        card.kind == "event" && card.event != null -> MailAdvice(MailDecision.EVENT, EMPTY, opensMail = false)
        else -> MailAdvice(MailDecision.TASK, taskPayload(card), opensMail = false)
    }
}

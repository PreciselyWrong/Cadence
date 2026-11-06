package ch.nicolab.cadence.tasks.ui.brief

import java.time.LocalDate

/**
 * Ce que la personne vient de faire dans le résumé, montré à l'instant sans attendre Room ni le serveur : la ligne se
 * coche, la carte se referme sur son choix. Pur, donc testé sur la JVM ; l'écran ne fait que le lire.
 *
 * Deux durées de vie : [completing] ne vit que le temps que Room rattrape la tâche (une tâche récurrente reste
 * ouverte, la ligne reste cochée jusqu'à l'annulation) ; le reste est une décision, gardée avec le jour
 * ([lasting] / [fromLasting]) pour que la carte ne se rouvre pas au prochain passage. Toute entrée s'annule.
 */
data class BriefPending(
    val completing: Set<String> = emptySet(),
    /** Clé de la proposition de déplacement -> jour choisi. */
    val moved: Map<String, LocalDate> = emptyMap(),
    /** Clé de la carte -> avis (`useful` ou `noise`). */
    val feedback: Map<String, String> = emptyMap(),
    /** Tâches reportées à demain depuis le bilan du soir. */
    val carried: Set<String> = emptySet(),
    /** Tâche -> ce que le bilan du soir en a fait (nouvelle échéance, « Plus tard », abandon). */
    val outcomes: Map<String, RowOutcome> = emptyMap(),
) {
    fun isCompleting(uid: String): Boolean = uid in completing

    fun complete(uid: String) = copy(completing = completing + uid)
    fun uncomplete(uid: String) = copy(completing = completing - uid)

    fun move(proposalKey: String, to: LocalDate) = copy(moved = moved + (proposalKey to to))
    fun unmove(proposalKey: String) = copy(moved = moved - proposalKey)

    fun vote(cardKey: String, vote: String) = copy(feedback = feedback + (cardKey to vote))
    fun unvote(cardKey: String) = copy(feedback = feedback - cardKey)

    fun carry(uids: Collection<String>) = copy(carried = carried + uids)
    fun uncarry(uids: Collection<String>) = copy(carried = carried - uids.toSet())

    fun decide(uid: String, outcome: RowOutcome) = copy(outcomes = outcomes + (uid to outcome))
    fun undecide(uid: String) = copy(outcomes = outcomes - uid)

    /** Ce que la ligne du bilan du soir doit dire : la dernière décision, sinon « Demain » si elle est reportée. */
    fun outcome(uid: String): RowOutcome? = outcomes[uid] ?: RowOutcome.Tomorrow.takeIf { uid in carried }

    /** Les décisions à garder (tout sauf [completing]), à plat : `genre:clé` -> valeur. */
    fun lasting(): Map<String, String> = buildMap {
        moved.forEach { (key, day) -> put("$MOVE$key", day.toString()) }
        feedback.forEach { (key, value) -> put("$FEEDBACK$key", value) }
        carried.forEach { put("$CARRY$it", "") }
        outcomes.forEach { (uid, outcome) -> put("$OUTCOME$uid", outcome.encode()) }
    }

    companion object {
        private const val MOVE = "move:"
        private const val FEEDBACK = "feedback:"
        private const val CARRY = "carry:"
        private const val OUTCOME = "outcome:"

        /** Relit [lasting] ; une entrée inconnue ou une date illisible est ignorée. */
        fun fromLasting(entries: Map<String, String>): BriefPending {
            var pending = BriefPending()
            entries.forEach { (raw, value) ->
                when {
                    raw.startsWith(MOVE) -> runCatching { LocalDate.parse(value) }.getOrNull()?.let { pending = pending.move(raw.removePrefix(MOVE), it) }
                    raw.startsWith(FEEDBACK) -> pending = pending.vote(raw.removePrefix(FEEDBACK), value)
                    raw.startsWith(OUTCOME) -> RowOutcome.decode(value)?.let { pending = pending.decide(raw.removePrefix(OUTCOME), it) }
                    raw.startsWith(CARRY) -> pending = pending.carry(listOf(raw.removePrefix(CARRY)))
                }
            }
            return pending
        }
    }
}

/** Ce qu'une ligne du bilan du soir a reçu : sert d'étiquette à la ligne, et de mémoire d'un jour à l'autre passage. */
sealed interface RowOutcome {
    data object Tomorrow : RowOutcome
    data class Due(val day: LocalDate) : RowOutcome
    data object Later : RowOutcome
    data object Abandoned : RowOutcome

    fun encode(): String = when (this) {
        Tomorrow -> "tomorrow"
        is Due -> "due:$day"
        Later -> "later"
        Abandoned -> "abandoned"
    }

    companion object {
        fun decode(raw: String): RowOutcome? = when {
            raw == "tomorrow" -> Tomorrow
            raw == "later" -> Later
            raw == "abandoned" -> Abandoned
            raw.startsWith("due:") -> runCatching { LocalDate.parse(raw.removePrefix("due:")) }.getOrNull()?.let(::Due)
            else -> null
        }
    }
}

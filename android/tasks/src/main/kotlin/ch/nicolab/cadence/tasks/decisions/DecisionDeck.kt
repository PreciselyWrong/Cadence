package ch.nicolab.cadence.tasks.decisions

import ch.nicolab.cadence.tasks.triage.DeckProgress
import java.time.Instant

/**
 * Règles pures du paquet « Décider » (`docs/49-agent-decisions.md`) :
 * cartes groupées par type (dans l'ordre de leur carte la plus ancienne), puis de la plus ancienne à la plus récente.
 */
object DecisionDeck {
    const val NOTE_MAX_LENGTH = 500
    const val BODY_FOLD_LINES = 7

    /** Ordonne les cartes visibles : par `kind` (plus ancienne carte du type d'abord), puis plus ancienne d'abord ; passées à la fin. */
    fun cards(
        cards: List<DecisionCardData>,
        hidden: Set<String> = emptySet(),
        skipped: List<String> = emptyList(),
    ): List<DecisionCardData> {
        val visible = cards.filterNot { it.uid in hidden }
        if (visible.isEmpty()) return emptyList()
        val byKind = linkedMapOf<String, MutableList<DecisionCardData>>()
        visible.forEach { card -> byKind.getOrPut(card.kind) { mutableListOf() }.add(card) }

        val sortedGroups = byKind.values.map { group ->
            group.sortedWith(compareBy<DecisionCardData> { createdSortKey(it.createdAt) })
        }.sortedWith(compareBy { createdSortKey(it.first().createdAt) })

        val ordered = sortedGroups.flatten()
        if (skipped.isEmpty()) return ordered
        return ordered.sortedBy { card -> skipped.indexOf(card.uid) }
    }

    /** Choix recommandé par l'agent, s'il figure dans les choix de la carte. */
    fun recommendedChoice(card: DecisionCardData): DecisionChoice? =
        card.recommended?.let { rec -> card.choices.firstOrNull { it.id == rec } }

    /** Texte rogné pour « Répondre par un mot », ou null si vide. */
    fun noteText(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() }?.take(NOTE_MAX_LENGTH)

    /** Avancement : [remaining] cartes restent, le total grandit si de nouvelles cartes arrivent. */
    fun progress(remaining: Int, total: Int): DeckProgress {
        val opened = maxOf(total, remaining)
        return DeckProgress(done = (opened - remaining).coerceAtLeast(0), total = opened)
    }

    private fun createdSortKey(createdAt: String?): Long {
        if (createdAt.isNullOrBlank()) return Long.MAX_VALUE
        return runCatching { Instant.parse(createdAt).toEpochMilli() }.getOrDefault(Long.MAX_VALUE)
    }
}

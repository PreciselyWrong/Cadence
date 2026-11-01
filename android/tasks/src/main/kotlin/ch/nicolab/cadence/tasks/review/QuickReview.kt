package ch.nicolab.cadence.tasks.review

import java.time.Instant

/** Un élément de la revue rapide ; [key] est celle des lignes de la revue (tâche : son uid). */
sealed interface QuickEntry {
    val key: String

    data class Inbox(val item: ReviewInboxItem) : QuickEntry {
        override val key: String get() = "inbox:${item.uid}"
    }

    /** [step] : la liste d'où vient la tâche (Repoussées, Plus tard, Anciennes), qui donne ses choix. */
    data class Task(val item: ReviewTask, val step: ReviewStep) : QuickEntry {
        override val key: String get() = item.uid
    }

    data class Project(val item: ReviewProject) : QuickEntry {
        override val key: String get() = "project:${item.uid}"
    }
}

/** Où en est la revue rapide : l'élément affiché, sa place dans la session, la taille de la session. */
data class QuickView(val current: QuickEntry?, val position: Int, val total: Int)

/**
 * « Revue rapide » : une seule file courte au lieu de six listes, comme le web (`buildQuickReview`).
 * D'abord ce qui demande un regard, dans l'ordre des onglets (Inbox, repoussées, projets, revues
 * arrivées, anciennes) ; puis les idées de « Plus tard » regardées il y a le plus longtemps, au moins
 * trois s'il y en a, pour que le stock se lise quelques idées à la fois au lieu de jamais.
 */
object QuickReview {
    /** Environ cinq minutes à un rythme calme : une session n'en demande jamais plus. */
    const val SIZE = 10

    /** Places gardées pour les idées de « Plus tard », quoi qu'il y ait d'autre à regarder. */
    const val PARKED_PLACES = 3

    fun build(
        inbox: List<ReviewInboxItem> = emptyList(),
        pushed: List<ReviewTask> = emptyList(),
        projects: List<ReviewProject> = emptyList(),
        later: List<ReviewTask> = emptyList(),
        stale: List<ReviewTask> = emptyList(),
        size: Int = SIZE,
        exclude: Set<String> = emptySet(),
    ): List<QuickEntry> {
        val parked = later.filterNot { it.reviewDue }
            .sortedWith(compareBy<ReviewTask>({ it.reviewedAt ?: Instant.EPOCH }, { it.lastActivityAt ?: Instant.EPOCH }))
        val candidates: List<QuickEntry> = inbox.map { QuickEntry.Inbox(it) } +
            pushed.map { QuickEntry.Task(it, ReviewStep.PUSHED) } +
            projects.map { QuickEntry.Project(it) } +
            later.filter { it.reviewDue }.map { QuickEntry.Task(it, ReviewStep.LATER) } +
            stale.map { QuickEntry.Task(it, ReviewStep.STALE) } +
            parked.map { QuickEntry.Task(it, ReviewStep.LATER) }
        val seen = exclude.toMutableSet()
        val unique = candidates.filter { seen.add(it.key) }
        fun isParked(entry: QuickEntry) = entry is QuickEntry.Task && entry.step == ReviewStep.LATER
        val attention = unique.filterNot(::isParked)
        val parkedCount = unique.count(::isParked)
        val attentionTaken = minOf(attention.size, size - minOf(PARKED_PLACES, parkedCount, size))
        val chosen = (attention.take(attentionTaken) + unique.filter(::isParked).take(size - attentionTaken)).toSet()
        return unique.filter { it in chosen }
    }

    /**
     * La session telle qu'elle se lit : la prochaine entrée encore à décider et pas passée. Une entrée
     * décidée (ici, dans une liste ou sur un autre appareil) sort d'elle-même via [pending].
     */
    fun view(entries: List<QuickEntry>, skipped: List<String>, pending: (QuickEntry) -> Boolean): QuickView {
        val left = entries.filter { it.key !in skipped && pending(it) }
        return QuickView(left.firstOrNull(), entries.size - left.size + 1, entries.size)
    }
}

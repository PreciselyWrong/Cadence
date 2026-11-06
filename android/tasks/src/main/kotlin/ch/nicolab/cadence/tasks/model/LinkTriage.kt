package ch.nicolab.cadence.tasks.model

import java.time.LocalDate

/**
 * Décisions sur un lien : garder, en faire une tâche, tester, rattacher à un projet, repousser, archiver. L'Inbox offre
 * [LinkTriage.inboxDecisions], la galerie [LinkTriage.GALLERY_DECISIONS].
 */
enum class LinkDecision { KEEP, TASK, TEST, ATTACH, LATER, DROP }

/** Une écriture locale d'une décision ; chacune part par la file d'envoi, hors ligne compris. */
sealed interface TriageStep {
    data class CreateTask(val draft: TaskDraft) : TriageStep
    data class SetStatus(val linkUid: String, val status: LinkStatus) : TriageStep
    data class SetReviewDate(val linkUid: String, val date: LocalDate) : TriageStep
    data class ProcessInbox(val entryUid: String) : TriageStep
}

/** Où les écritures d'une décision atterrissent ; le dépôt Room en prod, un faux dans les tests. */
interface TriageSink {
    suspend fun createTask(draft: TaskDraft)
    suspend fun setLinkStatus(uid: String, status: LinkStatus)
    suspend fun setReviewDate(uid: String, date: LocalDate)
    suspend fun processInboxItem(uid: String)
}

/** Une idée de l'Inbox et le lien qu'elle porte. */
data class TriageCard(val entry: InboxEntry, val link: LinkItem)

/** Avancement du tri en série : [total] liens au départ, [remaining] encore dans l'Inbox. */
data class TriageProgress(val total: Int, val remaining: Int) {
    val position: Int get() = (total - remaining + 1).coerceIn(1, maxOf(total, 1))
}

object LinkTriage {
    /** « Plus tard » repose le lien un mois. */
    const val LATER_DAYS = 30L

    /** Pastilles d'une idée de l'Inbox, dans l'ordre du web ; « Plus… » y garde la conversion en tâche. */
    val INBOX_DECISIONS = listOf(LinkDecision.KEEP, LinkDecision.TEST, LinkDecision.ATTACH, LinkDecision.LATER, LinkDecision.DROP)

    /** « Rattacher » n'existe pas sans projet ouvert où ranger la tâche (comme le web). */
    fun inboxDecisions(hasProjects: Boolean): List<LinkDecision> =
        if (hasProjects) INBOX_DECISIONS else INBOX_DECISIONS - LinkDecision.ATTACH

    /** Les décisions qui demandent d'abord un projet. */
    fun needsProject(decision: LinkDecision): Boolean = decision == LinkDecision.TEST || decision == LinkDecision.ATTACH

    /** « À tester » peut rester sans projet ; « Rattacher » exige d'en choisir un. */
    fun allowsNoProject(decision: LinkDecision): Boolean = decision == LinkDecision.TEST

    /** Pastilles d'une carte de la galerie : Tâche, À tester, Rattacher, Reporter, Archiver. */
    val GALLERY_DECISIONS = listOf(LinkDecision.TASK, LinkDecision.TEST, LinkDecision.ATTACH, LinkDecision.LATER, LinkDecision.DROP)

    /**
     * Ce que fait chaque décision. Le lien change toujours de statut ; l'idée [entryUid] qui le porte, s'il y en a
     * une encore ouverte, est marquée traitée (elle quitte l'Inbox, le lien reste dans la bibliothèque), en dernier
     * pour qu'une écriture qui échoue la laisse visible. « À tester » crée en plus la tâche [testTaskName] ;
     * « Rattacher » crée dans le projet [projectUid] une tâche au nom du lien, qui garde l'adresse en note
     * (un lien n'a pas de projet : c'est la tâche qui le range), et marque le lien gardé.
     */
    fun steps(
        decision: LinkDecision,
        entryUid: String?,
        link: LinkItem,
        today: LocalDate,
        projectUid: String?,
        testTaskName: String,
    ): List<TriageStep> = buildList {
        when (decision) {
            LinkDecision.KEEP -> add(TriageStep.SetStatus(link.uid, LinkStatus.KEPT))
            LinkDecision.TASK -> {
                add(TriageStep.CreateTask(TaskDraft(name = link.displayTitle, note = testTaskNote(link))))
                add(TriageStep.SetStatus(link.uid, LinkStatus.KEPT))
            }
            LinkDecision.TEST -> {
                add(TriageStep.CreateTask(TaskDraft(name = testTaskName, note = testTaskNote(link), projectUid = projectUid)))
                add(TriageStep.SetStatus(link.uid, LinkStatus.TESTED))
            }
            LinkDecision.ATTACH -> {
                add(TriageStep.CreateTask(TaskDraft(name = link.displayTitle, note = testTaskNote(link), projectUid = projectUid)))
                add(TriageStep.SetStatus(link.uid, LinkStatus.KEPT))
            }
            LinkDecision.LATER -> {
                add(TriageStep.SetStatus(link.uid, LinkStatus.PARKED))
                add(TriageStep.SetReviewDate(link.uid, today.plusDays(LATER_DAYS)))
            }
            LinkDecision.DROP -> add(TriageStep.SetStatus(link.uid, LinkStatus.DROPPED))
        }
        entryUid?.let { add(TriageStep.ProcessInbox(it)) }
    }

    /** L'idée encore dans l'Inbox qui porte [link] ; null s'il a été trouvé ailleurs ou que l'idée est traitée. */
    fun openEntry(link: LinkItem, entries: List<InboxEntry>, links: List<LinkItem>): InboxEntry? =
        entries.firstOrNull { LinkLists.forEntry(links, it.uid, it.content)?.uid == link.uid }

    /** L'adresse d'abord, puis la note de l'utilisateur : la tâche garde de quoi retrouver et comprendre le lien. */
    fun testTaskNote(link: LinkItem): String = listOfNotNull(link.url, link.note?.takeIf { it.isNotBlank() }).joinToString("\n\n")

    suspend fun run(steps: List<TriageStep>, sink: TriageSink) {
        steps.forEach { step ->
            when (step) {
                is TriageStep.CreateTask -> sink.createTask(step.draft)
                is TriageStep.SetStatus -> sink.setLinkStatus(step.linkUid, step.status)
                is TriageStep.SetReviewDate -> sink.setReviewDate(step.linkUid, step.date)
                is TriageStep.ProcessInbox -> sink.processInboxItem(step.entryUid)
            }
        }
    }

    /**
     * Les idées à trier, la plus ancienne d'abord. Celles passées (« Passer ») vont à la fin, dans l'ordre où
     * elles ont été passées : la file se reprend où on l'a laissée, sans état en plus que cette liste.
     */
    fun queue(entries: List<InboxEntry>, links: List<LinkItem>, skipped: List<String> = emptyList()): List<TriageCard> {
        val cards = entries
            .sortedWith(compareBy<InboxEntry> { it.createdAt ?: java.time.Instant.EPOCH }.thenBy { it.uid })
            .mapNotNull { entry -> LinkLists.forEntry(links, entry.uid, entry.content)?.let { TriageCard(entry, it) } }
        val (passed, fresh) = cards.partition { it.entry.uid in skipped }
        return fresh + passed.sortedBy { skipped.indexOf(it.entry.uid) }
    }

    /** « Passer » : l'idée repart au bout de la file. */
    fun skip(skipped: List<String>, entryUid: String): List<String> = skipped.filterNot { it == entryUid } + entryUid

    /** Oublie les idées qui ne sont plus dans l'Inbox. */
    fun pruneSkipped(skipped: List<String>, live: Set<String>): List<String> = skipped.filter { it in live }

    fun toggleTag(current: List<String>, tagUid: String): List<String> =
        if (tagUid in current) current - tagUid else current + tagUid
}

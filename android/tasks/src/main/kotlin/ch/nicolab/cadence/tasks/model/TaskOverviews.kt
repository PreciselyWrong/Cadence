package ch.nicolab.cadence.tasks.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/** Un projet avec son avancement : tâches terminées sur total, et la prochaine à faire. */
data class ProjectCard(
    val project: ProjectItem,
    val openCount: Int,
    val doneCount: Int,
    val nextTaskName: String?,
) {
    val progress: Float get() = if (openCount + doneCount == 0) 0f else doneCount.toFloat() / (openCount + doneCount)
}

/** Projets d'un domaine ; [area] est null pour ceux qui n'en ont pas. */
data class AreaGroup(val area: AreaItem?, val projects: List<ProjectCard>)

data class TagCard(val tag: TagItem, val openCount: Int)

/** Jour de la bande « À venir » : [count] tâches prévues, représentées par au plus trois points. */
data class StripDay(val date: LocalDate, val count: Int)

/** Chiffres du Bilan pour les tâches. */
data class TaskStats(val doneThisWeek: Int, val doneLastWeek: Int, val overdue: Int)

/** Vues dérivées de la liste de tâches pour Projets, Étiquettes, Terminées, À venir et le Bilan. */
object TaskOverviews {
    private const val STRIP_DAYS = 7
    private const val DONE_LIMIT = 200

    fun projectGroups(
        projects: List<ProjectItem>,
        areas: List<AreaItem>,
        tasks: List<TaskItem>,
        now: Instant,
    ): List<AreaGroup> {
        val cards = projects.map { project ->
            val own = tasks.filter { it.projectUid == project.uid }
            val open = TaskViews.ofProject(tasks, project.uid, now)
            ProjectCard(
                project = project,
                openCount = own.count { !it.isClosed },
                doneCount = own.count { it.status == TaskStatus.DONE },
                nextTaskName = open.firstOrNull()?.name,
            )
        }.sortedBy { it.project.name.lowercase() }
        val known = areas.mapTo(HashSet()) { it.uid }
        val grouped = areas.mapNotNull { area ->
            cards.filter { it.project.areaUid == area.uid }.takeIf { it.isNotEmpty() }?.let { AreaGroup(area, it) }
        }
        val orphans = cards.filter { it.project.areaUid == null || it.project.areaUid !in known }
        return if (orphans.isEmpty()) grouped else grouped + AreaGroup(null, orphans)
    }

    fun tagCards(tags: List<TagItem>, tasks: List<TaskItem>): List<TagCard> =
        tags.map { tag -> TagCard(tag, tasks.count { tag.uid in it.tagUids && !it.isClosed }) }
            .sortedBy { it.tag.name.lowercase() }

    fun ofTag(tasks: List<TaskItem>, tagUid: String, now: Instant): List<TaskItem> =
        tasks.filter { tagUid in it.tagUids && !it.isClosed && it.parentTaskUid == null && (it.deferUntil == null || !it.deferUntil.isAfter(now)) }
            .sortedWith(compareBy<TaskItem> { it.dueDate == null }.thenBy { it.dueDate }.thenBy { it.name.lowercase() })

    /** Tâches terminées, du jour le plus récent au plus ancien, plafonnées pour garder la liste légère. */
    fun completedByDay(tasks: List<TaskItem>, zone: ZoneId): List<Pair<LocalDate, List<TaskItem>>> =
        tasks.filter { it.status == TaskStatus.DONE && it.completedAt != null }
            .sortedByDescending { it.completedAt }
            .take(DONE_LIMIT)
            .groupBy { it.completedAt!!.atZone(zone).toLocalDate() }
            .toList()

    /** Aujourd'hui puis les six jours suivants, avec le nombre de tâches de chacun. */
    fun weekStrip(today: LocalDate, todayCount: Int, upcoming: Map<LocalDate, List<TaskItem>>): List<StripDay> =
        (0 until STRIP_DAYS).map { offset ->
            val date = today.plusDays(offset.toLong())
            StripDay(date, if (offset == 0) todayCount else upcoming[date]?.size ?: 0)
        }

    fun taskStats(tasks: List<TaskItem>, today: LocalDate, now: Instant, zone: ZoneId): TaskStats {
        val weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val lastWeekStart = weekStart.minusWeeks(1)
        val doneDays = tasks.filter { it.status == TaskStatus.DONE && it.completedAt != null }
            .map { it.completedAt!!.atZone(zone).toLocalDate() }
        return TaskStats(
            doneThisWeek = doneDays.count { !it.isBefore(weekStart) && !it.isAfter(today) },
            doneLastWeek = doneDays.count { !it.isBefore(lastWeekStart) && it.isBefore(weekStart) },
            overdue = TaskViews.overdue(tasks, today, now).size,
        )
    }
}

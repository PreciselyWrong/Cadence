package ch.nicolab.cadence.tasks.model

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Suggestions du jour comme le serveur (`getCandidates`, `daily-plan/service.js`) : même ensemble et même ordre. */
class SuggestionsTest {
    private val today = LocalDate.of(2026, 11, 26)
    private val now: Instant = Instant.parse("2026-11-26T09:00:00Z")
    private val week = LocalDate.of(2026, 11, 23)
    private val active = ProjectItem("actif", "Actif", status = "in_progress")
    private val planned = ProjectItem("prevu", "Prévu", status = "planned")
    private val paused = ProjectItem("pause", "Pause", status = "paused")

    private fun task(uid: String, project: String? = null, priority: Int? = null, due: Duration? = null, status: Int = TaskStatus.NOT_STARTED) =
        TaskItem(
            uid = uid, name = uid, status = status, projectUid = project, priority = priority,
            dueDate = due?.let { now.plus(it) },
        )

    private fun uids(tasks: List<TaskItem>, vararg projects: ProjectItem) =
        TaskViews.suggestions(tasks, today, now, week, projects.toList()).map { it.uid }

    @Test
    fun `une tâche ouverte sans projet est suggérée sans avoir été mise en vue ni décidée pour la semaine`() {
        val tasks = listOf(task("cle-yazio").copy(fileBacked = true, source = "todo_md"), task("David"))
        assertEquals(listOf("cle-yazio", "David"), uids(tasks))
    }

    @Test
    fun `une tâche seule d'un projet en cours est suggérée, pas celle d'un projet prévu, en pause ou inconnu`() {
        val tasks = listOf(task("a", "actif"), task("b", "prevu"), task("c", "pause"), task("d", "inconnu"))
        assertEquals(listOf("a"), uids(tasks, active, planned, paused))
    }

    @Test
    fun `un projet qui a choisi sa prochaine action ne propose que celle-là parmi ses tâches ordinaires`() {
        val tasks = listOf(task("autre", "actif"), task("choisie", "actif"))
        val picked = active.copy(nextTaskUid = "choisie")
        assertEquals(listOf("choisie"), uids(tasks, picked))
    }

    @Test
    fun `une échéance au-delà de trois jours ou un report futur écarte la tâche, une échéance proche non`() {
        val tasks = listOf(
            task("proche", due = Duration.ofDays(2)),
            task("loin", due = Duration.ofDays(4)),
            task("reportee").copy(deferUntil = now.plus(Duration.ofDays(1))),
        )
        assertEquals(listOf("proche"), uids(tasks))
    }

    @Test
    fun `ni série, ni sous-tâche, ni Plus tard, ni tâche close ou déjà à l'écran`() {
        val tasks = listOf(
            task("serie").copy(recurrenceType = "weekly"),
            task("sous").copy(parentTaskUid = "x"),
            task("plus-tard").copy(someday = true),
            task("faite", status = TaskStatus.DONE),
            task("du-jour").copy(dueDay = today),
            task("en-cours", status = TaskStatus.IN_PROGRESS),
            task("ok"),
        )
        assertEquals(listOf("ok"), uids(tasks))
    }

    @Test
    fun `semaine puis en vue puis le reste, chacun par priorité, projet avant sans projet, échéance`() {
        val tasks = listOf(
            task("reste-haute", priority = TaskPriority.HIGH),
            task("reste-projet", "actif"),
            task("reste-sans"),
            task("reste-echeance", due = Duration.ofDays(1)),
            task("vue-ancienne").copy(inViewAt = Instant.parse("2026-10-01T00:00:00Z")),
            task("vue-recente").copy(inViewAt = Instant.parse("2026-11-01T00:00:00Z")),
            task("semaine-basse", priority = TaskPriority.LOW).copy(weekOf = week),
            task("semaine-haute", priority = TaskPriority.HIGH).copy(weekOf = week),
        )
        assertEquals(
            listOf(
                "semaine-haute", "semaine-basse", "vue-recente", "vue-ancienne",
                "reste-haute", "reste-projet", "reste-echeance", "reste-sans",
            ),
            uids(tasks, active),
        )
    }
}

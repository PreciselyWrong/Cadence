package ch.nicolab.cadence.tasks.views

import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SavedViewsTest {
    private val today = LocalDate.of(2026, 11, 21)
    private val now = Instant.parse("2026-11-21T10:00:00Z")
    private val tags = listOf(
        TagItem(uid = "t-urgent", name = "Urgent"),
        TagItem(uid = "t-maison", name = "Maison"),
    )

    private fun task(
        uid: String,
        name: String = "Tâche $uid",
        note: String? = null,
        status: Int = TaskStatus.NOT_STARTED,
        priority: Int? = null,
        dueDay: LocalDate? = null,
        deferUntil: Instant? = null,
        projectUid: String? = null,
        tagUids: List<String> = emptyList(),
        parentTaskUid: String? = null,
        recurrenceType: String? = null,
    ) = TaskItem(
        uid = uid,
        name = name,
        note = note,
        status = status,
        priority = priority,
        dueDay = dueDay,
        deferUntil = deferUntil,
        projectUid = projectUid,
        tagUids = tagUids,
        parentTaskUid = parentTaskUid,
        recurrenceType = recurrenceType,
    )

    @Test
    fun `parses views list from server json`() {
        val json = Json.parseToJsonElement(
            """
            [
              {
                "uid": "v1",
                "name": "Urgentes cette semaine",
                "search_query": "rapport",
                "filters": ["Tasks"],
                "priority": "high",
                "due": "this_week",
                "tags": ["Urgent"],
                "extras": ["assigned_to_project"],
                "task_status": "in_progress",
                "project_uid": "p1",
                "is_pinned": true
              }
            ]
            """.trimIndent(),
        )

        val views = ViewsClient.parseViews(json)
        assertEquals(1, views.size)
        val v = views.first()
        assertEquals("v1", v.uid)
        assertEquals("Urgentes cette semaine", v.name)
        assertEquals("rapport", v.searchQuery)
        assertEquals(listOf("Tasks"), v.filters)
        assertEquals("high", v.priority)
        assertEquals("this_week", v.due)
        assertEquals(listOf("Urgent"), v.tags)
        assertEquals(listOf("assigned_to_project"), v.extras)
        assertEquals("in_progress", v.taskStatus)
        assertEquals("p1", v.projectUid)
        assertTrue(v.isPinned)
    }

    @Test
    fun `evaluates status, priority, due, project, tags and search locally`() {
        val tasks = listOf(
            task("1", name = "Envoyer le rapport", priority = TaskPriority.HIGH, dueDay = today.plusDays(2), projectUid = "p1", tagUids = listOf("t-urgent")),
            task("2", name = "Rapport secondaire", priority = TaskPriority.LOW, dueDay = today.plusDays(2), projectUid = "p1", tagUids = listOf("t-urgent")),
            task("3", name = "Envoyer le rapport", priority = TaskPriority.HIGH, dueDay = today.plusDays(20), projectUid = "p1", tagUids = listOf("t-urgent")),
            task("4", name = "Envoyer le rapport", priority = TaskPriority.HIGH, dueDay = today.plusDays(2), projectUid = "p1", tagUids = listOf("t-urgent"), status = TaskStatus.DONE),
            task("5", name = "Sous-tâche rapport", priority = TaskPriority.HIGH, dueDay = today.plusDays(2), projectUid = "p1", tagUids = listOf("t-urgent"), parentTaskUid = "1"),
        )
        val view = SavedView(
            uid = "v1",
            name = "Test",
            searchQuery = "rapport",
            filters = listOf("Tasks"),
            priority = "high",
            due = "this_week",
            tags = listOf("urgent"),
            projectUid = "p1",
        )

        val result = SavedViewFilter.evaluate(view, tasks, tags, today, now)
        assertTrue(result is ViewEvaluation.Local)
        assertEquals(listOf("1"), (result as ViewEvaluation.Local).tasks.map { it.uid })
    }

    @Test
    fun `evaluates explicit taskStatus and extras`() {
        val tasks = listOf(
            task("1", status = TaskStatus.DONE, note = "Détails", recurrenceType = "daily"),
            task("2", status = TaskStatus.DONE, note = null, recurrenceType = null),
            task("3", status = TaskStatus.NOT_STARTED, note = "Détails", recurrenceType = "daily"),
        )
        val view = SavedView(
            uid = "v2",
            name = "Terminées récurrentes",
            taskStatus = "done",
            extras = listOf("recurring", "has_content"),
        )

        val result = SavedViewFilter.evaluate(view, tasks, tags, today, now)
        assertEquals(listOf("1"), (result as ViewEvaluation.Local).tasks.map { it.uid })
    }

    @Test
    fun `returns NeedsOnlineOrWeb for non-task filters or unknown filter values`() {
        val noteView = SavedView(uid = "v3", name = "Notes", filters = listOf("Tasks", "Notes"))
        assertFalse(SavedViewFilter.canEvaluateLocally(noteView))
        assertEquals(ViewEvaluation.NeedsOnlineOrWeb, SavedViewFilter.evaluate(noteView, emptyList(), tags, today, now))

        val unknownExtra = SavedView(uid = "v4", name = "Inconnu", extras = listOf("custom_future_filter"))
        assertFalse(SavedViewFilter.canEvaluateLocally(unknownExtra))
    }
}

package ch.nicolab.cadence.tasks.review

import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Formes renvoyées par `backend/modules/review/service.js`, lues telles quelles : le classement vient du serveur. */
class ReviewJsonTest {
    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `summary counts`() {
        val summary = ReviewJson.summary(
            json(
                """{"counts":{"pushed":2,"undecided":3,"later":7,"review_due":1,"projects":1,"stale":4},
                "attention_total":11,"decided_this_week":5,"week_start":"2026-10-26"}""",
            ),
        )
        assertEquals(2, summary.counts.pushed)
        assertEquals(3, summary.counts.undecided)
        assertEquals(7, summary.counts.later)
        assertEquals(1, summary.counts.reviewDue)
        assertEquals(1, summary.counts.projects)
        assertEquals(4, summary.counts.stale)
        assertEquals(11, summary.attentionTotal)
        assertEquals(5, summary.decidedThisWeek)
        assertEquals(LocalDate.of(2026, 10, 26), summary.weekStart)
        assertEquals(7, summary.counts.of(ReviewStep.LATER))
        assertEquals(3, summary.counts.of(ReviewStep.UNDECIDED))
    }

    @Test
    fun `pushed items keep the server order and carry their push summary`() {
        val page = ReviewJson.tasks(
            json(
                """{"total":2,"items":[
                {"task":{"uid":"b","name":"Rappeler","original_name":"Rappeler","Project":{"name":"Maison"},"estimated_minutes":20,
                  "reviewed_at":null,"review_on":null},
                 "push":{"recent_count":5,"total_count":6,"last_postponed_on":"2026-10-30","last_planned_for":"2026-10-30","frequent":true}},
                {"task":{"uid":"a","name":"Écrire","Project":null},
                 "push":{"recent_count":3,"total_count":3,"last_postponed_on":"2026-10-20","last_planned_for":null,"frequent":true}}
                ]}""",
            ),
        )
        assertEquals(2, page.total)
        assertEquals(listOf("b", "a"), page.items.map { it.uid })
        val first = page.items.first()
        assertEquals("Rappeler", first.name)
        assertEquals("Maison", first.projectName)
        assertEquals(20, first.estimatedMinutes)
        assertEquals(5, first.push?.recentCount)
        assertEquals(6, first.push?.totalCount)
        assertEquals(LocalDate.of(2026, 10, 30), first.push?.lastPlannedFor)
        assertNull(page.items[1].projectName)
    }

    @Test
    fun `later items flag a due review and read the review stamp`() {
        val page = ReviewJson.tasks(
            json(
                """{"total":1,"items":[{"task":{"uid":"x","name":"Idée","review_on":"2026-10-30",
                "reviewed_at":"2026-10-01T10:00:00.000Z"},"review_due":true,"last_activity_at":"2026-09-01T00:00:00.000Z"}]}""",
            ),
        )
        val item = page.items.single()
        assertTrue(item.reviewDue)
        assertEquals(LocalDate.of(2026, 10, 30), item.reviewOn)
        assertEquals(Instant.parse("2026-10-01T10:00:00Z"), item.reviewedAt)
        assertEquals(Instant.parse("2026-09-01T00:00:00Z"), item.lastActivityAt)
        assertNull(item.push)
    }

    @Test
    fun `inbox and projects`() {
        val inbox = ReviewJson.inbox(json("""{"total":1,"items":[{"uid":"i1","title":null,"content":"Lire ce lien","created_at":"2026-10-02T08:00:00.000Z"}]}"""))
        assertEquals("Lire ce lien", inbox.items.single().text)
        val projects = ReviewJson.projects(
            json(
                """{"total":1,"items":[{"project":{"id":4,"uid":"p1","name":"Site","status":"in_progress"},
                "reasons":["no_next_action","quiet"],"open_tasks":0,"last_activity_at":"2026-09-10T00:00:00.000Z"}]}""",
            ),
        )
        val project = projects.items.single()
        assertEquals("p1", project.uid)
        assertEquals(listOf(ProjectReason.NO_NEXT_ACTION, ProjectReason.QUIET), project.reasons)
        assertEquals(0, project.openTasks)
    }

    @Test
    fun `week with capacity`() {
        val week = ReviewJson.week(
            json(
                """{"week_start":"2026-10-26","week_end":"2026-11-01",
                "committed":[{"uid":"c1","name":"Rapport","estimated_minutes":120},{"uid":"c2","name":"Courses","estimated_minutes":null}],
                "in_view":[{"uid":"v1","name":"Lire"}],"planned_minutes":120,"unestimated":1,"capacity_minutes":360}""",
            ),
        )
        assertEquals(listOf("c1", "c2"), week.committed.map { it.uid })
        assertEquals(listOf("v1"), week.inView.map { it.uid })
        assertEquals(120, week.plannedMinutes)
        assertEquals(1, week.unestimated)
        assertEquals(360, week.capacityMinutes)
        assertNull(ReviewJson.week(json("""{"committed":[],"in_view":[],"planned_minutes":0,"unestimated":0,"capacity_minutes":null}""")).capacityMinutes)
    }

    @Test
    fun `history lists what the user moved, newest first, without automatic changes`() {
        val history = ReviewJson.postponements(
            json(
                """{"recent_count":2,"total_count":3,"last_postponed_on":"2026-10-30","last_planned_for":"2026-10-30","frequent":false,
                "missed_plan_days":1,
                "changes":[
                  {"kind":"postponed","from":"2026-10-29","to":"2026-10-31","at":"2026-10-30","source":"web"},
                  {"kind":"automatic","from":"2026-10-20","to":"2026-10-21","at":"2026-10-20","source":"import"},
                  {"kind":"time_shift","from":"2026-10-15","to":"2026-10-15","at":"2026-10-15","source":"web"},
                  {"kind":"unscheduled","from":"2026-10-10","to":null,"at":"2026-10-10","source":"web"}
                ],
                "missed_days":["2026-10-25"]}""",
            ),
        )
        assertEquals(3, history.totalCount)
        assertEquals(2, history.recentCount)
        assertEquals(LocalDate.of(2026, 10, 30), history.lastPostponedOn)
        val entries = PostponementEntries.of(history)
        assertEquals(
            listOf(
                PostponementKind.POSTPONED to LocalDate.of(2026, 10, 30),
                PostponementKind.MISSED to LocalDate.of(2026, 10, 25),
                PostponementKind.UNSCHEDULED to LocalDate.of(2026, 10, 10),
            ),
            entries.map { it.kind to it.at },
        )
        assertEquals(LocalDate.of(2026, 10, 29), entries.first().from)
        assertEquals(LocalDate.of(2026, 10, 31), entries.first().to)
        assertTrue(history.shown)
        assertFalse(ReviewJson.postponements(json("""{"recent_count":0,"total_count":0,"changes":[],"missed_days":[]}""")).shown)
    }
}

package ch.nicolab.cadence.tasks.model

import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class LinkThemesTest {
    private fun link(uid: String, vararg tags: String) = LinkItem(uid = uid, url = "https://example.com/$uid", tagUids = tags.toList())

    @Test
    fun aThemeIsTheFirstSegmentOfTheFirstTagWithBareLinksLast() {
        val names = mapOf("t1" to "dev/outils", "t2" to "lecture", "t3" to "dev")
        val themes = LinkLists.byTheme(listOf(link("a"), link("b", "t2"), link("c", "t1"), link("d", "t3", "t2")), names)

        assertEquals(listOf("dev", "lecture", null), themes.map { it.name })
        assertEquals(listOf("c", "d"), themes[0].links.map { it.uid })
        assertEquals(listOf("a"), themes[2].links.map { it.uid })
    }

    @Test
    fun aLinkBecomesATaskThatKeepsItsAddress() {
        val found = link("a")
        val steps = LinkTriage.steps(LinkDecision.TASK, null, found, LocalDate.of(2026, 11, 6), null, "")

        val task = steps[0] as TriageStep.CreateTask
        assertEquals(found.displayTitle, task.draft.name)
        assertEquals(found.url, task.draft.note)
        assertEquals(TriageStep.SetStatus("a", LinkStatus.KEPT), steps[1])
    }
}

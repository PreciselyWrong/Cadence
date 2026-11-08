package ch.nicolab.cadence.tasks.autoclassify

import ch.nicolab.cadence.domain.QuietHours
import ch.nicolab.cadence.domain.QuietPolicy
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ClassifyNotifyPlanTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val night = QuietPolicy(QuietHours(true, LocalTime.of(22, 0), LocalTime.of(7, 0)), zone)
    private val none = QuietPolicy.NONE

    private fun at(hour: Int) = ZonedDateTime.of(LocalDateTime.of(2026, 11, 7, hour, 30), zone).toInstant()

    private val pending = listOf(
        PendingSuggestion("s1", "classify", "task", "t1", null),
        PendingSuggestion("s2", "duplicate", "link", "l2", null),
    )

    @Test
    fun onlyTheSuggestionsNotNotifiedYetAreDue() {
        val due = ClassifyNotifyPlan.due(pending, notified = setOf("s1"), notify = true, now = at(12), quiet = none)

        assertEquals(listOf("s2"), due.map { it.uid })
    }

    @Test
    fun nothingIsDueWhenTheUserTurnedNotificationsOff() {
        assertTrue(ClassifyNotifyPlan.due(pending, emptySet(), notify = false, now = at(12), quiet = none).isEmpty())
    }

    @Test
    fun nothingIsDueDuringQuietHoursAndTheNextPassTakesThemAfterwards() {
        assertTrue(ClassifyNotifyPlan.due(pending, emptySet(), notify = true, now = at(23), quiet = night).isEmpty())
        assertEquals(2, ClassifyNotifyPlan.due(pending, emptySet(), notify = true, now = at(8), quiet = night).size)
    }

    @Test
    fun theMemoryForgetsWhatIsNoLongerPending() {
        val remembered = ClassifyNotifyPlan.remembered(pendingUids = setOf("s1"), notified = setOf("s1", "s0", "s9"))

        assertEquals(setOf("s1"), remembered)
    }

    @Test
    fun aNotificationWhoseSuggestionIsNoLongerPendingIsCancelled() {
        val stale = ClassifyNotifyPlan.stale(shown = setOf("s1", "s0", "s9"), pendingUids = setOf("s1"))

        assertEquals(setOf("s0", "s9"), stale)
    }

    @Test
    fun nothingIsCancelledWhileEveryShownSuggestionIsPending() {
        assertTrue(ClassifyNotifyPlan.stale(shown = setOf("s1"), pendingUids = setOf("s1", "s2")).isEmpty())
    }

    private fun card(
        project: ProjectOffer? = null,
        tags: List<String> = emptyList(),
        priority: Int? = null,
    ) = ClassifyCard(
        suggestionUid = "s1",
        entity = "task",
        itemUid = "t1",
        title = "Acheter du pain",
        project = project,
        tags = if (tags.isEmpty()) null else TagOffer(tags, newTag = null),
        priority = priority,
    )

    private fun summary(card: ClassifyCard) = AcceptAllText.summary(
        card,
        projectLabel = { "Projet : $it" },
        priorityLabel = { if (it == 2) "Priorité haute" else "Priorité moyenne" },
    )

    @Test
    fun theNotificationNamesWhatAcceptAllWillApply() {
        val offer = ProjectOffer(
            options = listOf(ProjectOption("p1", "Maison", "Foyer"), ProjectOption("p2", "Bureau", null)),
            area = null,
            newProject = null,
        )

        assertEquals(
            "Projet : Maison · #achats #extérieur · Priorité haute",
            summary(card(project = offer, tags = listOf("achats", "extérieur"), priority = 2)),
        )
    }

    @Test
    fun withoutProjectOptionTheAreaNameStandsForTheProject() {
        val offer = ProjectOffer(options = emptyList(), area = AreaOffer("a1", "Maison"), newProject = null)

        assertEquals("Projet : Maison", summary(card(project = offer)))
    }

    @Test
    fun aNewProjectOrANewTagIsNeverNamedAsApplied() {
        val offer = ProjectOffer(options = emptyList(), area = null, newProject = NewProjectOffer("Neuf", "a1", "Maison"))

        assertEquals(null, summary(card(project = offer)))
    }

    @Test
    fun onlyTheTagsAndPriorityThatArePresentAreNamed() {
        assertEquals("#achats · Priorité moyenne", summary(card(tags = listOf("achats"), priority = 1)))
    }
}

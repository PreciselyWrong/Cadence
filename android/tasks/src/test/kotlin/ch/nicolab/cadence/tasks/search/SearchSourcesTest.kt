package ch.nicolab.cadence.tasks.search

import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SearchSourcesTest {
    @Test
    fun `a task is also found through its note, project and tags`() {
        val task = TaskItem(uid = "t", name = "Appeler", note = "devis", projectUid = "p", tagUids = listOf("g"))
        val entries = SearchSources.tasks(listOf(task), mapOf("p" to "Maison"), mapOf("g" to "urgent"))
        for (query in listOf("devis", "maison", "urgent", "appeler")) {
            assertEquals(1, SearchEngine.search(entries, query, SearchFilter.TASKS).size, query)
        }
        assertEquals(0, SearchEngine.search(entries, "autre", SearchFilter.ALL).size)
    }

    @Test
    fun `a goal or a wish is found by its title and its why`() {
        val goals = listOf(GoalItem("g", "Courir un marathon", why = "santé"), GoalItem("w", "Voir le Japon", bucket = GoalBucket.DO))
        val entries = SearchSources.goals(goals)
        assertEquals(listOf(SearchKind.GOAL, SearchKind.GOAL), entries.map { it.kind })
        assertEquals("g", SearchEngine.search(entries, "santé", SearchFilter.GOALS).single().entry.id)
        assertEquals("w", SearchEngine.search(entries, "japon", SearchFilter.ALL).single().entry.id)
    }
}

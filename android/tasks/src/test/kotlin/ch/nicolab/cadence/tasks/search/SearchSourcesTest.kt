package ch.nicolab.cadence.tasks.search

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
}

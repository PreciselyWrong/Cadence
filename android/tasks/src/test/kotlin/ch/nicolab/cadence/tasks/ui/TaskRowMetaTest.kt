package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.tasks.model.TagItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class TaskRowMetaTest {
    private val tags = listOf(
        TagItem(uid = "a", name = "perso/sport"),
        TagItem(uid = "b", name = "maison"),
        TagItem(uid = "c", name = "urgent"),
        TagItem(uid = "d", name = "someday"),
    )

    @Test
    fun `tags keep task order, last segment, two at most`() {
        val result = TaskRowMeta.tags(listOf("a", "b"), tags)
        assertEquals(listOf("sport", "maison"), result.shown.map { it.label })
        assertEquals(0, result.more)
    }

    @Test
    fun `extra tags become a count`() {
        val result = TaskRowMeta.tags(listOf("a", "b", "c"), tags)
        assertEquals(listOf("a", "b"), result.shown.map { it.uid })
        assertEquals(1, result.more)
    }

    @Test
    fun `someday and unknown tags are hidden and not counted`() {
        val result = TaskRowMeta.tags(listOf("d", "x", "c"), tags)
        assertEquals(listOf("urgent"), result.shown.map { it.label })
        assertEquals(0, result.more)
    }

    @Test
    fun `project wins, area is the fallback without project`() {
        assertEquals(RowOrigin.Project("Maison"), TaskRowMeta.origin("p", "Maison", "Perso"))
        assertEquals(RowOrigin.Area("Perso"), TaskRowMeta.origin(null, null, "Perso"))
        assertEquals(RowOrigin.None, TaskRowMeta.origin(null, null, null))
    }

    @Test
    fun `nothing is shown on the project's own page`() {
        assertEquals(RowOrigin.None, TaskRowMeta.origin("p", null, "Perso"))
    }

    @Test
    fun `note preview strips markdown to two lines`() {
        val note = "# Courses\n- [x] **lait**\n- [ ] [pain](https://x.test)\n\nfin"
        assertEquals("Courses\n☑ lait", TaskRowMeta.notePreview(note))
    }

    @Test
    fun `empty notes show nothing`() {
        assertNull(TaskRowMeta.notePreview(null))
        assertNull(TaskRowMeta.notePreview("  \n "))
        assertNull(TaskRowMeta.notePreview("---"))
    }
}

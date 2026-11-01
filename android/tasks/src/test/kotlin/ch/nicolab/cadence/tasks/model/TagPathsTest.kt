package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TagPathsTest {
    private fun tag(name: String) = TagItem(uid = name, name = name)

    private val tags = listOf("perso", "perso/sport", "perso/sport/course", "perso/lecture", "perso2", "travail").map(::tag)

    @Test
    fun `leaf is the last segment of the path`() {
        assertEquals("course", TagPaths.leaf("perso/sport/course"))
        assertEquals("travail", TagPaths.leaf("travail"))
    }

    @Test
    fun `a namespace contains itself and its descendants but not a name sharing its letters`() {
        assertTrue(TagPaths.isSameOrDescendant("perso", "perso"))
        assertTrue(TagPaths.isSameOrDescendant("perso/sport/course", "perso"))
        assertFalse(TagPaths.isSameOrDescendant("perso2", "perso"))
        assertFalse(TagPaths.isSameOrDescendant("perso", "perso/sport"))
    }

    @Test
    fun `filtering by a parent includes every sub-tag at any depth`() {
        assertEquals(
            setOf("perso", "perso/sport", "perso/sport/course", "perso/lecture"),
            TagPaths.withDescendants(tags, setOf("perso")),
        )
        assertEquals(setOf("perso/sport", "perso/sport/course"), TagPaths.withDescendants(tags, setOf("perso/sport")))
        assertEquals(setOf("travail"), TagPaths.withDescendants(tags, setOf("travail")))
        assertEquals(emptySet<String>(), TagPaths.withDescendants(tags, emptySet()))
    }

    @Test
    fun `a selected uid unknown to the list is kept as is`() {
        assertEquals(setOf("ghost"), TagPaths.withDescendants(tags, setOf("ghost")))
    }

    @Test
    fun `rows nest by depth with short names under their parent`() {
        val rows = TagPaths.rows(tags)
        assertEquals(
            listOf("perso", "lecture", "sport", "course", "perso2", "travail"),
            rows.map { it.label },
        )
        assertEquals(listOf(0, 1, 1, 2, 0, 0), rows.map { it.depth })
        assertEquals(listOf(true, false, true, false, false, false), rows.map { it.hasChildren })
    }

    @Test
    fun `a collapsed tag hides its whole subtree`() {
        val rows = TagPaths.rows(tags, collapsed = setOf("perso/sport"))
        assertEquals(listOf("perso", "lecture", "sport", "perso2", "travail"), rows.map { it.label })
        assertEquals(listOf("perso", "perso2", "travail"), TagPaths.rows(tags, setOf("perso")).map { it.label })
    }

    @Test
    fun `a tag whose parent is missing hangs on its nearest listed ancestor or the root`() {
        val sparse = listOf("a", "a/b/c", "x/y").map(::tag)
        val rows = TagPaths.rows(sparse)
        assertEquals(listOf("a", "b/c", "x/y"), rows.map { it.label })
        assertEquals(listOf(0, 1, 0), rows.map { it.depth })
    }
}

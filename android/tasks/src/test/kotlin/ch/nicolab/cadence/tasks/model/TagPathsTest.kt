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

    private fun plan(uid: String, name: String, list: List<TagItem> = tags) = TagPaths.plan(list, uid, name)

    private fun problem(plan: TagEditPlan) = (plan as TagEditPlan.Rejected).problem

    @Test
    fun `a rename carries the whole subtree to the new prefix and points each tag at its new parent`() {
        val result = plan("perso/sport", "perso/fitness") as TagEditPlan.Apply
        assertEquals(TagRename("perso/sport", "perso/fitness", "perso"), result.root)
        assertEquals(listOf(TagRename("perso/sport/course", "perso/fitness/course", "perso/sport")), result.cascaded)
    }

    @Test
    fun `a tag moved to the root or under another namespace changes its path`() {
        val toRoot = plan("perso/sport", "sport") as TagEditPlan.Apply
        assertEquals(TagRename("perso/sport", "sport", null), toRoot.root)
        assertEquals("sport/course", toRoot.cascaded.single().name)
        val under = plan("perso/sport", "travail/sport") as TagEditPlan.Apply
        assertEquals(TagRename("perso/sport", "travail/sport", "travail"), under.root)
    }

    @Test
    fun `a name is trimmed per segment like the server`() {
        val result = plan("travail", " pro / bureau ") as TagEditPlan.Apply
        assertEquals("pro/bureau", result.root.name)
    }

    @Test
    fun `invalid names are refused`() {
        listOf("", "  ", "a//b", "/a", "a/", "a#b", "a?b", "x".repeat(51), List(30) { "abcdef" }.joinToString("/")).forEach {
            assertEquals(TagEditProblem.INVALID, problem(plan("travail", it)), it)
        }
    }

    @Test
    fun `a tag cannot take a name already used, even from outside its subtree`() {
        assertEquals(TagEditProblem.CLASH, problem(plan("travail", "perso")))
        assertEquals(TagEditProblem.CLASH, problem(plan("perso/lecture", "perso/sport")))
    }

    @Test
    fun `a subtree landing on an existing descendant name clashes`() {
        val withClash = tags + tag("vie/course")
        assertEquals(TagEditProblem.CLASH, problem(plan("perso/sport", "vie", withClash)))
    }

    @Test
    fun `a tag cannot go under itself or its children and an unchanged name is not a change`() {
        assertEquals(TagEditProblem.INTO_SELF, problem(plan("perso", "perso/sport/perso")))
        assertEquals(TagEditProblem.UNCHANGED, problem(plan("perso", "perso")))
        assertEquals(TagEditProblem.UNKNOWN, problem(plan("ghost", "x")))
    }

    @Test
    fun `the someday system tag keeps its name`() {
        assertEquals(TagEditProblem.RESERVED, problem(plan("someday", "plus-tard", tags + tag("someday"))))
    }

    @Test
    fun `parent candidates leave out the tag, its sub-tags and the system tag`() {
        val withSomeday = tags + tag("someday")
        assertEquals(listOf("perso", "perso/lecture", "perso2", "travail"), TagPaths.parentCandidates(withSomeday, "perso/sport").map { it.name })
        assertEquals(listOf("perso2", "travail"), TagPaths.parentCandidates(withSomeday, "perso").map { it.name })
    }

    @Test
    fun `a move target keeps the last segment under the chosen parent`() {
        assertEquals("travail/course", TagPaths.moveTarget(tags, "perso/sport/course", "travail"))
        assertEquals("course", TagPaths.moveTarget(tags, "perso/sport/course", null))
        assertEquals(null, TagPaths.moveTarget(tags, "perso/sport/course", "ghost"))
        assertEquals("perso/vie", TagPaths.renamedLeaf("perso/sport", "vie"))
        assertEquals("vie", TagPaths.renamedLeaf("travail", "vie"))
        assertEquals("perso/sport", TagPaths.parentPath("perso/sport/course"))
        assertEquals(null, TagPaths.parentPath("perso"))
    }
}

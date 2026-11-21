package ch.nicolab.cadence.tasks.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectBoardTest {
    private fun task(uid: String, sectionUid: String? = null, position: Int? = null) = TaskItem(
        uid = uid,
        name = uid,
        projectUid = "p1",
        sectionUid = sectionUid,
        sectionPosition = position,
    )

    private fun section(uid: String, name: String, position: Int) = ProjectSectionItem(
        uid = uid,
        projectUid = "p1",
        name = name,
        position = position,
    )

    @Test
    fun buildColumnsPlacesUnsectionedFirstAndSortsSectionsAndCards() {
        val sections = listOf(
            section("s2", "Fait", 1),
            section("s1", "En cours", 0),
        )
        val tasks = listOf(
            task("t-unpos-1"),
            task("t-orphan", sectionUid = "deleted-sec", position = 0),
            task("t-s1-b", sectionUid = "s1", position = 2),
            task("t-s1-null", sectionUid = "s1", position = null),
            task("t-s1-a", sectionUid = "s1", position = 0),
            task("t-s2", sectionUid = "s2", position = 0),
        )

        val cols = ProjectBoard.buildColumns(sections, tasks)
        assertEquals(listOf(null, "s1", "s2"), cols.map { it.uid })
        assertEquals(listOf("t-orphan", "t-unpos-1"), cols[0].tasks.map { it.uid })
        assertEquals(listOf("t-s1-a", "t-s1-b", "t-s1-null"), cols[1].tasks.map { it.uid })
        assertEquals(listOf("t-s2"), cols[2].tasks.map { it.uid })
    }

    @Test
    fun movePlacementsInsertsBeforeTargetAndRecomputesPositions() {
        val cols = ProjectBoard.buildColumns(
            sections = listOf(section("s1", "À faire", 0), section("s2", "En cours", 1)),
            tasks = listOf(
                task("a", "s1", 0),
                task("b", "s2", 0),
                task("c", "s2", 1),
            ),
        )

        val moves = ProjectBoard.movePlacements(cols, taskUid = "a", targetSectionUid = "s2", beforeTaskUid = "c")
        assertEquals(
            listOf(
                BoardTaskPlacement("a", "s2", 1),
                BoardTaskPlacement("c", "s2", 2),
            ),
            moves,
        )
    }

    @Test
    fun movePlacementsToEndOfUnsectionedAndNoOpWhenUnchanged() {
        val cols = ProjectBoard.buildColumns(
            sections = listOf(section("s1", "À faire", 0)),
            tasks = listOf(
                task("a", null, 0),
                task("b", "s1", 0),
            ),
        )

        val noOp = ProjectBoard.movePlacements(cols, taskUid = "b", targetSectionUid = "s1", beforeTaskUid = null)
        assertTrue(noOp.isEmpty())

        val toUnsectioned = ProjectBoard.movePlacements(cols, taskUid = "b", targetSectionUid = null, beforeTaskUid = null)
        assertEquals(listOf(BoardTaskPlacement("b", null, 1)), toUnsectioned)
    }
}

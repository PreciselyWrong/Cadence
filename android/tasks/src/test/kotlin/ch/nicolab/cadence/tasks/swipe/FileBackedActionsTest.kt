package ch.nicolab.cadence.tasks.swipe

import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.SOURCE_TODO_MD
import ch.nicolab.cadence.tasks.model.TaskItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FileBackedActionsTest {
    private val ordinary = TaskItem(uid = "a", name = "Ordinaire")
    private val fromFile = TaskItem(uid = "b", name = "Du fichier", fileBacked = true)

    @Test
    fun `un projet est de fichier seulement avec la source todo_md`() {
        assertTrue(ProjectItem(uid = "p", name = "Alpha", sourceType = SOURCE_TODO_MD).isFileBacked)
        assertFalse(ProjectItem(uid = "p", name = "Alpha", sourceType = null).isFileBacked)
        assertFalse(ProjectItem(uid = "p", name = "Alpha", sourceType = "autre").isFileBacked)
    }

    @Test
    fun `une tâche ordinaire garde toutes les actions`() {
        SwipeAction.entries.forEach { assertTrue(FileBackedActions.allowsSwipe(ordinary, it)) }
        assertTrue(FileBackedActions.canEdit(ordinary))
        assertSame(SwipeConfig.Default, FileBackedActions.swipeConfig(ordinary, SwipeConfig.Default))
    }

    @Test
    fun `une tâche de fichier n'accepte que terminer`() {
        assertTrue(FileBackedActions.allowsSwipe(fromFile, SwipeAction.COMPLETE))
        assertTrue(FileBackedActions.allowsSwipe(fromFile, SwipeAction.NONE))
        SwipeAction.entries.filter { it != SwipeAction.COMPLETE && it != SwipeAction.NONE }
            .forEach { assertFalse(FileBackedActions.allowsSwipe(fromFile, it), it.name) }
        assertFalse(FileBackedActions.canEdit(fromFile))
    }

    @Test
    fun `le balayage d'une tâche de fichier ne garde que terminer`() {
        val config = FileBackedActions.swipeConfig(fromFile, SwipeConfig.Default)
        assertEquals(SwipeAction.COMPLETE, config.actionFor(SwipeSide.RIGHT, SwipeStage.SHORT))
        assertEquals(SwipeAction.NONE, config.actionFor(SwipeSide.RIGHT, SwipeStage.LONG))
        assertFalse(config.isEnabled(SwipeSide.LEFT))
        assertEquals(listOf(SwipeAction.COMPLETE), config.distinctActions())
    }
}

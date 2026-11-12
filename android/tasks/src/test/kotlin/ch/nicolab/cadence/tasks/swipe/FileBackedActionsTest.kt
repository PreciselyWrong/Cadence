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
    fun `une tâche ordinaire garde toutes les actions et tous ses champs`() {
        SwipeAction.entries.forEach { assertTrue(FileBackedActions.allowsSwipe(ordinary, it)) }
        FileOwnedField.entries.forEach { assertFalse(FileBackedActions.ownsField(ordinary, it), it.name) }
        assertSame(SwipeConfig.Default, FileBackedActions.swipeConfig(ordinary, SwipeConfig.Default))
    }

    @Test
    fun `une tâche de fichier garde à son fichier titre, note, projet et suppression`() {
        FileOwnedField.entries.forEach { assertTrue(FileBackedActions.ownsField(fromFile, it), it.name) }
    }

    @Test
    fun `une tâche de fichier accepte tous les gestes sauf projet et suppression`() {
        val refused = setOf(SwipeAction.MOVE_PROJECT, SwipeAction.DELETE)
        SwipeAction.entries.forEach {
            assertEquals(it !in refused, FileBackedActions.allowsSwipe(fromFile, it), it.name)
        }
    }

    @Test
    fun `le balayage d'une tâche de fichier perd seulement projet et suppression`() {
        val config = FileBackedActions.swipeConfig(fromFile, SwipeConfig.Default)
        assertEquals(SwipeAction.COMPLETE, config.actionFor(SwipeSide.RIGHT, SwipeStage.SHORT))
        assertEquals(SwipeAction.NONE, config.actionFor(SwipeSide.RIGHT, SwipeStage.LONG))
        assertEquals(SwipeAction.SCHEDULE, config.actionFor(SwipeSide.LEFT, SwipeStage.SHORT))
        assertEquals(SwipeAction.NONE, config.actionFor(SwipeSide.LEFT, SwipeStage.LONG))
    }
}

package ch.nicolab.cadence.tasks.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.test.core.app.ApplicationProvider
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.notes.ContentTargets
import ch.nicolab.cadence.tasks.notes.NoteOutline
import ch.nicolab.cadence.tasks.notes.OutlineFoldStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w360dp-h800dp")
class OutlineEditorStateTest {
    @get:Rule
    val compose = createComposeRule()

    private val store get() = OutlineFoldStore(ApplicationProvider.getApplicationContext())

    private fun state(text: String, scope: String = "note:test", saved: MutableList<String> = mutableListOf()) =
        OutlineEditorState(text, scope, store) { saved += it }

    private fun OutlineEditorState.type(next: String, caret: Int) = onFieldChange(TextFieldValue(next, TextRange(caret)))

    @Test
    fun enterSplitsTheBulletAndSavesTheText() {
        val saved = mutableListOf<String>()
        val s = state("- hello world", saved = saved)
        s.onFieldChange(TextFieldValue("- hello world", TextRange(8)))
        s.type("- hello \nworld", 9)
        assertEquals("- hello\n- world", s.doc)
        assertEquals(10, s.fieldValue.selection.start)
        assertEquals("- hello\n- world", saved.last())
    }

    @Test
    fun foldsSurviveAnotherEditorOfTheSameNote() {
        val s = state("- a\n  - a1\n- b", scope = "note:folds")
        s.onFieldChange(TextFieldValue(s.doc, TextRange(1)))
        s.toggleFold()
        assertEquals(true, s.caretFolded)
        assertEquals(listOf("a#0"), store.load("note:folds"))
        val again = state("- a\n  - a1\n- b", scope = "note:folds")
        assertEquals(setOf(0), again.fieldFolds)
    }

    @Test
    fun indentKeepsAFoldedItemFolded() {
        val s = state("- x\n- a\n  - a1", scope = "note:indent")
        s.onFieldChange(TextFieldValue(s.doc, TextRange(5)))
        s.toggleFold()
        s.command { sel, _ -> NoteOutline.indentItems(sel) }
        assertEquals("- x\n  - a\n    - a1", s.doc)
        assertEquals(setOf(1), s.fieldFolds)
    }

    @Test
    fun zoomedEditsGoBackIntoTheFullText() {
        val s = state("- p\n  - root\n    - c\n- q", scope = "note:zoom")
        s.zoomTo(1)
        assertEquals("- root\n  - c", s.fieldValue.text)
        assertEquals(listOf(0 to "p"), s.crumbs)
        s.type("- root\n  - cd", 13)
        assertEquals("- p\n  - root\n    - cd\n- q", s.doc)
        s.zoomTo(null)
        assertNull(s.zoom)
        assertEquals(s.doc, s.fieldValue.text)
    }

    @Test
    fun aBulletBecomesALinkedTask() {
        val s = state("- [ ] Call Bob")
        s.onFieldChange(TextFieldValue(s.doc, TextRange(8)))
        assertEquals("Call Bob", s.makeTask())
        assertEquals("- [ ] [[task:Call Bob]]", s.doc)
    }

    @Test
    fun readingFoldsZoomsAndFollowsLinkedTasks() {
        val toggled = mutableListOf<String>()
        val done = TaskItem("t1", "Call Bob", status = TaskStatus.DONE)
        compose.setContent {
            CadenceTheme {
                MarkdownView(
                    content = "- Trip\n  - Pack\n- [ ] [[task:Call Bob]]\n- [[Missing note]]",
                    onToggleCheckbox = { toggled += "line $it" },
                    outlineScope = "note:read",
                    targets = ContentTargets(listOf(NoteItem("n", "Other", "")), listOf(done)),
                    onToggleTask = { toggled += it.uid },
                )
            }
        }
        compose.onNodeWithText("Pack").assertExists()
        compose.onNodeWithContentDescription("Replier").performClick()
        compose.onAllNodesWithText("Pack").assertCountEquals(0)
        compose.onNodeWithText("+ Missing note").assertExists()
        compose.onNodeWithContentDescription("Call Bob").performClick()
        assertEquals(listOf("t1"), toggled)
        compose.onNodeWithContentDescription("Déplier").performClick()
        compose.onNodeWithText("Pack").assertExists()
    }
}

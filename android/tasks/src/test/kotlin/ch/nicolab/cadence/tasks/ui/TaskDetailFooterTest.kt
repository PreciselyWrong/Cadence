package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Bas de la fiche comme sur le web (`docs/fork/WEB-UX-NOTES.md` 2026-11-26) : une seule barre discrète. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w360dp-h800dp")
class TaskDetailFooterTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun attachCommentAndHistorySitOnOneLine() {
        var commented = 0
        var history = 0
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                TaskDetailFooter(
                    canAttach = true,
                    historyOpen = false,
                    onAttach = {},
                    onComment = { commented++ },
                    onHistory = { history++ },
                )
            }
        }

        val attach = compose.onNodeWithText("Joindre").getUnclippedBoundsInRoot()
        val comment = compose.onNodeWithText("Commenter").getUnclippedBoundsInRoot()
        val log = compose.onNodeWithText("Historique").getUnclippedBoundsInRoot()
        assertTrue("même ligne : $attach / $comment / $log", comment.top < attach.bottom && log.top < attach.bottom)
        assertTrue("dans l'ordre : $attach / $comment / $log", attach.right <= comment.left && comment.right <= log.left)

        compose.onNodeWithText("Commenter").performClick()
        compose.onNodeWithText("Historique").performClick()
        assertEquals(1, commented)
        assertEquals(1, history)
    }

    @Test
    fun attachIsLeftOutWhenTheServerRefusesAttachments() {
        compose.setContent {
            TaskDetailFooter(canAttach = false, historyOpen = false, onAttach = {}, onComment = {}, onHistory = {})
        }
        compose.onNodeWithText("Commenter").assertIsDisplayed()
        compose.onNodeWithText("Joindre").assertDoesNotExist()
    }

    @Test
    fun breakDownSitsOnTheSubtaskAddLine() {
        var asked = 0
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                SubtaskAddRow(draft = "", onDraftChange = {}, onSubmit = {}, onBreakDown = { asked++ })
            }
        }
        val field = compose.onNodeWithText("Ajouter une sous-tâche").getUnclippedBoundsInRoot()
        val breakDown = compose.onNodeWithText("Découper en étapes").getUnclippedBoundsInRoot()
        assertTrue("même ligne : $field / $breakDown", breakDown.top < field.bottom && field.top < breakDown.bottom)

        compose.onNodeWithText("Découper en étapes").performClick()
        assertEquals(1, asked)
    }

    @Test
    fun noBreakDownLinkWhenTheTaskCannotBeSplit() {
        compose.setContent {
            SubtaskAddRow(draft = "", onDraftChange = {}, onSubmit = {}, onBreakDown = null)
        }
        compose.onNodeWithText("Découper en étapes").assertDoesNotExist()
    }
}

package ch.nicolab.cadence.tasks.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.input.TextFieldValue
import ch.nicolab.cadence.tasks.quickadd.ParsedQuickAdd
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Saisie en série : le champ garde le focus pendant l'écriture d'une tâche, sinon Android ferme
 * le clavier après chaque « Ajouter » et il faut retoucher le champ pour la suivante.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class CaptureBoxFocusTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theFieldKeepsFocusWhileATaskIsSaved() {
        var saving by mutableStateOf(false)
        val focus = FocusRequester()
        compose.setContent {
            CaptureBox(
                value = remember { TextFieldValue("Acheter du pain") },
                onValueChange = {},
                parsed = ParsedQuickAdd("Acheter du pain", null, null, null, null, emptyList(), tokens = emptyList()),
                chips = emptyList(),
                saving = saving,
                focus = focus,
                onDone = {},
                onEscape = { false },
                placeholder = "",
            )
        }
        compose.runOnIdle { focus.requestFocus() }
        compose.onNodeWithText("Acheter du pain").assertIsFocused()

        saving = true
        compose.onNodeWithText("Acheter du pain").assertIsFocused()
        saving = false
        compose.onNodeWithText("Acheter du pain").assertIsFocused()
    }
}

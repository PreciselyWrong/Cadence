package ch.nicolab.cadence.tasks.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LinkedEditableFieldTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun linkedTextCanStillBeEdited() {
        var value = "Voir https://example.com"
        compose.setContent {
            CadenceTheme {
                LinkedEditableField(value, { value = it }, MaterialTheme.typography.bodyLarge)
            }
        }

        compose.onNodeWithText(value).assertExists()
        compose.onNodeWithContentDescription("Modifier").performClick()
        compose.onNodeWithText(value).performTextReplacement("Voir https://example.org")
        assertEquals("Voir https://example.org", value)
    }
}

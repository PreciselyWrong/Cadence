package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w360dp-h800dp")
class ProjectPageHeaderTest {
    @get:Rule
    val compose = createComposeRule()

    /** Les actions ne prennent rien à la largeur du titre, sinon un nom se coupe en plein mot. */
    @Test
    fun titleKeepsTheFullWidthBelowTheActions() {
        val name = "ChouetteCuisine v2"
        compose.setContent {
            Box(Modifier.width(360.dp)) {
                ProjectPageHeader(
                    name = name,
                    icon = null,
                    iconColor = Color.Red,
                    onBack = {},
                    breadcrumb = {},
                ) {
                    Box(Modifier.size(width = 180.dp, height = 48.dp).testTag("actions"))
                }
            }
        }

        val title = compose.onNodeWithText(name).getUnclippedBoundsInRoot()
        val actions = compose.onNodeWithTag("actions").getUnclippedBoundsInRoot()
        assertTrue("titre sous les actions : $title / $actions", title.top >= actions.bottom)
        assertTrue("titre sur toute la largeur : $title", title.right - title.left >= 300.dp)
    }
}

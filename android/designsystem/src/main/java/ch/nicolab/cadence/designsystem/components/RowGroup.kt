package ch.nicolab.cadence.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space

/**
 * Forme d'une ligne dans un groupe connecté : les coins extérieurs du groupe sont arrondis,
 * les jonctions internes restent presque droites.
 */
fun rowGroupShape(index: Int, count: Int): Shape {
    val top = if (index == 0) Radius.card else Radius.inner
    val bottom = if (index == count - 1) Radius.card else Radius.inner
    return RoundedCornerShape(topStart = top, topEnd = top, bottomStart = bottom, bottomEnd = bottom)
}

/** Groupe de lignes serrées, séparées par un très court écart. */
@Composable
fun RowGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Column(
    modifier,
    verticalArrangement = Arrangement.spacedBy(Space.groupGap),
    content = content,
)

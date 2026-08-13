package ch.nicolab.cadence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.ui.theme.Radius
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

/**
 * Coquille unique de tous les modals : poignée, contexte, titre, contenu.
 * Une action simple passe par ce modal plutôt que par un écran complet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CadenceSheet(
    title: String,
    subtitle: String?,
    dismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    leading: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = cadence
    ModalBottomSheet(
        onDismissRequest = dismiss,
        sheetState = sheetState,
        shape = Radius.Sheet,
        containerColor = palette.surface,
        contentColor = palette.ink,
        scrimColor = palette.structural.copy(alpha = 0.55f),
        dragHandle = {
            Box(Modifier.fillMaxWidth().padding(top = Space.md, bottom = Space.xs), contentAlignment = Alignment.Center) {
                Box(Modifier.width(36.dp).height(4.dp).background(palette.hairline, CircleShape))
            }
        },
        modifier = modifier,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Space.xl)) {
            Row(Modifier.fillMaxWidth().padding(top = Space.sm, bottom = Space.lg), verticalAlignment = Alignment.CenterVertically) {
                leading?.let { it(); Spacer(Modifier.width(Space.md)) }
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.headlineSmall, color = palette.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    subtitle?.let {
                        Spacer(Modifier.height(2.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = palette.inkMuted)
                    }
                }
            }
            content()
            Spacer(Modifier.height(Space.xl))
        }
    }
}

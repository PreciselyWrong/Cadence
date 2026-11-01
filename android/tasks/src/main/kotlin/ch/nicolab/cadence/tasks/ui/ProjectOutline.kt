package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatIndentDecrease
import androidx.compose.material.icons.automirrored.outlined.FormatIndentIncrease
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.Outline
import ch.nicolab.cadence.tasks.model.OutlineNode
import ch.nicolab.cadence.tasks.model.OutlineRow
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority

/** Ce que l'outliner fait d'une ligne ; chaque action écrit par la file d'envoi, hors ligne compris. */
internal class OutlineActions(
    val tree: List<OutlineNode>,
    val editable: Boolean,
    val apply: (List<OutlineNode>) -> Unit,
    val addAfter: (uid: String, name: String) -> Unit,
    val toggle: (TaskItem) -> Unit,
    val open: (TaskItem) -> Unit,
)

/**
 * Lignes de l'outliner d'un projet : tâches et sous-tâches en liste décalée. Toucher une ligne la choisit et
 * montre ses actions (Monter, Descendre, Décaler, Ressortir, Ajouter après, Ouvrir) ; la case la termine.
 * Les mêmes actions sont offertes aux lecteurs d'écran. Décaler = devenir sous-tâche de la précédente.
 */
internal fun LazyListScope.outlineItems(rows: List<OutlineRow>, selected: String?, onSelect: (String?) -> Unit, actions: OutlineActions) {
    items(rows, key = { "outline-${it.task.uid}" }) { row ->
        OutlineLine(row, selected == row.task.uid, onSelect, actions, Modifier.animateItem())
    }
}

@Composable
private fun OutlineLine(row: OutlineRow, selected: Boolean, onSelect: (String?) -> Unit, actions: OutlineActions, modifier: Modifier) {
    val palette = cadence
    val task = row.task
    val uid = task.uid
    var checked by remember(uid, task.isClosed) { mutableStateOf(task.isClosed) }
    var adding by rememberSaveable(uid) { mutableStateOf(false) }
    val tree = actions.tree
    val up = Outline.move(tree, uid, up = true)
    val down = Outline.move(tree, uid, up = false)
    val indent = Outline.indent(tree, uid)
    val outdent = Outline.outdent(tree, uid)
    val labels = OutlineLabels(
        up = stringResource(R.string.outline_up),
        down = stringResource(R.string.outline_down),
        indent = stringResource(R.string.outline_indent),
        outdent = stringResource(R.string.outline_outdent),
        add = stringResource(R.string.outline_add_after),
        open = stringResource(R.string.outline_open),
    )
    Column(modifier.fillMaxWidth().padding(start = Space.xl * row.depth)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = Size.touch)
                .clip(Radius.Chip)
                .background(if (selected) palette.containerHigh else palette.background)
                .clickable(role = Role.Button) { onSelect(if (selected) null else uid) }
                .semantics {
                    customActions = buildList {
                        if (actions.editable) {
                            up?.let { add(CustomAccessibilityAction(labels.up) { actions.apply(it); true }) }
                            down?.let { add(CustomAccessibilityAction(labels.down) { actions.apply(it); true }) }
                            indent?.let { add(CustomAccessibilityAction(labels.indent) { actions.apply(it); true }) }
                            outdent?.let { add(CustomAccessibilityAction(labels.outdent) { actions.apply(it); true }) }
                            add(CustomAccessibilityAction(labels.add) { onSelect(uid); adding = true; true })
                        }
                        add(CustomAccessibilityAction(labels.open) { actions.open(task); true })
                    }
                }
                .padding(end = Space.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            TaskCheckbox(
                checked = checked,
                onCheckedChange = {
                    checked = !checked
                    actions.toggle(task)
                },
                highPriority = task.priority == TaskPriority.HIGH,
            )
            Text(
                task.name,
                style = MaterialTheme.typography.bodyLarge,
                color = if (checked) palette.onSurfaceVariant else palette.onSurface,
                textDecoration = if (checked) TextDecoration.LineThrough else null,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (selected) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                if (actions.editable) {
                    OutlineButton(Icons.Outlined.KeyboardArrowUp, labels.up, up) { actions.apply(it) }
                    OutlineButton(Icons.Outlined.KeyboardArrowDown, labels.down, down) { actions.apply(it) }
                    OutlineButton(Icons.AutoMirrored.Outlined.FormatIndentIncrease, labels.indent, indent) { actions.apply(it) }
                    OutlineButton(Icons.AutoMirrored.Outlined.FormatIndentDecrease, labels.outdent, outdent) { actions.apply(it) }
                    OutlineButton(Icons.Outlined.Add, labels.add, Unit) { adding = true }
                }
                OutlineButton(Icons.AutoMirrored.Outlined.OpenInNew, labels.open, Unit) { actions.open(task) }
            }
        }
        if (selected && adding && actions.editable) {
            SiblingField(
                onAdd = { name -> actions.addAfter(uid, name) },
                onClose = { adding = false },
            )
        }
    }
}

private data class OutlineLabels(val up: String, val down: String, val indent: String, val outdent: String, val add: String, val open: String)

/** Bouton d'action d'une ligne ; inactif quand l'opération ne s'applique pas ([result] null). */
@Composable
private fun <T : Any> OutlineButton(icon: ImageVector, label: String, result: T?, onClick: (T) -> Unit) {
    IconButton(onClick = { result?.let(onClick) }, enabled = result != null) {
        Icon(icon, contentDescription = label, tint = if (result != null) cadence.onSurfaceVariant else cadence.outline)
    }
}

/** Champ d'une tâche sœur : « Terminé » l'ajoute juste après la ligne choisie ; vide, il se ferme. */
@Composable
private fun SiblingField(onAdd: (String) -> Unit, onClose: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    CadenceField(
        value = name,
        onValue = { name = it },
        label = stringResource(R.string.outline_new_sibling),
        modifier = Modifier.padding(vertical = Space.xs),
        fieldModifier = Modifier.focusRequester(focus),
        onDone = {
            val clean = name.trim()
            if (clean.isNotEmpty()) onAdd(clean)
            onClose()
        },
    )
}

@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package ch.nicolab.cadence.tasks.ui.review

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Size
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.links.LinkExtractor
import ch.nicolab.cadence.tasks.links.LinkPreviews
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkLists
import ch.nicolab.cadence.tasks.ui.LinkPreviewCard
import ch.nicolab.cadence.tasks.ui.LinkSummary
import ch.nicolab.cadence.tasks.ui.QuickPill
import androidx.compose.ui.res.stringResource

/** Un choix de revue : [primary] est la pastille pleine, [more] le range sous « Plus… ». */
internal class Choice(
    val icon: ImageVector,
    val label: String,
    val danger: Boolean = false,
    val primary: Boolean = false,
    val more: Boolean = false,
    val run: () -> Unit,
)

/** Ce qu'une ligne montre de son lien : le lien enregistré par le serveur, sinon l'aperçu de l'adresse. */
internal data class RowLink(val text: String, val saved: LinkItem?) {
    val url: String? get() = saved?.url ?: LinkExtractor.urls(text, 1).firstOrNull()

    /** Le texte n'est montré que s'il dit plus que le lien (une adresse nue devient la carte). */
    val showsText: Boolean get() = LinkLists.showsText(text, saved)
}

/**
 * Carte d'une ligne de revue : le titre (ou la carte de son lien), une ligne neutre, et les choix en
 * pastilles d'un toucher une fois dépliée. Toucher la carte la déplie ; rien ne se décide sans le vouloir.
 */
@Composable
internal fun ReviewCard(
    title: String,
    meta: String?,
    link: RowLink?,
    previews: LinkPreviews,
    expanded: Boolean,
    onToggle: () -> Unit,
    choices: List<Choice>,
    busy: Boolean,
    rail: Color? = null,
    tags: List<String> = emptyList(),
) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(Radius.Control)
            .background(palette.card)
            .clickable(role = Role.Button, onClick = onToggle),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(rail ?: Color.Transparent))
        Column(
            Modifier.weight(1f).padding(horizontal = Space.md, vertical = Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.xs),
        ) {
            if (link == null || link.showsText) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.onSurface,
                    maxLines = if (expanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            link?.let { shown ->
                when {
                    shown.saved != null -> LinkSummary(shown.saved, descriptionLines = if (expanded) 4 else 1)
                    shown.url != null -> LinkPreviewCard(shown.url!!, previews)
                }
            }
            val line = (tags.map { "#$it" } + listOfNotNull(meta?.takeIf { it.isNotBlank() })).joinToString("  ·  ")
            if (line.isNotEmpty()) {
                Text(line, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            AnimatedVisibility(expanded) {
                ChoicePills(choices, enabled = !busy, modifier = Modifier.padding(top = Space.sm))
            }
        }
    }
}

/** Les choix en pastilles ; ceux marqués [Choice.more] passent sous « Plus… ». */
@Composable
internal fun ChoicePills(choices: List<Choice>, enabled: Boolean, modifier: Modifier = Modifier, tall: Boolean = false) {
    val (extra, shown) = choices.partition { it.more }
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(Space.sm), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        shown.forEach { choice ->
            QuickPill(choice.label, { if (enabled) choice.run() }, quiet = !choice.primary, tall = tall)
        }
        if (extra.isNotEmpty()) {
            var open by remember { mutableStateOf(false) }
            Box {
                QuickPill(stringResource(R.string.review_action_more), { open = true }, quiet = true, tall = tall)
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    extra.forEach { choice ->
                        DropdownMenuItem(
                            text = { Text(choice.label, color = if (choice.danger) cadence.error else cadence.onSurface) },
                            onClick = { open = false; if (enabled) choice.run() },
                        )
                    }
                }
            }
        }
    }
}

/**
 * Ligne de « Plus tard » : glisser à droite la passe à aujourd'hui, à gauche la laisse de côté un mois
 * (`review_on` + 30 jours) ; « Annuler » défait l'un comme l'autre.
 */
@Composable
internal fun SwipeDecision(
    todayLabel: String,
    laterLabel: String,
    onToday: () -> Unit,
    onLater: () -> Unit,
    content: @Composable () -> Unit,
) {
    val palette = cadence
    val today by rememberUpdatedState(onToday)
    val later by rememberUpdatedState(onLater)
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            when (target) {
                SwipeToDismissBoxValue.StartToEnd -> { today(); true }
                SwipeToDismissBoxValue.EndToStart -> { later(); true }
                SwipeToDismissBoxValue.Settled -> false
            }
        },
    )
    SwipeToDismissBox(
        state = state,
        modifier = Modifier.semantics {
            customActions = listOf(
                CustomAccessibilityAction(todayLabel) { today(); true },
                CustomAccessibilityAction(laterLabel) { later(); true },
            )
        },
        backgroundContent = {
            val toToday = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Row(
                Modifier
                    .fillMaxSize()
                    .clip(Radius.Control)
                    .background(if (toToday) palette.primaryContainer else palette.containerHigh)
                    .padding(horizontal = Space.xl),
                horizontalArrangement = if (toToday) Arrangement.Start else Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val tint = if (toToday) palette.onPrimaryContainer else palette.onSurfaceVariant
                if (!toToday) {
                    Text(laterLabel, style = MaterialTheme.typography.labelLarge, color = tint)
                    Spacer(Modifier.width(Space.sm))
                }
                Icon(if (toToday) Icons.Outlined.Today else Icons.Outlined.EventNote, null, tint = tint)
                if (toToday) {
                    Spacer(Modifier.width(Space.sm))
                    Text(todayLabel, style = MaterialTheme.typography.labelLarge, color = tint)
                }
            }
        },
    ) { content() }
}

/** En-tête d'un groupe de « Plus tard » : pastille de couleur, nom, nombre, chevron ; toucher plie ou déplie. */
@Composable
internal fun GroupHeader(name: String, count: Int, color: Color?, open: Boolean, onToggle: () -> Unit) {
    val palette = cadence
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Size.touch)
            .clip(Radius.Control)
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(horizontal = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color ?: palette.outline))
        Spacer(Modifier.width(Space.sm))
        Text(
            name,
            style = MaterialTheme.typography.titleSmall,
            color = palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.width(Space.sm))
        Text(count.toString(), style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant)
        Spacer(Modifier.weight(1f))
        Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = palette.onSurfaceVariant, modifier = Modifier.size(Size.icon))
    }
}

package ch.nicolab.cadence.tasks.ui

import ch.nicolab.cadence.designsystem.theme.cadence
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.clickable
import ch.nicolab.cadence.tasks.model.TaskSources
import ch.nicolab.cadence.tasks.model.TaskSourceBadge
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.designsystem.components.TaskCheckbox
import ch.nicolab.cadence.designsystem.components.pressable
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Motion
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import ch.nicolab.cadence.tasks.model.TaskStatus
import ch.nicolab.cadence.tasks.model.TaskViews
import ch.nicolab.cadence.tasks.swipe.FileBackedActions
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.SwipeConfig
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.delay

private val RowShape = Radius.Control
private val RailWidth = 3.dp
private const val VIRTUAL_ALPHA = 0.6f

/** Temps pendant lequel la ligne reste cochée et barrée avant de quitter la liste. */
private const val COMPLETION_HOLD_MILLIS = 1_500L

/**
 * Une tâche dans une liste. Glisser à droite ou à gauche déclenche les actions réglées dans
 * Réglages › Gestes ; toucher ouvre la fiche, appuyer longtemps ouvre le menu d'actions.
 * La largeur du liseré de projet est toujours réservée pour aligner cases et titres.
 */
@Composable
internal fun TaskRow(
    task: TaskItem,
    projectName: String?,
    projectColor: Int? = null,
    projectIcon: String? = null,
    today: LocalDate,
    zone: ZoneId,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    onSwipeAction: (SwipeAction) -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
    sectionDay: LocalDate? = null,
    decor: RowDecor = rememberRowDecor(),
    /** Heure où le plan du jour du serveur place la tâche ; montrée à la place de l'heure d'échéance. */
    plannedAt: Instant? = null,
    /** Motif donné par le résumé du jour, lu sous le titre. */
    subtitle: String? = null,
    /** Action de fin de ligne (ex. date proposée du résumé du jour). */
    trailing: (@Composable () -> Unit)? = null,
    /** La ligne se montre cochée et barrée avant que la tâche le soit (geste du résumé, tâche récurrente qui reste ouverte). */
    forceClosed: Boolean = false,
) {
    val haptic = rememberCadenceHaptic()
    val interaction = remember { MutableInteractionSource() }
    // Coche et barré apparaissent tout de suite ; la tâche quitte la liste après le délai du modèle.
    var completing by remember { mutableStateOf(false) }
    LaunchedEffect(completing) {
        if (completing) {
            delay(COMPLETION_HOLD_MILLIS)
            completing = false
        }
    }
    val showClosed = task.isClosed || completing || forceClosed

    val swipeConfig = rememberSwipeConfig()
    SwipeActionContainer(
        config = remember(task.fileBacked, task.virtual, swipeConfig) {
            if (task.virtual) SwipeConfig(SwipeAction.NONE, SwipeAction.NONE, SwipeAction.NONE, SwipeAction.NONE)
            else FileBackedActions.swipeConfig(task, swipeConfig)
        },
        closed = task.isClosed,
        onAction = onSwipeAction,
        shape = RowShape,
        modifier = modifier,
    ) { swipeSemantics ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .pressable(interaction, RowShape)
                .background(MaterialTheme.colorScheme.surface, RowShape)
                .then(swipeSemantics)
                .alpha(if (task.virtual) VIRTUAL_ALPHA else 1f)
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    onClick = onOpen,
                    // Une occurrence à venir n'a pas d'actions propres : le menu agirait sur la tâche enregistrée.
                    onLongClick = {
                        haptic.longPress()
                        if (task.virtual) onOpen() else onMenu()
                    },
                )
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .padding(start = 4.dp)
                    .width(RailWidth)
                    .height(32.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(TaskRowMeta.railColor(projectColor, decor.showProjectRail)?.let { Color(it) } ?: Color.Transparent),
            )
            TaskCheckbox(
                checked = showClosed,
                onCheckedChange = {
                    // Seule l'occurrence enregistrée se coche : ouvrir la fiche vaut mieux qu'un geste sans effet.
                    if (task.virtual) {
                        onOpen()
                    } else {
                        // Pendant le maintien, un second toucher décoche : le modèle annule l'écriture.
                        if (!task.isClosed) completing = !completing
                        onToggle()
                    }
                },
                highPriority = task.priority == TaskPriority.HIGH,
                contentDescription = stringResource(if (task.isClosed) R.string.tasks_mark_undone else R.string.tasks_mark_done),
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                StrikingTitle(task.name, struck = showClosed)
                TaskMeta(task, projectName, projectIcon, projectColor, today, zone, sectionDay, decor, plannedAt)
                subtitle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                if (decor.showDescription) {
                    TaskRowMeta.notePreview(task.note)?.let { preview ->
                        Text(
                            text = preview,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = TaskRowMeta.DESCRIPTION_LINES,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
            trailing?.let {
                Spacer(Modifier.width(8.dp))
                it()
            }
            // Un seul signal de priorité : le trait rouge de la case pour une priorité haute, rien d'autre.
            Spacer(Modifier.width(16.dp))
        }
    }
}

/**
 * Titre barré d'un trait qui se trace de gauche à droite, ligne après ligne, pendant que le
 * texte s'atténue. Une ligne déjà fermée à l'affichage est barrée sans animation ; « Supprimer
 * les animations » rend le trait d'un coup (échelle de durée système).
 */
@Composable
private fun StrikingTitle(name: String, struck: Boolean) {
    val colors = MaterialTheme.colorScheme
    val progress = animateFloatAsState(
        targetValue = if (struck) 1f else 0f,
        animationSpec = tween(Motion.NORMAL, easing = FastOutSlowInEasing),
        label = "strike",
    )
    val color by animateColorAsState(
        targetValue = if (struck) colors.onSurfaceVariant else colors.onSurface,
        animationSpec = Motion.color(),
        label = "titleColor",
    )
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Text(
        text = name,
        style = MaterialTheme.typography.bodyLarge,
        color = color,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        onTextLayout = { layout = it },
        modifier = Modifier.drawWithContent {
            drawContent()
            val text = layout ?: return@drawWithContent
            val shown = progress.value
            if (shown <= 0f) return@drawWithContent
            val lines = (0 until text.lineCount).map { text.getLineLeft(it) to text.getLineRight(it) }
            val total = lines.sumOf { (left, right) -> (right - left).toDouble() }.toFloat()
            var budget = total * shown
            val fontPx = text.layoutInput.style.fontSize.toPx()
            val lift = fontPx * STRIKE_LIFT
            lines.forEachIndexed { index, (left, right) ->
                if (budget <= 0f) return@drawWithContent
                val width = minOf(right - left, budget)
                val y = text.getLineBaseline(index) - lift
                drawLine(color, Offset(left, y), Offset(left + width, y), strokeWidth = fontPx * STRIKE_THICKNESS, cap = StrokeCap.Round)
                budget -= width
            }
        },
    )
}

/** Hauteur du trait au-dessus de la ligne de base, en part de la taille du texte (milieu de la hauteur d'x). */
private const val STRIKE_LIFT = 0.3f

/** Épaisseur du trait en part de la taille du texte, celle d'un barré typographique. */
private const val STRIKE_THICKNESS = 0.075f

/**
 * Faux quand la section affiche déjà le jour de l'échéance : la pastille ne répète pas la date.
 * Une tâche en retard garde sa date, son badge rouge étant le signal.
 */
internal fun showsDueDay(dueDay: LocalDate, sectionDay: LocalDate?, overdue: Boolean): Boolean =
    overdue || sectionDay != dueDay

@Composable
private fun TaskMeta(
    task: TaskItem,
    projectName: String?,
    projectIcon: String?,
    projectColor: Int?,
    today: LocalDate,
    zone: ZoneId,
    sectionDay: LocalDate?,
    decor: RowDecor,
    plannedAt: Instant?,
) {
    val pendingText = stringResource(R.string.tasks_pending_sync)
    val recurringText = stringResource(R.string.tasks_recurring)
    val dueDate = task.dueDay
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dueDate != null || plannedAt != null) {
            val overdue = dueDate != null && TaskViews.isOverdue(task, today)
            val day = if (dueDate != null && showsDueDay(dueDate, sectionDay, overdue)) dayLabel(dueDate, today) else null
            val time = (plannedAt ?: task.dueDate?.takeIf { task.dueHasTime })?.let { wireTime(instantTime(it, zone)) }
            val badge = listOfNotNull(day, time).joinToString(" ")
            if (badge.isNotEmpty()) {
                // Texte simple, sans pastille ; une échéance passée reste neutre, jamais la couleur d'erreur.
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (task.fileBacked) {
            val fileText = stringResource(R.string.tasks_file_badge)
            val fileDescription = stringResource(R.string.tasks_file_badge_description)
            Text(
                text = fileText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { contentDescription = fileDescription },
            )
        }
        TaskSources.of(task)?.let { SourceMark(it) }
        if (task.isRecurring) {
            Icon(
                Icons.Outlined.Repeat,
                contentDescription = recurringText,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
        }
        when (val origin = TaskRowMeta.origin(task.projectUid, projectName, task.areaUid?.let { decor.areaNames[it] })) {
            is RowOrigin.Project -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                val tint = projectColor?.let { Color(it) } ?: MaterialTheme.colorScheme.onSurfaceVariant
                // Sans icône choisie, le nom reste seul : pas de pastille de remplacement.
                entityIcon(projectIcon)?.let { EntityIcon(it, tint = tint, size = 14.dp) }
                Text(
                    text = origin.name,
                    style = MaterialTheme.typography.labelMedium,
                    color = tint,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
            is RowOrigin.Area -> Text(
                text = origin.name,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            RowOrigin.None -> Unit
        }
        val rowTags = remember(task.tagUids, decor.tags) { TaskRowMeta.tags(task.tagUids, decor.tags) }
        rowTags.shown.forEach { tag ->
            Text(
                text = "#${tag.label}",
                style = MaterialTheme.typography.labelMedium,
                color = decor.tagColors[tag.uid] ?: MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (rowTags.more > 0) {
            Text(
                text = "+${rowTags.more}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (task.pendingSync) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .semantics { contentDescription = pendingText },
            )
        }
    }
}

/**
 * Origine d'une tâche (Gmail, Telegram, MCP…) : une lettre dans un petit carré et le nom, neutres. Avec une page
 * d'origine, un toucher l'ouvre sans ouvrir la tâche.
 */
@Composable
internal fun SourceMark(badge: TaskSourceBadge, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    val palette = cadence
    val description = stringResource(R.string.tasks_source_description, badge.label)
    Row(
        modifier
            .then(
                badge.url?.let { url -> Modifier.clickable(role = Role.Button) { runCatching { uriHandler.openUri(url) } } } ?: Modifier,
            )
            .semantics(mergeDescendants = true) { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Box(
            Modifier.size(14.dp).clip(RoundedCornerShape(3.dp)).background(palette.containerHigh),
            contentAlignment = Alignment.Center,
        ) {
            Text(badge.letter, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = palette.onSurfaceVariant, maxLines = 1)
        }
        Text(badge.label, style = MaterialTheme.typography.labelMedium, color = palette.onSurfaceVariant, maxLines = 1)
    }
}

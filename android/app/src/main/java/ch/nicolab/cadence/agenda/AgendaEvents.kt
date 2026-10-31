package ch.nicolab.cadence.agenda

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import ch.nicolab.cadence.calendar.EventDetail
import ch.nicolab.cadence.calendar.EventInstanceKey
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.tasks.ui.EventDetailSheet
import ch.nicolab.cadence.tasks.ui.EventMenuSheet

/** Fiche d'un événement pour l'écran : l'état « fait » vient de l'entrée. */
internal fun AgendaEntry.Event.toDetail(): EventDetail = EventDetail(
    key = eventKey,
    title = title,
    calendarName = calendarName,
    colorArgb = colorArgb,
    allDay = allDay,
    start = start,
    end = end,
    location = location,
    description = description,
    done = done,
)

/** Toucher ouvre la fiche, appui long le menu ; fournis par l'écran pour ne pas les passer à chaque vue. */
internal class AgendaEventActions(
    val open: (AgendaEntry.Event) -> Unit,
    val menu: (AgendaEntry.Event) -> Unit,
    val toggleTask: (AgendaEntry.Task) -> Unit = {},
    /** Ouvre la saisie de l'habitude : c'est là qu'on la note faite, avec sa quantité éventuelle. */
    val openHabit: (AgendaEntry.Habit) -> Unit = {},
) {
    companion object {
        val None = AgendaEventActions({}, {})
    }
}

internal val LocalAgendaEventActions = staticCompositionLocalOf { AgendaEventActions.None }

/**
 * Rend un événement touchable (fiche) et appuyable longtemps (menu), une habitude touchable (saisie) ;
 * une tâche reste inchangée.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.eventTouch(entry: AgendaEntry): Modifier {
    val actions = LocalAgendaEventActions.current
    if (entry is AgendaEntry.Habit) return clickable(role = Role.Button) { actions.openHabit(entry) }
    if (entry !is AgendaEntry.Event) return this
    val haptic = rememberCadenceHaptic()
    return combinedClickable(
        onClick = { actions.open(entry) },
        onLongClick = {
            haptic.longPress()
            actions.menu(entry)
        },
    )
}

/** Menu ou fiche ouvert sur un événement ; porte la clé, l'état courant est relu dans les entrées. */
internal sealed interface AgendaEventSheet {
    val key: EventInstanceKey

    data class Menu(override val key: EventInstanceKey) : AgendaEventSheet
    data class Detail(override val key: EventInstanceKey) : AgendaEventSheet
}

@Composable
internal fun AgendaEventSheets(
    sheet: AgendaEventSheet?,
    entries: List<AgendaEntry>,
    checkEvents: Boolean,
    onSheet: (AgendaEventSheet?) -> Unit,
    onToggle: (EventInstanceKey) -> Unit,
    onHide: (EventDetail) -> Unit,
) {
    val open = sheet ?: return
    val entry = entries.filterIsInstance<AgendaEntry.Event>().firstOrNull { it.eventKey == open.key }
    if (entry == null) {
        // L'occurrence a quitté la plage chargée ou a été masquée : plus rien à montrer.
        androidx.compose.runtime.LaunchedEffect(open) { onSheet(null) }
        return
    }
    val detail = entry.toDetail()
    when (open) {
        is AgendaEventSheet.Menu -> EventMenuSheet(
            detail = detail,
            checkable = checkEvents,
            onToggle = { onToggle(open.key) },
            onHide = { onHide(detail) },
            onOpenDetails = { onSheet(AgendaEventSheet.Detail(open.key)) },
            onDismiss = { onSheet(null) },
        )
        is AgendaEventSheet.Detail -> EventDetailSheet(
            detail = detail,
            checkable = checkEvents,
            onToggle = { onToggle(open.key) },
            onHide = { onHide(detail) },
            onDismiss = { onSheet(null) },
        )
    }
}

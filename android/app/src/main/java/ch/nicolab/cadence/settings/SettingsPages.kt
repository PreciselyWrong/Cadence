package ch.nicolab.cadence.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.CadenceField
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.TertiaryAction
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.domain.HabitGroup

/**
 * Réglage d'un moment de la journée. `Journée` garde sa nature de groupe sans horaire :
 * son nom reste modifiable, mais il ne prend jamais de plage et ne se supprime pas -
 * c'est la destination de repli des habitudes d'un groupe supprimé.
 */
@Composable
internal fun GroupPanel(
    group: HabitGroup,
    habitCount: Int,
    save: (HabitGroup) -> Unit,
    delete: (String) -> Unit,
    move: (String, Int) -> Unit,
) {
    val palette = cadence
    var name by remember(group.id, group.name) { mutableStateOf(group.name) }
    var start by remember(group.id, group.startMinute) { mutableStateOf(formatMinuteOfDay(group.startMinute)) }
    var end by remember(group.id, group.endMinute) { mutableStateOf(formatMinuteOfDay(group.endMinute)) }
    val fixedAllDay = group.id == HabitGroup.ALL_DAY_ID

    fun commit() {
        val startMinute = if (fixedAllDay) null else parseMinuteOfDay(start)
        val endMinute = if (fixedAllDay) null else parseMinuteOfDay(end)
        val bounded = if (startMinute == null || endMinute == null) null to null else startMinute to endMinute
        runCatching {
            HabitGroup(group.id, name.trim().ifBlank { group.name }, bounded.first, bounded.second, group.sortOrder)
        }.onSuccess(save)
    }

    Panel {
        CadenceField(name, { name = it }, stringResource(R.string.group_name_label), accent = palette.primary)
        if (!fixedAllDay) {
            Spacer(Modifier.height(Space.md))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                CadenceField(start, { start = it }, stringResource(R.string.group_start_label), Modifier.weight(1f), accent = palette.primary)
                CadenceField(end, { end = it }, stringResource(R.string.group_end_label), Modifier.weight(1f), accent = palette.primary)
            }
        } else {
            Spacer(Modifier.height(Space.xs))
            Text(stringResource(R.string.group_all_day), style = MaterialTheme.typography.bodySmall, color = palette.outline)
        }
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            PrimaryAction(stringResource(R.string.form_btn_save), Modifier.weight(1f)) { commit() }
            if (!fixedAllDay) {
                TertiaryAction(stringResource(R.string.group_delete), Modifier.weight(1f)) { delete(group.id) }
            }
        }
        if (!fixedAllDay) {
            Spacer(Modifier.height(Space.sm))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                TertiaryAction(stringResource(R.string.group_move_up), Modifier.weight(1f)) { move(group.id, -1) }
                TertiaryAction(stringResource(R.string.group_move_down), Modifier.weight(1f)) { move(group.id, 1) }
            }
        }
        if (habitCount > 0) {
            Spacer(Modifier.height(Space.xs))
            Text(
                stringResource(R.string.group_habit_count, habitCount) +
                    if (fixedAllDay) "" else " · " + stringResource(R.string.group_delete_notice),
                style = MaterialTheme.typography.bodySmall,
                color = palette.outline,
            )
        }
    }
}

internal fun formatMinuteOfDay(minute: Int?): String =
    minute?.let { String.format(java.util.Locale.ROOT, "%02d:%02d", it / 60, it % 60) }.orEmpty()

/** Lit `HH:mm`; toute autre écriture laisse le groupe sans horaire plutôt que d'inventer une plage. */
internal fun parseMinuteOfDay(raw: String): Int? =
    runCatching { java.time.LocalTime.parse(raw.trim()) }.getOrNull()?.let { it.hour * 60 + it.minute }

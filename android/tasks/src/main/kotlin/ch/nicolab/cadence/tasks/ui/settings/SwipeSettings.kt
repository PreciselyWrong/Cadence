@file:OptIn(ExperimentalMaterial3Api::class)

package ch.nicolab.cadence.tasks.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.CadenceSheet
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.swipe.SwipeAction
import ch.nicolab.cadence.tasks.swipe.SwipeConfig
import ch.nicolab.cadence.tasks.swipe.SwipeSide
import ch.nicolab.cadence.tasks.swipe.SwipeStage
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfig
import ch.nicolab.cadence.tasks.swipe.rememberSwipeConfigStore
import ch.nicolab.cadence.tasks.ui.swipeActionIcon
import ch.nicolab.cadence.tasks.ui.swipeActionLabelRes

private val Slots = listOf(
    Triple(SwipeSide.RIGHT, SwipeStage.SHORT, R.string.swipe_settings_right_short),
    Triple(SwipeSide.RIGHT, SwipeStage.LONG, R.string.swipe_settings_right_long),
    Triple(SwipeSide.LEFT, SwipeStage.SHORT, R.string.swipe_settings_left_short),
    Triple(SwipeSide.LEFT, SwipeStage.LONG, R.string.swipe_settings_left_long),
)

/** Sous-titre de la ligne « Gestes » de Réglages, par exemple « Droite : Terminer · Gauche : Planifier ». */
@Composable
fun swipeSettingsSummary(): String {
    val config = rememberSwipeConfig()
    return stringResource(
        R.string.swipe_settings_summary,
        stringResource(swipeActionLabelRes(config.resolve(SwipeSide.RIGHT, SwipeStage.SHORT))),
        stringResource(swipeActionLabelRes(config.resolve(SwipeSide.LEFT, SwipeStage.SHORT))),
    )
}

/** Sous-page Réglages › Gestes : une action par seuil et par sens de balayage. */
@Composable
fun SwipeSettings() {
    val store = rememberSwipeConfigStore()
    val config = rememberSwipeConfig()
    var editing by remember { mutableStateOf<Pair<SwipeSide, SwipeStage>?>(null) }

    Panel {
        Text(stringResource(R.string.swipe_settings_hint), style = MaterialTheme.typography.bodyMedium, color = cadence.onSurfaceVariant)
    }
    RowGroup {
        Slots.forEachIndexed { index, (side, stage, title) ->
            val action = config.actionFor(side, stage)
            SettingRow(
                title = stringResource(title),
                subtitle = stringResource(swipeActionLabelRes(action)),
                icon = swipeActionIcon(action),
                shape = rowGroupShape(index, Slots.size),
                onClick = { editing = side to stage },
            )
        }
    }
    SecondaryAction(stringResource(R.string.swipe_settings_reset), Modifier.fillMaxWidth()) {
        store.write(SwipeConfig.Default)
    }

    editing?.let { (side, stage) ->
        val slotTitle = Slots.first { it.first == side && it.second == stage }.third
        CadenceSheet(title = stringResource(slotTitle), subtitle = null, dismiss = { editing = null }) {
            val current = config.actionFor(side, stage)
            Column(Modifier.verticalScroll(rememberScrollState())) {
                RowGroup {
                    SwipeAction.entries.forEachIndexed { index, action ->
                        SettingRow(
                            title = stringResource(swipeActionLabelRes(action)),
                            icon = swipeActionIcon(action),
                            shape = rowGroupShape(index, SwipeAction.entries.size),
                            trailing = {
                                if (action == current) Icon(Icons.Outlined.Check, contentDescription = null, tint = cadence.primary)
                            },
                            onClick = {
                                store.write(store.read().with(side, stage, action))
                                editing = null
                            },
                        )
                    }
                }
                Spacer(Modifier.height(Space.md))
            }
        }
    }
}

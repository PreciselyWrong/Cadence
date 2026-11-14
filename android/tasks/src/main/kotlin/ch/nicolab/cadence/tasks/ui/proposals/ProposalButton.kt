package ch.nicolab.cadence.tasks.ui.proposals

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.designsystem.components.PrimaryAction
import ch.nicolab.cadence.designsystem.components.SecondaryAction
import ch.nicolab.cadence.designsystem.components.rememberAppSnackbarHostState
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.ProposalKind
import ch.nicolab.cadence.tasks.proposals.ProposalPhase
import ch.nicolab.cadence.tasks.proposals.ProposalRepository
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Intervalle de relecture tant qu'une proposition est en préparation. */
internal const val PROPOSAL_POLL_MS = 5_000L

/** État et geste d'une proposition, partagés par le bouton, le lien d'Aujourd'hui et l'entrée du menu ⋯. */
internal class ProposalAction(val label: String, val phase: ProposalPhase, val onClick: () -> Unit)

/**
 * « Planifier ma semaine » ou « Préparer ma revue » : idle, « En préparation… » (relu toutes les [PROPOSAL_POLL_MS]
 * tant qu'il est affiché), puis « … est prête ». Un appui en préparation ne fait rien ; prête, il ouvre la feuille de
 * la semaine ou appelle [onReady] (la revue rapide). Hors ligne : « Hors ligne ».
 */
@Composable
internal fun rememberProposalAction(kind: ProposalKind, onReady: () -> Unit = {}): ProposalAction {
    val context = LocalContext.current
    val repo = remember(context) { ProposalRepository.of(context) }
    val latest by repo.latest.collectAsStateWithLifecycle()
    val phase = ProposalPhase.of(latest[kind])
    val snackbar = rememberAppSnackbarHostState()
    val scope = rememberCoroutineScope()
    val offline = stringResource(R.string.proposal_offline)
    val failed = stringResource(R.string.proposal_error)
    val week = kind == ProposalKind.WEEK

    LaunchedEffect(kind) { repo.refresh() }
    LaunchedEffect(phase) {
        if (phase is ProposalPhase.Preparing) {
            while (true) {
                delay(PROPOSAL_POLL_MS)
                repo.refresh()
            }
        }
    }

    val label = when (phase) {
        ProposalPhase.Idle -> stringResource(if (week) R.string.proposal_week_button else R.string.proposal_review_button)
        is ProposalPhase.Preparing -> stringResource(R.string.proposal_preparing)
        is ProposalPhase.Ready -> stringResource(if (week) R.string.proposal_week_ready else R.string.proposal_review_ready)
    }
    return ProposalAction(label, phase) {
        when (phase) {
            ProposalPhase.Idle -> scope.launch {
                repo.create(kind).onFailure { snackbar.showSnackbar(if (it is IOException) offline else failed) }
            }
            is ProposalPhase.Preparing -> Unit
            is ProposalPhase.Ready -> {
                if (week) repo.show(phase.uid) else onReady()
            }
        }
    }
}

/** Bouton de la proposition (Planifier, revue rapide) : principal quand elle est prête, secondaire sinon. */
@Composable
internal fun ProposalButton(kind: ProposalKind, modifier: Modifier = Modifier, onReady: () -> Unit = {}) {
    val action = rememberProposalAction(kind, onReady)
    if (action.phase is ProposalPhase.Ready) {
        PrimaryAction(action.label, modifier = modifier, onClick = action.onClick)
    } else {
        SecondaryAction(action.label, modifier = modifier, enabled = action.phase !is ProposalPhase.Preparing, onClick = action.onClick)
    }
}

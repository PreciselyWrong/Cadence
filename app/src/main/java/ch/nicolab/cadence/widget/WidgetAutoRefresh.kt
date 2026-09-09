package ch.nicolab.cadence.widget

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch

/**
 * Répercute sur les widgets toute écriture en base, quelle que soit son origine : écran
 * principal, saisie rapide, notification de rappel ou restauration de sauvegarde. Aucun
 * appel explicite n'est nécessaire au point d'écriture, donc aucun ne peut être oublié.
 *
 * Les écritures d'une même opération arrivent en rafale (habitude, objectif, saisie) :
 * [quietMillis] les regroupe dans une fenêtre bornée. Une activité continue ne peut donc
 * pas repousser le rendu de la saisie qui vient de terminer une habitude.
 */
class WidgetAutoRefresh(
    private val revisions: Flow<*>,
    private val quietMillis: Long = 60,
    private val refresh: suspend () -> Unit,
) {
    fun start(scope: CoroutineScope): Job = scope.launch {
        revisions.boundedRefreshWindows().collect {
            refresh()
        }
    }

    private fun Flow<*>.boundedRefreshWindows(): Flow<Unit> = channelFlow {
        var scheduled: Job? = null
        collect {
            if (scheduled?.isActive != true) {
                scheduled = launch {
                    delay(quietMillis)
                    send(Unit)
                }
            }
        }
    }
}

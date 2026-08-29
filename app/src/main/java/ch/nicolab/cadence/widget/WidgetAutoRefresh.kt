package ch.nicolab.cadence.widget

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

/**
 * Répercute sur les widgets toute écriture en base, quelle que soit son origine : écran
 * principal, saisie rapide, notification de rappel ou restauration de sauvegarde. Aucun
 * appel explicite n'est nécessaire au point d'écriture, donc aucun ne peut être oublié.
 *
 * Les écritures d'une même opération arrivent en rafale (habitude, objectif, saisie) :
 * [quietMillis] laisse la rafale se terminer avant un rendu unique. La fenêtre reste
 * assez courte pour être invisible à l'œil.
 */
class WidgetAutoRefresh(
    private val revisions: Flow<*>,
    private val quietMillis: Long = 60,
    private val refresh: suspend () -> Unit,
) {
    @OptIn(FlowPreview::class)
    fun start(scope: CoroutineScope): Job = scope.launch {
        revisions.debounce(quietMillis).collect {
            refresh()
        }
    }
}

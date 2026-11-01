package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.designsystem.components.ChoiceChip
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.AreaFilter
import ch.nicolab.cadence.tasks.model.AreaItem

/**
 * Filtre par domaine des listes de tâches et de projets : « Tous » puis un domaine à la fois. Le choix est gardé
 * entre les sessions ; la rangée n'existe qu'à partir de deux domaines.
 */
@Composable
internal fun AreaFilterRow(
    areas: List<AreaItem>,
    selected: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!AreaFilter.offersChoice(areas)) return
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = Space.gutter),
        horizontalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        item(key = "all") {
            ChoiceChip(label = stringResource(R.string.areas_filter_all), selected = selected == null, onClick = { onSelect(null) })
        }
        items(areas, key = { it.uid }) { area ->
            ChoiceChip(label = area.name, selected = selected == area.uid, onClick = { onSelect(area.uid) })
        }
    }
}

/** Noms des cinq domaines proposés, dans la langue de l'appareil. */
@Composable
internal fun suggestedAreaNames(): List<String> = listOf(
    stringResource(R.string.areas_suggest_business),
    stringResource(R.string.areas_suggest_tech),
    stringResource(R.string.areas_suggest_personal),
    stringResource(R.string.areas_suggest_family),
    stringResource(R.string.areas_suggest_logistics),
)

/** Lien discret de l'état vide : jamais automatique, créé seulement au toucher. */
@Composable
internal fun SuggestAreasButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = onClick, modifier = modifier) { Text(stringResource(R.string.areas_suggest)) }
}

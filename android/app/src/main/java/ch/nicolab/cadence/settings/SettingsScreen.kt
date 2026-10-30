package ch.nicolab.cadence.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.R
import ch.nicolab.cadence.designsystem.components.RowGroup
import ch.nicolab.cadence.designsystem.components.ScreenHeader
import ch.nicolab.cadence.designsystem.components.SectionHeader
import ch.nicolab.cadence.designsystem.components.SettingRow
import ch.nicolab.cadence.designsystem.components.rowGroupShape
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.ui.ScreenList

/**
 * Réglages : liste de rubriques groupées par thème. Une rubrique ouverte remplace la liste ;
 * le retour ferme la rubrique avant de quitter l'écran.
 */
@Composable
internal fun SettingsScreen(deps: SettingsDeps, onBack: () -> Unit) {
    val pages = settingsPages(deps)
    var openPageId by rememberSaveable { mutableStateOf<String?>(null) }
    val openPage = pages.firstOrNull { it.id == openPageId }
    val back = stringResource(R.string.action_back)
    BackHandler(enabled = openPage != null) { openPageId = null }
    if (openPage != null) {
        ScreenList(header = {
            ScreenHeader(title = stringResource(openPage.title), onBack = { openPageId = null }, backDescription = back)
        }) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(Space.md)) { openPage.content() }
            }
        }
    } else {
        ScreenList(header = {
            ScreenHeader(title = stringResource(R.string.tab_settings), onBack = onBack, backDescription = back)
        }) {
            SettingsSection.entries.forEach { section ->
                val sectionPages = pages.filter { it.section == section }
                if (sectionPages.isNotEmpty()) item(key = section.name) {
                    Column {
                        SectionHeader(stringResource(section.title))
                        RowGroup {
                            sectionPages.forEachIndexed { index, page ->
                                SettingRow(
                                    title = stringResource(page.title),
                                    icon = page.icon,
                                    subtitle = page.subtitle(),
                                    shape = rowGroupShape(index, sectionPages.size),
                                    onClick = { openPageId = page.id },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

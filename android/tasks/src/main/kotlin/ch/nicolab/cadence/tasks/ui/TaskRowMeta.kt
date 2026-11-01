package ch.nicolab.cadence.tasks.ui

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TagPaths
import ch.nicolab.cadence.tasks.notes.Markdown
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** Une étiquette telle que la ligne la montre : `#sport` pour `perso/sport`. */
internal data class RowTag(val uid: String, val label: String)

/** Étiquettes visibles d'une ligne, plus le nombre de celles qui restent cachées (« +N »). */
internal data class RowTags(val shown: List<RowTag>, val more: Int)

/** D'où vient la tâche : son projet, sinon son domaine, sinon rien. */
internal sealed interface RowOrigin {
    data class Project(val name: String) : RowOrigin
    data class Area(val name: String) : RowOrigin
    data object None : RowOrigin
}

/** Règles de la ligne méta d'une tâche : date · projet ou domaine · étiquettes. */
internal object TaskRowMeta {
    const val MAX_TAGS = 2
    const val DESCRIPTION_LINES = 2

    /**
     * Étiquettes dans l'ordre de la tâche ; « Plus tard » (étiquette système) et les uid inconnus sont
     * écartés avant de compter, de sorte que « +N » ne promet que des étiquettes réellement cachées.
     */
    fun tags(tagUids: List<String>, tags: List<TagItem>): RowTags {
        val byUid = tags.associateBy { it.uid }
        val visible = tagUids.distinct().mapNotNull { uid ->
            byUid[uid]?.takeIf { it.name != TagPaths.SOMEDAY }?.let { RowTag(it.uid, TagPaths.leaf(it.name)) }
        }
        return RowTags(visible.take(MAX_TAGS), (visible.size - MAX_TAGS).coerceAtLeast(0))
    }

    /**
     * Le projet quand il est connu ; le domaine seulement pour une tâche sans projet. [projectName] est
     * nul dans la page du projet lui-même (rien à répéter), et le domaine n'y remplace alors pas le projet.
     */
    fun origin(projectUid: String?, projectName: String?, areaName: String?): RowOrigin = when {
        projectName != null -> RowOrigin.Project(projectName)
        projectUid == null && areaName != null -> RowOrigin.Area(areaName)
        else -> RowOrigin.None
    }

    /** Couleur du liseré de projet ; nulle quand le réglage le masque ou que la tâche n'a pas de projet coloré. */
    fun railColor(projectColor: Int?, enabled: Boolean): Int? = projectColor.takeIf { enabled }

    /** Début de la note en texte brut, sur au plus [DESCRIPTION_LINES] lignes ; null si elle ne dit rien. */
    fun notePreview(note: String?): String? =
        note?.takeIf { it.isNotBlank() }?.let { Markdown.preview(it, DESCRIPTION_LINES) }?.takeIf { it.isNotBlank() }
}

/**
 * Préférences d'affichage des lignes, persistées dans `cadence_row_display` : description sous le titre
 * (désactivée par défaut) et liseré de projet (activé par défaut, comme dans la maquette).
 */
class RowDisplayStore(context: Context) {
    private val preferences: SharedPreferences =
        context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun showDescription(): Boolean = preferences.getBoolean(KEY_DESCRIPTION, false)

    fun setShowDescription(value: Boolean) {
        preferences.edit { putBoolean(KEY_DESCRIPTION, value) }
    }

    fun showProjectRail(): Boolean = preferences.getBoolean(KEY_PROJECT_RAIL, true)

    fun setShowProjectRail(value: Boolean) {
        preferences.edit { putBoolean(KEY_PROJECT_RAIL, value) }
    }

    fun changes(): Flow<RowDisplay> = callbackFlow {
        send(RowDisplay(showDescription(), showProjectRail()))
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
            trySend(RowDisplay(showDescription(), showProjectRail()))
        }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    private companion object {
        const val NAME = "cadence_row_display"
        const val KEY_DESCRIPTION = "show_description"
        const val KEY_PROJECT_RAIL = "show_project_rail"
    }
}

data class RowDisplay(val showDescription: Boolean, val showProjectRail: Boolean)

@Composable
internal fun rememberRowDisplay(): RowDisplay {
    val context = LocalContext.current
    val store = remember(context) { RowDisplayStore(context) }
    val initial = remember(store) { RowDisplay(store.showDescription(), store.showProjectRail()) }
    val value by produceState(initial, store) { store.changes().collect { this.value = it } }
    return value
}

@Composable
fun rememberShowTaskDescription(): Boolean = rememberRowDisplay().showDescription

@Composable
fun rememberShowProjectRail(): Boolean = rememberRowDisplay().showProjectRail

/** Ce qu'une ligne a besoin de connaître au-delà de sa tâche. */
internal data class RowDecor(
    val tags: List<TagItem> = emptyList(),
    val tagColors: Map<String, Color> = emptyMap(),
    val areaNames: Map<String, String> = emptyMap(),
    val showDescription: Boolean = false,
    val showProjectRail: Boolean = true,
)

@Composable
internal fun rememberRowDecor(viewModel: TasksViewModel = viewModel()): RowDecor {
    val tags by viewModel.tags.collectAsStateWithLifecycle()
    val areas by viewModel.areas.collectAsStateWithLifecycle()
    val display = rememberRowDisplay()
    val colors = remember(tags) { tagBadgeColors(tags) }
    val areaNames = remember(areas) { areas.associate { it.uid to it.name } }
    return remember(tags, colors, areaNames, display) {
        RowDecor(tags, colors, areaNames, display.showDescription, display.showProjectRail)
    }
}

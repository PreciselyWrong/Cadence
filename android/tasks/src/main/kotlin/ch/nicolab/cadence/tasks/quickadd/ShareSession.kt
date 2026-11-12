package ch.nicolab.cadence.tasks.quickadd

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.AddressPlaces
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

/**
 * Un partage en cours dans la feuille : le texte (modifiable), les étiquettes et le projet choisis. Il survit à une
 * rotation ; [settle] n'écrit qu'une fois, la première décision gagne, et fermer la feuille ou quitter l'écran vaut
 * Inbox : un partage n'est jamais perdu.
 */
internal class ShareSession(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)

    val projects: StateFlow<List<ProjectItem>> = repository.observeProjects()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val tags: StateFlow<List<TagItem>> = repository.observeTags()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    var text by mutableStateOf("")
    var tagUids by mutableStateOf(emptyList<String>())
        private set
    var projectUid by mutableStateOf<String?>(null)

    /** Nom de la tâche proposé par la feuille ; il suit le titre de la page tant que l'utilisateur ne l'a pas modifié. */
    var taskName by mutableStateOf("")
        private set

    private var nameEdited = false
    private var original = ""

    /** Vrai dès qu'un texte est reçu ; une session vide n'écrit rien. */
    var started = false
        private set

    /** Vrai une fois l'écriture lancée. */
    var settled = false
        private set

    fun start(shared: String) {
        if (started) return
        started = true
        original = shared
        text = shared
    }

    /** Le nom saisi à la main : le titre de la page ne le remplace plus. */
    fun renameTask(value: String) {
        nameEdited = true
        taskName = value
    }

    /** Reprend le nom suggéré du texte et du titre de la page, sauf si l'utilisateur l'a écrit. */
    fun followSuggestedName(pageTitle: String?) {
        if (!nameEdited) taskName = suggestedName(pageTitle)
    }

    private fun suggestedName(pageTitle: String?): String = IdeaTasks.taskName(content, pageTitle, ShareCapture.verbs(getApplication()))

    /** Les adresses déjà connues : tâches et projets (lecture locale). */
    suspend fun placesOf(url: String): AddressPlaces = repository.placesOf(url)

    fun toggleTag(uid: String) {
        tagUids = if (uid in tagUids) tagUids - uid else tagUids + uid
    }

    /** Le texte à écrire : celui de la feuille, ou celui reçu s'il a été vidé. */
    val content: String get() = text.trim().ifEmpty { original }

    /** Lance l'écriture de [action] ; rend false si le partage est déjà parti (ou vide). */
    fun settle(action: ShareAction, pageTitle: String?): Boolean {
        if (!started || settled) return false
        settled = true
        val write = ShareCapture.plan(
            action,
            content,
            pageTitle,
            tagUids,
            IdeaTasks.tagNames(tagUids, tags.value),
            projectUid,
            ShareCapture.verbs(getApplication()),
            taskName,
        )
        ShareCapture.save(getApplication(), write)
        return true
    }
}

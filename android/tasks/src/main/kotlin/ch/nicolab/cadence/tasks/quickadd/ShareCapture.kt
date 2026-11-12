package ch.nicolab.cadence.tasks.quickadd

import android.content.Context
import android.content.Intent
import android.widget.Toast
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.IdeaTasks
import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.NoteChange
import ch.nicolab.cadence.tasks.model.TaskDraft
import ch.nicolab.cadence.tasks.model.TaskVerbs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Où va un texte partagé : l'Inbox (d'office), une tâche, une note, ou une page de projet (« Projet… ») quand il porte
 * une adresse.
 */
enum class ShareAction { INBOX, TASK, LINK, NOTE }

/** L'écriture d'un partage ; [text] reste disponible pour le ranger dans l'Inbox si l'écriture choisie échoue. */
sealed interface ShareWrite {
    val text: String

    data class Inbox(override val text: String) : ShareWrite
    data class Task(override val text: String, val draft: TaskDraft) : ShareWrite
    data class Page(override val text: String, val url: String, val title: String?, val note: String?, val projectUid: String) : ShareWrite
    data class Note(override val text: String, val title: String, val content: String) : ShareWrite
}

/** Origine d'une tâche née d'une adresse partagée (`source`, valeur acceptée par le serveur). */
private const val SOURCE_LINK = "link"

/**
 * Texte partagé, sélectionné ou dicté : une feuille au-dessus de l'appli d'origine le range dans l'Inbox, en fait une
 * tâche ou l'enregistre dans les liens. L'écriture (Room, file d'envoi ou appel différé, jamais le réseau) continue
 * hors de l'activité, puis un toast la confirme ; la synchro part plus tard, par WorkManager.
 */
internal object ShareCapture {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Le texte d'un partage (`EXTRA_TEXT`, sinon le sujet) ou d'une sélection ; null s'il est vide. */
    fun sharedText(intent: Intent): String? {
        val raw = when (intent.action) {
            Intent.ACTION_SEND ->
                intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.takeIf { it.isNotBlank() }
                    ?: intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString()
            Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        }
        return raw?.trim()?.ifEmpty { null }
    }

    /** Les verbes des noms de capture, dans la langue de l'appli : « Essayer : … », « Lire : … », « Regarder : … ». */
    fun verbs(context: Context): TaskVerbs = { kind ->
        when (kind) {
            LinkKind.REPO, LinkKind.TOOL -> context.getString(R.string.link_task_try)
            LinkKind.ARTICLE -> context.getString(R.string.link_task_read)
            LinkKind.VIDEO -> context.getString(R.string.link_task_watch)
            LinkKind.OTHER -> null
        }
    }

    /**
     * Ce qu'écrit [action]. La tâche prend [taskName] s'il est saisi, sinon le nom de [IdeaTasks] (titre de la page
     * [pageTitle], verbe du genre de page) ; avec une adresse, elle attend « Quand ? » tant qu'aucun projet n'est
     * choisi, et garde l'adresse comme origine. « Liens » et « Note » sans adresse retombent sur l'Inbox.
     */
    fun plan(
        action: ShareAction,
        text: String,
        pageTitle: String?,
        tagUids: List<String>,
        projectUid: String?,
        verbs: TaskVerbs,
        taskName: String? = null,
    ): ShareWrite = when (action) {
        ShareAction.INBOX -> ShareWrite.Inbox(text)
        ShareAction.TASK -> {
            val url = IdeaTasks.address(text)
            ShareWrite.Task(
                text,
                TaskDraft(
                    name = taskName?.trim()?.ifEmpty { null } ?: IdeaTasks.taskName(text, pageTitle, verbs),
                    note = IdeaTasks.taskNote(text),
                    projectUid = projectUid,
                    tagUids = tagUids.distinct(),
                    needsWhen = url != null && projectUid == null,
                    source = url?.let { SOURCE_LINK },
                    sourceUrl = url,
                ),
            )
        }
        ShareAction.LINK -> {
            val url = IdeaTasks.address(text)
            if (url == null || projectUid == null) {
                ShareWrite.Inbox(text)
            } else {
                ShareWrite.Page(text, url, pageTitle?.trim()?.ifEmpty { null }, IdeaTasks.rest(text).ifEmpty { null }, projectUid)
            }
        }
        ShareAction.NOTE -> {
            val url = IdeaTasks.address(text) ?: return ShareWrite.Inbox(text)
            val title = pageTitle?.trim()?.takeIf { it.isNotEmpty() }
                ?: IdeaTasks.rest(text).ifEmpty { null }
                ?: IdeaTasks.fallbackTitle(url)
            ShareWrite.Note(text, title, IdeaTasks.taskNote(text).orEmpty())
        }
    }

    /** Écrit [write] hors ligne, sans appel réseau : une page est une ligne du projet et une écriture de la synchro. */
    suspend fun write(repository: TaskRepository, write: ShareWrite) {
        when (write) {
            is ShareWrite.Inbox -> repository.captureInbox(write.text)
            is ShareWrite.Task -> repository.createTask(write.draft)
            is ShareWrite.Page -> repository.addProjectPage(write.projectUid, write.url, write.title, write.note)
            is ShareWrite.Note -> repository.saveNote(UUID.randomUUID().toString(), NoteChange(title = write.title, content = write.content))
        }
    }

    /**
     * Écrit [chosen] sans retenir l'appelant. Une tâche ou un lien qui ne s'écrit pas part dans l'Inbox : un partage
     * n'est jamais perdu ; seul un échec de l'Inbox elle-même est dit comme tel.
     */
    fun save(context: Context, chosen: ShareWrite) {
        val app = context.applicationContext
        scope.launch {
            val repository = TasksGraph.repository(app)
            val message = when {
                runCatching { write(repository, chosen) }.isSuccess -> saved(chosen)
                chosen !is ShareWrite.Inbox && runCatching { repository.captureInbox(chosen.text) }.isSuccess -> R.string.tasks_share_saved
                else -> R.string.tasks_share_failed
            }
            withContext(Dispatchers.Main) { Toast.makeText(app, message, Toast.LENGTH_SHORT).show() }
        }
    }

    private fun saved(write: ShareWrite): Int = when (write) {
        is ShareWrite.Inbox -> R.string.tasks_share_saved
        is ShareWrite.Task -> R.string.tasks_share_task_saved
        is ShareWrite.Page -> R.string.tasks_share_page_saved
        is ShareWrite.Note -> R.string.tasks_share_note_saved
    }
}

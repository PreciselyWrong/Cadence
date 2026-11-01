package ch.nicolab.cadence.tasks.quickadd

import android.content.Context
import android.content.Intent
import android.widget.Toast
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Texte partagé, sélectionné ou dicté vers l'Inbox. L'écran qui le reçoit se ferme tout de suite et rend la main
 * à l'application d'origine : l'écriture (Room et file d'envoi, jamais le réseau) continue hors de l'activité,
 * puis le toast la confirme. La synchro part plus tard, par WorkManager.
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

    /** Range [text] dans l'Inbox sans retenir l'appelant ; un échec est dit par un toast plutôt que perdu en silence. */
    fun save(context: Context, text: String) {
        val app = context.applicationContext
        scope.launch {
            val saved = runCatching { TasksGraph.repository(app).captureInbox(text) }.isSuccess
            withContext(Dispatchers.Main) {
                Toast.makeText(app, if (saved) R.string.tasks_share_saved else R.string.tasks_share_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }
}

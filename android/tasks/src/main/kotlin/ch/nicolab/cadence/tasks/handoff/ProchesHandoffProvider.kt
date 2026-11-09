package ch.nicolab.cadence.tasks.handoff

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.util.Log
import ch.nicolab.cadence.domain.handoff.ProchesHandoff
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Fournisseur exporté par lequel Proches remet une tâche (méthode `create_task`, seule méthode utile).
 * Tout autre appelant reçoit `accepted=false` sans que rien ne soit lu ni écrit.
 */
class ProchesHandoffProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        val context = context ?: return refused()
        if (!ProchesCaller.isAuthorized(context, callingPackage)) {
            Log.w(TAG, "Remise refusée : appelant non autorisé")
            return refused()
        }
        if (method != METHOD_CREATE_TASK) return refused()
        val request = ProchesHandoff.request(
            extras?.getString(EXTRA_PROPOSAL_ID),
            extras?.getString(EXTRA_TITLE),
            extras?.getString(EXTRA_DUE_DATE),
        )
        if (request == null) {
            Log.w(TAG, "Remise refusée : demande invalide")
            return refused()
        }
        val accepted = runBlocking {
            withTimeoutOrNull(WRITE_TIMEOUT_MS) {
                ProchesTaskHandoff.store(TasksGraph.repository(context), request)
            }
        } == true
        if (!accepted) Log.w(TAG, "Remise non enregistrée : délai dépassé")
        return Bundle().apply { putBoolean(RESULT_ACCEPTED, accepted) }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri = throw UnsupportedOperationException("Fournisseur en lecture seule")

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

    private fun refused() = Bundle().apply { putBoolean(RESULT_ACCEPTED, false) }

    private companion object {
        const val TAG = "CadenceHandoff"
        const val METHOD_CREATE_TASK = "create_task"
        const val EXTRA_PROPOSAL_ID = "proposal_id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_DUE_DATE = "due_date"
        const val RESULT_ACCEPTED = "accepted"
        const val WRITE_TIMEOUT_MS = 5_000L
    }
}

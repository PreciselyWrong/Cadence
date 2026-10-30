package ch.nicolab.cadence.tasks.widget

import android.content.Context
import android.content.Intent
import android.net.Uri

/** Extra lu par l'écran principal pour ouvrir la tâche désignée. */
const val EXTRA_OPEN_TASK_UID = "open_task_uid"

/**
 * Intent d'ouverture de l'app sur une tâche. La donnée propre à chaque tâche est
 * nécessaire : l'égalité des PendingIntent ignore les extras, donc sans elle deux
 * tâches partageraient le même PendingIntent et l'extra du premier écraserait l'autre.
 */
fun openTaskIntent(context: Context, uid: String): Intent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        putExtra(EXTRA_OPEN_TASK_UID, uid)
        data = Uri.parse("tududi-task://open/$uid")
    }

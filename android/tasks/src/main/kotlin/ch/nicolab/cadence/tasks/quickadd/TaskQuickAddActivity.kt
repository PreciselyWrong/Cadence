package ch.nicolab.cadence.tasks.quickadd

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.tasks.ui.QuickAddSheet

/**
 * Ajout rapide des widgets, de la tuile et du raccourci, affiché au-dessus de l'écran courant. C'est la même
 * saisie que dans l'app ([QuickAddSheet]) : date, `#étiquette`, `+projet` et `!1`-`!3` reconnus et proposés.
 * Reçoit aussi un texte partagé ou sélectionné : il part dans l'Inbox et la fenêtre se ferme aussitôt ([ShareCapture]).
 */
class TaskQuickAddActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (intent.action) {
            Intent.ACTION_SEND, Intent.ACTION_PROCESS_TEXT -> {
                ShareCapture.sharedText(intent)?.let { ShareCapture.save(this, it) }
                finish()
            }
            else -> showQuickAdd(QuickAddTarget.fromAction(intent.action))
        }
    }

    private fun showQuickAdd(target: QuickAddTarget) {
        setContent {
            CadenceTheme {
                QuickAddSheet(onDismiss = { finish() }, targets = target.captureTargets)
            }
        }
    }
}

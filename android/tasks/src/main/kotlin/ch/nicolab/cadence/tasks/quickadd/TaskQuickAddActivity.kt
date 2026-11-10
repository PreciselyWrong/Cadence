package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.links.ProvideCadenceUriHandler
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.tasks.ui.QuickAddSheet
import ch.nicolab.cadence.tasks.ui.ShareSheet

/**
 * Ajout rapide des widgets, de la tuile et du raccourci, affiché au-dessus de l'écran courant. C'est la même
 * saisie que dans l'app ([QuickAddSheet]) : date, `#étiquette`, `+projet` et `!1`-`!3` reconnus et proposés.
 * Reçoit aussi un texte partagé ou sélectionné : la feuille [ShareSheet] le range dans l'Inbox (d'office), en fait
 * une tâche ou l'enregistre dans les liens ; la quitter de n'importe quelle façon le range dans l'Inbox.
 */
class TaskQuickAddActivity : ComponentActivity() {
    internal val share: ShareSession by viewModels()
    private var sharing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (intent.action) {
            Intent.ACTION_SEND, Intent.ACTION_PROCESS_TEXT -> {
                val text = ShareCapture.sharedText(intent)
                if (text == null) {
                    finish()
                    return
                }
                share.start(text)
                sharing = true
                setContent { CadenceTheme { ProvideCadenceUriHandler { ShareSheet(share, onDone = { finish() }) } } }
            }
            else -> showQuickAdd(QuickAddTarget.fromAction(intent.action))
        }
    }

    /** Partir vers une autre appli, l'accueil ou l'écran verrouillé range le partage dans l'Inbox. */
    override fun onStop() {
        super.onStop()
        if (sharing && !isChangingConfigurations) {
            share.settle(ShareAction.INBOX, pageTitle = null)
            finish()
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

package ch.nicolab.cadence.designsystem.components

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * Retour haptique multimodal : réaction immédiate sur l'événement causal.
 * Respecte les réglages système de l'appareil sans permission spéciale.
 */
class CadenceHapticFeedback(private val view: View) {
    /** Clic tactile léger : sélection d'onglet, bascule, action secondaire. */
    fun tap() {
        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    /** Confirmation franche : validation d'habitude, saisie directe, action principale. */
    fun confirm() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        } else {
            view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        }
    }

    /** Pression longue : ouverture des options ou du menu contextuel. */
    fun longPress() {
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    }
}

@Composable
fun rememberCadenceHaptic(): CadenceHapticFeedback {
    val view = LocalView.current
    return remember(view) { CadenceHapticFeedback(view) }
}

package ch.nicolab.cadence.tasks.widget

import android.content.Context
import android.os.SystemClock
import android.util.Log
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/**
 * Coches posées depuis un widget, partagées par toutes les sessions Glance du processus : le
 * widget touché redessine sa ligne cochée avant toute écriture, les autres suivent par [held].
 */
object WidgetCompletions {
    /** La case cochée reste visible avant que la ligne parte ; un widget n'anime rien d'autre. */
    private const val HOLD_MILLIS = 700L

    /** Le temps qu'une session relise la base et retire la ligne, sans repasser par une case vide. */
    private const val GRACE_MILLIS = 1_000L

    private val completion = HeldCompletion(HOLD_MILLIS, GRACE_MILLIS)

    val held: StateFlow<Set<String>> get() = completion.held

    /**
     * Toucher d'une case de widget. [redraw] ne vise que le widget touché : il démarre sa session
     * si elle dort ; les autres widgets suivent la base comme d'habitude. Une erreur d'écriture
     * rend la case sans faire tomber le récepteur.
     */
    suspend fun toggle(context: Context, uid: String, redraw: suspend () -> Unit) {
        val start = SystemClock.uptimeMillis()
        WidgetTrace.log { "tap $uid" }
        try {
            val outcome = completion.toggle(
                uid,
                redraw = {
                    redraw()
                    WidgetTrace.log { "redraw requested +${SystemClock.uptimeMillis() - start} ms" }
                },
                write = {
                    TasksGraph.repository(context).completeTask(it)
                    WidgetTrace.log { "written +${SystemClock.uptimeMillis() - start} ms" }
                },
            )
            WidgetTrace.log { "$outcome +${SystemClock.uptimeMillis() - start} ms" }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(WidgetTrace.TAG, "Widget completion failed", e)
        }
    }
}

/**
 * Mesure du toucher au rendu, muette par défaut :
 * `adb shell setprop log.tag.CadenceWidget DEBUG` puis `adb logcat -s CadenceWidget`.
 */
object WidgetTrace {
    const val TAG = "CadenceWidget"

    inline fun log(message: () -> String) {
        if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, message())
    }
}

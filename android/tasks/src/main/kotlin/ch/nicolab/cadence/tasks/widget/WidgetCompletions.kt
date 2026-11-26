package ch.nicolab.cadence.tasks.widget

import android.content.Context
import android.os.SystemClock
import android.util.Log
import ch.nicolab.cadence.tasks.TasksGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.StateFlow

/**
 * Coches posées depuis un widget, partagées par toutes les sessions Glance du processus : le
 * widget touché redessine sa ligne cochée avant toute écriture, les autres suivent par [held].
 */
object WidgetCompletions {
    /**
     * La case cochée reste visible avant que la ligne parte ; un widget n'anime rien d'autre. Assez
     * long pour la voir cochée et la toucher de nouveau : ce second toucher annule sans rien écrire.
     */
    internal const val HOLD_MILLIS = 2_000L

    /** Le temps qu'une session relise la base et retire la ligne, sans repasser par une case vide. */
    private const val GRACE_MILLIS = 1_000L

    private val completion = HeldCompletion(HOLD_MILLIS, GRACE_MILLIS)

    private val taps = WidgetTaps(CoroutineScope(SupervisorJob() + Dispatchers.Default), completion)

    val held: StateFlow<Set<String>> get() = completion.held

    /**
     * Toucher d'une case de widget, rendu aussitôt ([WidgetTaps]). [redraw] ne vise que le widget
     * touché : il démarre sa session si elle dort ; les autres widgets suivent la base comme
     * d'habitude. Une erreur d'écriture rend la case sans faire tomber le processus.
     */
    fun tap(context: Context, uid: String, redraw: suspend () -> Unit) {
        val start = SystemClock.uptimeMillis()
        WidgetTrace.log { "tap $uid" }
        taps.tap(
            uid,
            redraw = {
                redraw()
                WidgetTrace.log { "redraw requested +${SystemClock.uptimeMillis() - start} ms" }
            },
            write = {
                TasksGraph.repository(context).completeTask(it)
                WidgetTrace.log { "written +${SystemClock.uptimeMillis() - start} ms" }
            },
            done = { outcome -> WidgetTrace.log { "$outcome +${SystemClock.uptimeMillis() - start} ms" } },
        )
    }
}

/**
 * Android livre les touchers d'un widget l'un après l'autre : le suivant n'arrive qu'une fois
 * l'action précédente rendue. Une action qui attendait la fin du maintien et de l'écriture
 * recevait donc le second toucher trop tard pour annuler, et terminait la tâche une seconde fois.
 * La coche part ici dans [scope] et l'action rend la main aussitôt.
 */
class WidgetTaps(private val scope: CoroutineScope, private val completion: HeldCompletion) {
    fun tap(
        uid: String,
        redraw: suspend () -> Unit,
        write: suspend (String) -> Unit,
        done: (HeldCompletion.Outcome) -> Unit = {},
    ) {
        scope.launch {
            try {
                done(completion.toggle(uid, redraw, write))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(WidgetTrace.TAG, "Widget completion failed", e)
            }
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

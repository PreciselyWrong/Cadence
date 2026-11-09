package ch.nicolab.cadence

import android.content.Intent
import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import ch.nicolab.cadence.tasks.quickadd.TaskQuickAddActivity
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Le « + » des widgets ouvre l'ajout rapide : le clavier doit s'ouvrir sans toucher le champ. */
@RunWith(AndroidJUnit4::class)
class QuickAddKeyboardTest {
    @Test
    fun quickAddFromWidgetOpensKeyboard() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val intent = Intent(instrumentation.targetContext, TaskQuickAddActivity::class.java)
        ActivityScenario.launch<TaskQuickAddActivity>(intent).use {
            val deadline = SystemClock.uptimeMillis() + 5_000
            var shown = false
            while (!shown && SystemClock.uptimeMillis() < deadline) {
                shown = imeShown(instrumentation)
                if (!shown) SystemClock.sleep(200)
            }
            assertTrue("le clavier ne s'est pas ouvert", shown)
        }
    }

    private fun imeShown(instrumentation: android.app.Instrumentation): Boolean =
        instrumentation.uiAutomation.executeShellCommand("dumpsys input_method").use { fd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(fd).bufferedReader().readText()
        }.contains("mInputShown=true")
}

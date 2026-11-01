package ch.nicolab.cadence.tasks.reminder

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.w3c.dom.Element

class ReminderManifestTest {
    private fun actionsOf(receiver: String): Set<String> {
        val manifest = File("src/main/AndroidManifest.xml")
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(manifest)
        val receivers = doc.getElementsByTagName("receiver")
        for (i in 0 until receivers.length) {
            val element = receivers.item(i) as Element
            if (element.getAttribute("android:name") != receiver) continue
            val actions = element.getElementsByTagName("action")
            return (0 until actions.length).map { (actions.item(it) as Element).getAttribute("android:name") }.toSet()
        }
        error("récepteur $receiver absent du manifeste")
    }

    @Test
    fun `les alarmes de tâches sont reposées après redémarrage, mise à jour et changement d'heure ou de fuseau`() {
        val actions = actionsOf(".reminder.TaskReminderBootReceiver")

        assertTrue(
            actions.containsAll(
                setOf(
                    "android.intent.action.BOOT_COMPLETED",
                    "android.intent.action.MY_PACKAGE_REPLACED",
                    "android.intent.action.TIME_SET",
                    "android.intent.action.TIMEZONE_CHANGED",
                ),
            ),
            "actions déclarées : $actions",
        )
    }

    @Test
    fun `les alarmes exactes sont demandées et leur changement repose les alarmes`() {
        val manifest = File("src/main/AndroidManifest.xml").readText()

        assertTrue(manifest.contains("android.permission.SCHEDULE_EXACT_ALARM"))
        assertTrue(actionsOf(".reminder.TaskReminderBootReceiver").contains("android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"))
    }
}

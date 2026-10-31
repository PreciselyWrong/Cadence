package ch.nicolab.cadence.reminder

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.w3c.dom.Element

class ReminderManifestTest {
    private fun actionsOf(receiver: String): Set<String> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/AndroidManifest.xml"))
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
    fun `les rappels d'habitudes sont reposés après redémarrage, mise à jour et changement d'heure ou de fuseau`() {
        val actions = actionsOf(".reminder.ReminderBootReceiver")

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
    fun `le récepteur de redémarrage traite toutes les actions déclarées`() {
        assertTrue(ReminderBootReceiver.handles("android.intent.action.MY_PACKAGE_REPLACED"))
        assertTrue(ReminderBootReceiver.handles("android.intent.action.BOOT_COMPLETED"))
        assertTrue(ReminderBootReceiver.handles("android.intent.action.TIME_SET"))
        assertTrue(ReminderBootReceiver.handles("android.intent.action.TIMEZONE_CHANGED"))
        assertFalse(ReminderBootReceiver.handles("android.intent.action.SCREEN_ON"))
        assertFalse(ReminderBootReceiver.handles(null))
    }
}

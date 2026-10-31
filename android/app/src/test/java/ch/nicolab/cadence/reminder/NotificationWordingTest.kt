package ch.nicolab.cadence.reminder

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Une notification n'accuse jamais de retard : le ton reste neutre. */
class NotificationWordingTest {
    private val blamed = Regex("retard|overdue|manqu|raté", RegexOption.IGNORE_CASE)

    @Test
    fun `les textes de notification et de rappel restent neutres`() {
        val resources = File("src/main/res/values").listFiles { f -> f.extension == "xml" }.orEmpty()
        val entry = Regex("<string name=\"([^\"]+)\"[^>]*>([^<]*)</string>")
        val strings = resources.flatMap { file ->
            entry.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
        }.filter { (name, _) -> name.contains("notification") || name.contains("reminder") || name.contains("follow_up") || name.contains("milestone") }
        val sources = File("src/main/java/ch/nicolab/cadence/reminder").listFiles { f -> f.extension == "kt" }.orEmpty()
            .map { it.name to it.readText() }

        val offenders = strings.filter { blamed.containsMatchIn(it.second) }.map { it.first } +
            sources.filter { blamed.containsMatchIn(it.second) }.map { it.first }

        assertEquals(emptyList<String>(), offenders)
    }
}

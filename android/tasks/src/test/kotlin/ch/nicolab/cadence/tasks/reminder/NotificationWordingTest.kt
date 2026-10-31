package ch.nicolab.cadence.tasks.reminder

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Une notification n'accuse jamais de retard : le ton reste neutre. */
class NotificationWordingTest {
    private val blamed = Regex("retard|overdue|manqu|raté", RegexOption.IGNORE_CASE)

    @Test
    fun `les textes de rappel de tâche restent neutres`() {
        val entry = Regex("<string name=\"(tasks_reminder[^\"]*)\"[^>]*>([^<]*)</string>")
        val strings = File("src/main/res/values").listFiles { f -> f.extension == "xml" }.orEmpty()
            .flatMap { file -> entry.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList() }
        val sources = File("src/main/kotlin/ch/nicolab/cadence/tasks/reminder").listFiles { f -> f.extension == "kt" }.orEmpty()
            .map { it.name to it.readText() }

        val offenders = strings.filter { blamed.containsMatchIn(it.second) }.map { it.first } +
            sources.filter { blamed.containsMatchIn(it.second) }.map { it.first }

        assertEquals(emptyList<String>(), offenders)
        check(strings.isNotEmpty()) { "aucun texte de rappel trouvé : le chemin de ressources a changé" }
    }
}

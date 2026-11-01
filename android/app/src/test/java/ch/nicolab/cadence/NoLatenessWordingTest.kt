package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Ton sans culpabilité (docs/fork/WEB-UX-NOTES.md, 2026-10-31) : une tâche passée est « échue »
 * et montre sa date, jamais « en retard » ; aucun écran ne compte le retard.
 */
class NoLatenessWordingTest {
    private val lateness = Regex("""\bretard\b""", RegexOption.IGNORE_CASE)

    @Test fun `user-facing strings never say en retard`() {
        val violations = listOf("src/main/res", "../tasks/src/main/res").flatMap(::resourceFiles).flatMap(::violationsIn)

        assertTrue(violations.isEmpty(), "Remplacer « retard » par une formulation neutre (« Échues ») :\n" + violations.joinToString("\n"))
    }

    private fun resourceFiles(root: String): List<File> =
        File(root).listFiles { file -> file.isDirectory && file.name.startsWith("values") }
            .orEmpty()
            .flatMap { dir -> dir.listFiles { file -> file.extension == "xml" }.orEmpty().toList() }
            .sortedBy { it.path }

    private fun violationsIn(file: File): List<String> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val entries = listOf("string", "item").flatMap { tag ->
            document.getElementsByTagName(tag).let { nodes -> List(nodes.length) { nodes.item(it) } }
        }
        return entries.mapNotNull { node ->
            val text = node.textContent
            if (lateness.containsMatchIn(text)) "${file.path}: ${text.trim()}" else null
        }
    }
}

package ch.nicolab.cadence

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class NoSuiviWordingTest {
    private val singularSuivi = Regex("""\b[Ss]uivi\b""")

    @Test fun `user-facing strings say habitude, never the singular suivi`() {
        val violations = resourceFiles().flatMap(::violationsIn)

        assertTrue(violations.isEmpty(), "Remplacer « suivi » par « habitude » :\n" + violations.joinToString("\n"))
    }

    private fun resourceFiles(): List<File> {
        val resDir = File("src/main/res")
        return resDir.listFiles { file -> file.isDirectory && file.name.startsWith("values") }
            .orEmpty()
            .flatMap { dir -> dir.listFiles { file -> file.extension == "xml" }.orEmpty().toList() }
            .sortedBy { it.path }
    }

    private fun violationsIn(file: File): List<String> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val entries = listOf("string", "item").flatMap { tag ->
            document.getElementsByTagName(tag).let { nodes -> List(nodes.length) { nodes.item(it) } }
        }
        return entries.mapNotNull { node ->
            val text = node.textContent
            if (singularSuivi.containsMatchIn(text)) "${file.path}: ${text.trim()}" else null
        }
    }
}

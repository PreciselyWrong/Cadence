package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MarkdownTest {
    @Test
    fun `les blocs portent l'index de leur premiere ligne`() {
        val blocks = Markdown.parse("# Titre\n\nUn texte\nsur deux lignes\n- [ ] a\n- [x] b\n1. un\n> cite\n---")
        assertEquals(
            listOf(
                MdBlock.Heading(0, 1, "Titre"),
                MdBlock.Paragraph(2, "Un texte\nsur deux lignes"),
                MdBlock.Item(4, 0, null, false, "a"),
                MdBlock.Item(5, 0, null, true, "b"),
                MdBlock.Item(6, 0, 1, null, "un"),
                MdBlock.Quote(7, "cite"),
                MdBlock.Rule(8),
            ),
            blocks,
        )
    }

    @Test
    fun `un bloc de code garde son contenu brut`() {
        val blocks = Markdown.parse("avant\n```\n**pas gras**\n- pas liste\n```\naprès")
        assertEquals(
            listOf(MdBlock.Paragraph(0, "avant"), MdBlock.Code(1, "**pas gras**\n- pas liste"), MdBlock.Paragraph(5, "après")),
            blocks,
        )
    }

    @Test
    fun `l'indentation d'une sous-liste est conservee`() {
        assertEquals(MdBlock.Item(1, 2, null, null, "enfant"), Markdown.parse("- parent\n  - enfant")[1])
    }

    @Test
    fun `gras italique code et barre se combinent`() {
        assertEquals(
            listOf(
                MdRun("a "),
                MdRun("gras", bold = true),
                MdRun(" "),
                MdRun("ital", italic = true),
                MdRun(" "),
                MdRun("c", code = true),
                MdRun(" "),
                MdRun("x", strike = true),
            ),
            Markdown.inline("a **gras** *ital* `c` ~~x~~"),
        )
    }

    @Test
    fun `un souligne dans un mot n'ouvre pas d'italique`() {
        assertEquals(listOf(MdRun("snake_case_name")), Markdown.inline("snake_case_name"))
    }

    @Test
    fun `un marqueur sans fermeture reste du texte`() {
        assertEquals(listOf(MdRun("2 * 3 et **ouvert")), Markdown.inline("2 * 3 et **ouvert"))
    }

    @Test
    fun `un lien markdown garde son libelle et sa cible`() {
        assertEquals(
            listOf(MdRun("voir "), MdRun("la doc", link = "https://a.example/d"), MdRun(".")),
            Markdown.inline("voir [la doc](https://a.example/d)."),
        )
    }

    @Test
    fun `un lien nu devient cliquable sans sa ponctuation finale`() {
        assertEquals(
            listOf(MdRun("va sur "), MdRun("https://a.example/x", link = "https://a.example/x"), MdRun(", puis")),
            Markdown.inline("va sur https://a.example/x, puis"),
        )
    }

    @Test
    fun `un echappement affiche le caractere`() {
        assertEquals(listOf(MdRun("*pas italique*")), Markdown.inline("\\*pas italique\\*"))
    }

    @Test
    fun `l'apercu supprime la syntaxe et marque les cases`() {
        val preview = Markdown.preview("# Courses\n- [x] **lait**\n- [ ] pain\n\nfin", maxLines = 3)
        assertEquals("Courses\n☑ lait\n☐ pain", preview)
    }

    @Test
    fun `cocher une case change seulement cette ligne`() {
        val content = "# T\n- [ ] a\n- [ ] b"
        assertEquals("# T\n- [x] a\n- [ ] b", MarkdownCheckbox.toggle(content, 1))
        assertEquals("# T\n- [ ] a\n- [ ] b", MarkdownCheckbox.toggle("# T\n- [x] a\n- [ ] b", 1))
        assertEquals("# T\n- [ ] a\n- [x] b", MarkdownCheckbox.toggle(content, 2))
    }

    @Test
    fun `cocher une ligne sans case laisse le contenu intact`() {
        val content = "# T\n- puce\ntexte"
        assertEquals(content, MarkdownCheckbox.toggle(content, 0))
        assertEquals(content, MarkdownCheckbox.toggle(content, 1))
        assertEquals(content, MarkdownCheckbox.toggle(content, 9))
    }

    @Test
    fun `cocher garde indentation, marqueur et fins de ligne windows`() {
        assertEquals("  * [x] sous\r\nfin", MarkdownCheckbox.toggle("  * [ ] sous\r\nfin", 0))
        assertEquals("  * [ ] sous\r\nfin", MarkdownCheckbox.toggle("  * [X] sous\r\nfin", 0))
    }
}

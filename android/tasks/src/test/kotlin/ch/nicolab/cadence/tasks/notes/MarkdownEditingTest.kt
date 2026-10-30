package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class MarkdownEditingTest {
    private fun enter(text: String, cursor: Int): TextEdit? {
        val before = TextEdit(text, cursor)
        val after = TextEdit(text.substring(0, cursor) + "\n" + text.substring(cursor), cursor + 1)
        return MarkdownEditing.continueList(before, after)
    }

    @Test
    fun `entree sur une case amorce la case suivante`() {
        assertEquals(TextEdit("- [x] a\n- [ ] ", 14), enter("- [x] a", 7))
    }

    @Test
    fun `entree sur une liste numerotee incremente le numero`() {
        assertEquals(TextEdit("3. trois\n4. ", 12), enter("3. trois", 8))
    }

    @Test
    fun `entree sur une puce indentee garde l'indentation`() {
        assertEquals(TextEdit("  - a\n  - ", 10), enter("  - a", 5))
    }

    @Test
    fun `entree sur un element vide termine la liste`() {
        assertEquals(TextEdit("- a\n", 4), enter("- a\n- ", 6))
        assertEquals(TextEdit("", 0), enter("- [ ] ", 6))
    }

    @Test
    fun `entree hors liste n'est pas corrigee`() {
        assertNull(enter("simple texte", 12))
    }

    @Test
    fun `une autre modification que le retour a la ligne n'est pas corrigee`() {
        assertNull(MarkdownEditing.continueList(TextEdit("- a", 3), TextEdit("- ab", 4)))
    }

    @Test
    fun `le prefixe s'ajoute, se remplace puis se retire`() {
        assertEquals(TextEdit("- [ ] a", 7), MarkdownEditing.togglePrefix(TextEdit("a", 1), "- [ ] "))
        assertEquals(TextEdit("- a", 3), MarkdownEditing.togglePrefix(TextEdit("- [ ] a", 7), "- "))
        assertEquals(TextEdit("a", 1), MarkdownEditing.togglePrefix(TextEdit("- a", 3), "- "))
    }

    @Test
    fun `le prefixe ne touche que la ligne du curseur`() {
        assertEquals(TextEdit("x\n# t\ny", 5), MarkdownEditing.togglePrefix(TextEdit("x\nt\ny", 3), "# "))
    }

    @Test
    fun `entourer une selection ou inserer une paire`() {
        assertEquals(TextEdit("a **b** c", 4, 5), MarkdownEditing.wrap(TextEdit("a b c", 2, 3), "**"))
        assertEquals(TextEdit("a **** c", 4), MarkdownEditing.wrap(TextEdit("a  c", 2), "**"))
    }
}

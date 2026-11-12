package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class OutlineInputTest {
    private fun at(marked: String): TextEdit {
        val from = marked.indexOf('|')
        return TextEdit(marked.replace("|", ""), from)
    }

    private fun show(edit: TextEdit?): String? = edit?.let { it.text.substring(0, it.selStart) + "|" + it.text.substring(it.selStart) }

    @Test
    fun `entree tapee coupe la puce`() {
        assertEquals("- hello\n- |world", show(OutlineInput.interpret(at("- hello |world"), at("- hello \n|world"))))
    }

    @Test
    fun `entree avec la fin d'un mot valide d'un coup`() {
        assertEquals("- hello\n- |", show(OutlineInput.interpret(at("- hel|"), at("- hello\n|"))))
    }

    @Test
    fun `entree devant un retour a la ligne existant`() {
        assertEquals("- a\n- |\n- b", show(OutlineInput.interpret(at("- a|\n- b"), at("- a\n|\n- b"))))
    }

    @Test
    fun `entree hors du plan reste telle quelle`() {
        assertNull(OutlineInput.interpret(at("# Titre|"), at("# Titre\n|")))
    }

    @Test
    fun `retour arriere au debut d'une puce la fusionne`() {
        assertEquals("- a|b", show(OutlineInput.interpret(at("- a\n  - |b"), at("- a\n  -|b"))))
    }

    @Test
    fun `retour arriere sans effet sur une puce a enfants`() {
        assertEquals("- x\n- |a\n  - c", show(OutlineInput.interpret(at("- x\n- |a\n  - c"), at("- x\n-|a\n  - c"))))
    }

    @Test
    fun `retour arriere ordinaire dans le texte`() {
        assertNull(OutlineInput.interpret(at("- ab|"), at("- a|")))
    }

    @Test
    fun `frappe sur une ligne vide commence une puce`() {
        assertEquals("- a|", show(OutlineInput.interpret(at("|"), at("a|"))))
        assertNull(OutlineInput.interpret(at("|"), at("#|")))
        assertNull(OutlineInput.interpret(at("- a|"), at("- ab|")))
    }

    @Test
    fun `les replis suivent les lignes deplacees par une saisie`() {
        val before = "- a\n- b\n  - b1"
        // Entrée à la fin de « - a » : la puce b descend d'une ligne.
        assertEquals(setOf(2), OutlineInput.mapFoldedLines(before, "- a\n- \n- b\n  - b1", setOf(1), caret = 3))
        // Saisie dans la puce repliée elle-même : elle reste repliée.
        assertEquals(setOf(1), OutlineInput.mapFoldedLines(before, "- a\n- bx\n  - b1", setOf(1), caret = 7))
        // Ligne effacée : le repli disparaît.
        assertEquals(emptySet<Int>(), OutlineInput.mapFoldedLines(before, "- a\n  - b1", setOf(1), caret = 7))
    }

    @Test
    fun `cles et lignes des replis`() {
        val doc = "- a\n  - a1\n- b"
        assertEquals(listOf("a#0"), OutlineInput.keysOfLines(doc, setOf(0, 2)))
        assertEquals(setOf(2), OutlineInput.linesOfKeys("- b\n- x\n- a\n  - a1", listOf("a#0")))
    }

    @Test
    fun `intervalles caches sans les replis imbriques`() {
        val doc = "- a\n  - a1\n    - a2\n- b"
        assertEquals(listOf(3..19), OutlineInput.hiddenRanges(doc, setOf(0, 1)))
        assertEquals(0, OutlineInput.foldHiding(doc, setOf(0), 8))
        assertNull(OutlineInput.foldHiding(doc, setOf(0), 3))
    }

    @Test
    fun `affichage des replis et passage des positions`() {
        val doc = "- a\n  - a1\n- b"
        val mapping = FoldMapping(listOf(3..10))
        assertEquals("- a …\n- b", mapping.transform(doc))
        assertEquals(3, mapping.toTransformed(3))
        assertEquals(3, mapping.toTransformed(7))
        assertEquals(5, mapping.toTransformed(10))
        assertEquals(7, mapping.toTransformed(12))
        assertEquals(3, mapping.toOriginal(4))
        assertEquals(10, mapping.toOriginal(5))
        assertEquals(12, mapping.toOriginal(7))
    }

    @Test
    fun `choix des personnes et des notes au fil de la frappe`() {
        assertEquals(OutlineInput.Trigger(OutlineInput.Trigger.Kind.MENTION, "an", 4, 7), OutlineInput.trigger(at("- a @an|")))
        assertNull(OutlineInput.trigger(at("mail bob@ex|")))
        assertEquals(OutlineInput.Trigger(OutlineInput.Trigger.Kind.NOTE, "Voy", 0, 7), OutlineInput.trigger(at("[[Voy|]]")))
        assertNull(OutlineInput.trigger(at("[[task:Ap|")))
    }

    @Test
    fun `une mention remplace le mot tape`() {
        val sel = at("voir @an| demain")
        val trigger = OutlineInput.trigger(sel)!!
        assertEquals("voir @[Ann](person:abc) | demain", show(OutlineInput.complete(sel, trigger, OutlineInput.mentionToken("Ann", "abc"))))
        assertEquals("@[A B](person:x)", OutlineInput.mentionToken("A[B]", "x").replace("  ", " "))
    }
}

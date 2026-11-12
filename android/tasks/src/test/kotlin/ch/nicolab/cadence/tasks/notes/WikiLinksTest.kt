package ch.nicolab.cadence.tasks.notes

import ch.nicolab.cadence.tasks.model.NoteItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class WikiLinksTest {
    private val notes = listOf(NoteItem("a", "Projet Alpha", ""), NoteItem("b", "Idées", ""))

    @Test
    fun `un lien entre doubles crochets donne son titre rogné et où il finit`() {
        val text = "voir [[ Projet Alpha ]] ici"
        val found = WikiLinks.at(text, 5)

        assertEquals("Projet Alpha", found?.title)
        assertEquals(" ici", text.substring(found!!.end))
    }

    @Test
    fun `un titre vide, non fermé, sur deux lignes ou imbriqué n'est pas un lien`() {
        assertNull(WikiLinks.at("[[ ]]", 0))
        assertNull(WikiLinks.at("[[abc", 0))
        assertNull(WikiLinks.at("[[un\ndeux]]", 0))
        assertNull(WikiLinks.at("[[a [[b]]", 0))
    }

    @Test
    fun `la note se trouve par titre sans tenir compte de la casse`() {
        assertEquals("a", WikiLinks.findNote("projet alpha", notes)?.uid)
        assertEquals("b", WikiLinks.findNote(" IDÉES ", notes)?.uid)
        assertNull(WikiLinks.findNote("Inconnue", notes))
    }

    @Test
    fun `le markdown rend un lien entre crochets comme un segment à part`() {
        val runs = Markdown.inline("Voir [[Projet Alpha]] ici")

        assertEquals(listOf("Voir ", "Projet Alpha", " ici"), runs.map { it.text })
        assertEquals(listOf(null, "Projet Alpha", null), runs.map { it.wiki })
    }

    @Test
    fun `un lien de tâche vise la tâche ouverte de ce nom avant une terminée`() {
        val done = ch.nicolab.cadence.tasks.model.TaskItem("t1", "Acheter du pain", status = ch.nicolab.cadence.tasks.model.TaskStatus.DONE)
        val open = ch.nicolab.cadence.tasks.model.TaskItem("t2", " acheter du PAIN ")
        org.junit.jupiter.api.Assertions.assertEquals("t2", WikiLinks.findTask("Acheter du pain", listOf(done, open))?.uid)
        org.junit.jupiter.api.Assertions.assertEquals("t1", WikiLinks.findTask("acheter du pain", listOf(done))?.uid)
        org.junit.jupiter.api.Assertions.assertNull(WikiLinks.findTask("Lait", listOf(done, open)))
    }
}

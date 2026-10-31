package ch.nicolab.cadence.tasks.ui

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class EventDescriptionTest {

    @Test
    fun `un texte brut reste tel quel`() {
        assertEquals("Ordre du jour :\n- budget", EventDescription.plain("Ordre du jour :\n- budget"))
    }

    @Test
    fun `les sauts de ligne HTML deviennent des retours à la ligne`() {
        assertEquals("a\nb\n\nc", EventDescription.plain("a<br>b<br/><br />c"))
        assertEquals("un\ndeux", EventDescription.plain("<p>un</p><p>deux</p>"))
    }

    @Test
    fun `les listes gardent leurs puces et les entités sont décodées`() {
        assertEquals("• pain\n• lait & œufs", EventDescription.plain("<ul><li>pain</li><li>lait &amp; œufs</li></ul>"))
        assertEquals("a b <c>", EventDescription.plain("a&nbsp;b &lt;c&gt;"))
    }

    @Test
    fun `un lien HTML garde son adresse pour l'aperçu`() {
        assertEquals("Visio https://meet.exemple.ch/x", EventDescription.plain("""<a href="https://meet.exemple.ch/x">Visio</a>"""))
        assertEquals("https://meet.exemple.ch/x", EventDescription.plain("""<a href="https://meet.exemple.ch/x">https://meet.exemple.ch/x</a>"""))
    }

    @Test
    fun `vide ou blanc donne null`() {
        assertNull(EventDescription.plain(null))
        assertNull(EventDescription.plain("  <br>  "))
    }
}

package ch.nicolab.cadence.tasks.notes

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NoteAutosaveTest {
    @Test
    fun `des saisies rapprochees ne produisent qu'une sauvegarde apres le delai`() = runTest {
        val saved = mutableListOf<String>()
        val saver = Autosaver<String>(backgroundScope, 800) { saved += it }
        saver.submit("a")
        advanceTimeBy(500)
        saver.submit("ab")
        advanceTimeBy(500)
        runCurrent()
        assertEquals(emptyList<String>(), saved)
        advanceTimeBy(301)
        runCurrent()
        assertEquals(listOf("ab"), saved)
    }

    @Test
    fun `flush envoie tout de suite la derniere valeur une seule fois`() = runTest {
        val saved = mutableListOf<String>()
        val saver = Autosaver<String>(backgroundScope, 800) { saved += it }
        saver.submit("a")
        saver.submit("abc")
        saver.flush()
        assertEquals(listOf("abc"), saved)
        advanceTimeBy(2_000)
        runCurrent()
        saver.flush()
        assertEquals(listOf("abc"), saved)
    }

    @Test
    fun `la session n'envoie que les champs modifies`() {
        val session = NoteEditSession(NoteFields("T", "C"))
        assertNull(session.pending())
        session.edit(content = "C2")
        assertEquals(NotePatch(content = "C2"), session.pending())
        session.edit(title = "T2")
        assertEquals(NotePatch(title = "T2", content = "C2"), session.pending())
        session.markSaved(NotePatch(title = "T2", content = "C2"))
        assertNull(session.pending())
    }

    @Test
    fun `l'echo d'une sauvegarde ne retire pas ce qui a ete tape depuis`() {
        val session = NoteEditSession(NoteFields("", ""))
        session.edit(content = "ab")
        val sent = session.pending()!!
        session.edit(content = "abc")
        assertEquals(NoteFields("", "abc"), session.merge(NoteFields("", "ab")))
        session.markSaved(sent)
        assertEquals(NotePatch(content = "abc"), session.pending())
    }

    @Test
    fun `un champ intact suit la base, un champ modifie garde la saisie`() {
        val session = NoteEditSession(NoteFields("T", "C"))
        session.edit(content = "local")
        val shown = session.merge(NoteFields("Titre serveur", "Contenu serveur"))
        assertEquals(NoteFields("Titre serveur", "local"), shown)
        assertEquals(NotePatch(content = "local"), session.pending())
    }

    @Test
    fun `une saisie rejoignant la base n'est plus en attente`() {
        val session = NoteEditSession(NoteFields("T", "C"))
        session.edit(content = "même")
        session.merge(NoteFields("T", "même"))
        assertNull(session.pending())
    }
}

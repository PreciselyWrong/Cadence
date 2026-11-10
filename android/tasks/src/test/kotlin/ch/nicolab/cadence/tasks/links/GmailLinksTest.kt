package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class GmailLinksTest {
    @Test
    fun `un lien de recherche Gmail donne sa recherche decodee`() {
        assertEquals(
            GmailLink("rfc822msgid:abc.123@exemple.ch"),
            GmailLinks.parse("https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc.123%40exemple.ch"),
        )
        assertEquals(
            GmailLink("from:ajerco tarifaire"),
            GmailLinks.parse("https://mail.google.com/mail/?authuser=moi@exemple.ch#search/from%3Aajerco+tarifaire"),
        )
    }

    @Test
    fun `un lien vers un fil Gmail n'a pas de recherche`() {
        assertEquals(GmailLink(null), GmailLinks.parse("https://mail.google.com/mail/?authuser=moi@exemple.ch#all/1a08a6bbd756318a"))
        assertEquals(GmailLink(null), GmailLinks.parse("https://mail.google.com/mail/u/0/#inbox"))
    }

    @Test
    fun `les autres liens ne sont pas Gmail`() {
        assertNull(GmailLinks.parse("https://exemple.ch/#search/x"))
        assertNull(GmailLinks.parse("https://calendar.google.com/calendar/u/0/r"))
        assertNull(GmailLinks.parse("mailto:anna@exemple.ch"))
    }

    @Test
    fun `un lien de recherche dans une note markdown est reconnu en entier`() {
        val note = "[Fil d'origine](https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc%40exemple.ch)"
        val url = TextLinks.matches(note).single().url
        assertEquals(GmailLink("rfc822msgid:abc@exemple.ch"), GmailLinks.parse(url))
    }
}

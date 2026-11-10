package ch.nicolab.cadence.tasks.links

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class GmailLinksTest {
    private val mobile = "https://mail.google.com/mail/mu/mp/"

    @Test
    fun `un lien vers un fil ouvre ce fil dans Gmail mobile`() {
        assertEquals(
            "$mobile?authuser=moi@exemple.ch#cv/priority/%5Esmartlabel_personal/1a08a6bbd756318a",
            GmailLinks.mobileUrl("https://mail.google.com/mail/?authuser=moi@exemple.ch#all/1a08a6bbd756318a"),
        )
        assertEquals(
            "$mobile#cv/priority/%5Esmartlabel_personal/18f2c0ffee123456",
            GmailLinks.mobileUrl("https://mail.google.com/mail/u/0/#inbox/18f2c0ffee123456"),
        )
    }

    @Test
    fun `un lien de recherche ouvre la recherche dans Gmail mobile`() {
        assertEquals(
            "$mobile#tl/search/from%3Aajerco+tarifaire",
            GmailLinks.mobileUrl("https://mail.google.com/mail/u/0/#search/from%3Aajerco+tarifaire"),
        )
    }

    @Test
    fun `un autre lien Gmail ouvre Gmail mobile`() {
        assertEquals(mobile, GmailLinks.mobileUrl("https://mail.google.com/mail/u/0/#inbox"))
        assertEquals(mobile, GmailLinks.mobileUrl("https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWDsKmLtbcxyz"))
    }

    @Test
    fun `les autres liens ne sont pas Gmail`() {
        assertNull(GmailLinks.mobileUrl("https://exemple.ch/#all/1a08a6bbd756318a"))
        assertNull(GmailLinks.mobileUrl("https://calendar.google.com/calendar/u/0/r"))
        assertNull(GmailLinks.mobileUrl("mailto:anna@exemple.ch"))
    }

    @Test
    fun `un lien Gmail dans une note markdown est reconnu en entier`() {
        val note = "[Fil d'origine](https://mail.google.com/mail/?authuser=moi@exemple.ch#all/1a08a6bbd756318a)"
        val url = TextLinks.matches(note).single().url
        assertEquals(
            "$mobile?authuser=moi@exemple.ch#cv/priority/%5Esmartlabel_personal/1a08a6bbd756318a",
            GmailLinks.mobileUrl(url),
        )
    }
}

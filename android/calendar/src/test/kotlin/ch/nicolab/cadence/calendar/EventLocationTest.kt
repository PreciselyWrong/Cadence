package ch.nicolab.cadence.calendar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EventLocationTest {
    @Test
    fun `un lien web n'est pas une adresse`() {
        assertTrue(EventLocation.isWebLink("https://meet.example.com/abc-def"))
        assertTrue(EventLocation.isWebLink("  http://exemple.ch/salle  "))
        assertFalse(EventLocation.isWebLink("Rue du Lac 4, 1800 Vevey"))
        assertFalse(EventLocation.isWebLink("https://exemple.ch et la salle 2"))
        assertFalse(EventLocation.isWebLink("www.exemple.ch"))
    }

    @Test
    fun `l'URI geo encode l'adresse sans le signe plus pour les espaces`() {
        assertEquals(
            "geo:0,0?q=Rue%20du%20Lac%204%2C%201800%20Vevey",
            EventLocation.geoUri("Rue du Lac 4, 1800 Vevey"),
        )
    }

    @Test
    fun `le repli web encode la requête de recherche Maps`() {
        assertEquals(
            "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%26%20Bar",
            EventLocation.mapsSearchUrl("Café & Bar"),
        )
    }
}

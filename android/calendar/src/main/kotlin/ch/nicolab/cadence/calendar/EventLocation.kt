package ch.nicolab.cadence.calendar

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Lieu d'un événement : lien web (réunion) ou adresse à montrer dans une application de cartes. */
object EventLocation {
    private val webLink = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE)

    /** Vrai si le lieu n'est qu'une adresse web : il s'ouvre tel quel dans le navigateur. */
    fun isWebLink(location: String): Boolean = webLink.matches(location.trim())

    /** Intention `geo:` lue par l'application de cartes par défaut. */
    fun geoUri(address: String): String = "geo:0,0?q=${encode(address)}"

    /** Recherche Google Maps dans le navigateur, quand aucune application ne prend `geo:`. */
    fun mapsSearchUrl(address: String): String =
        "https://www.google.com/maps/search/?api=1&query=${encode(address)}"

    // URLEncoder écrit « + » pour l'espace, que les URI geo et Maps ne lisent pas toujours comme tel.
    private fun encode(text: String): String =
        URLEncoder.encode(text.trim(), StandardCharsets.UTF_8).replace("+", "%20")
}

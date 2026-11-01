package ch.nicolab.cadence.calendar

import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Lieu d'un événement : lien web (réunion) ou adresse à montrer dans une application de cartes. */
object EventLocation {
    private val webLink = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE)
    private val urlInText = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)
    private val meetingHost = Regex(
        """^(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com|([a-z0-9-]+\.)?webex\.com)$""",
        RegexOption.IGNORE_CASE,
    )

    /** Vrai si le lieu n'est qu'une adresse web : il s'ouvre tel quel dans le navigateur. */
    fun isWebLink(location: String): Boolean = webLink.matches(location.trim())

    /** Premier lien Meet, Zoom, Teams ou Webex du lieu, sinon de la description ; null sans lien de visio. */
    fun meetingLink(location: String?, description: String?): String? =
        meetingUrlIn(location.orEmpty()) ?: meetingUrlIn(description.orEmpty())

    private fun meetingUrlIn(text: String): String? = urlInText.findAll(text)
        .map { it.value.trimEnd('.', ',', ';', ':', '!', '?', ')') }
        .firstOrNull { url -> runCatching { URI(url).host }.getOrNull()?.let(meetingHost::matches) == true }

    /** Intention `geo:` lue par l'application de cartes par défaut. */
    fun geoUri(address: String): String = "geo:0,0?q=${encode(address)}"

    /** Recherche Google Maps dans le navigateur, quand aucune application ne prend `geo:`. */
    fun mapsSearchUrl(address: String): String =
        "https://www.google.com/maps/search/?api=1&query=${encode(address)}"

    // URLEncoder écrit « + » pour l'espace, que les URI geo et Maps ne lisent pas toujours comme tel.
    private fun encode(text: String): String =
        URLEncoder.encode(text.trim(), StandardCharsets.UTF_8).replace("+", "%20")
}

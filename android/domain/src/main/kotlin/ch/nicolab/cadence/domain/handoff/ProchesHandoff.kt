package ch.nicolab.cadence.domain.handoff

import java.time.LocalDate
import java.util.UUID

/** Demande de tâche envoyée par Proches, déjà validée. */
data class HandoffRequest(val proposalId: String, val title: String, val dueDate: LocalDate)

/**
 * Règles pures de la remise de tâche depuis Proches : identité de l'appelant attendue et validation de la demande.
 * La vérification de la signature Android se fait dans `:tasks` ; ici ne vit que ce qui se teste sans appareil.
 */
object ProchesHandoff {
    const val PACKAGE = "ch.nicolab.proches"

    /** SHA-256 du certificat de signature de Proches, en hexadécimal minuscule sans deux-points. */
    const val ALLOWED_CERTIFICATE_SHA256 = "a67a939e077c87e0ab78f36b21e1469af33a14d03d55fd559df980279471b1e0"

    const val MAX_TITLE_LENGTH = 200
    const val MAX_PROPOSAL_ID_LENGTH = 100

    private val isoDate = Regex("""\d{4}-\d{2}-\d{2}""")

    /** Uid stable d'une tâche : une même proposition donne toujours le même uid, donc une seule tâche. */
    fun taskUid(proposalId: String): String =
        UUID.nameUUIDFromBytes("proches-handoff:$proposalId".toByteArray(Charsets.UTF_8)).toString()

    /** Compare sans tenir compte de la casse ni des deux-points (format de `keytool`, `apksigner`). */
    fun isAllowedCertificate(sha256: String): Boolean =
        normalizeCertificate(sha256) == ALLOWED_CERTIFICATE_SHA256

    /** Toutes les signatures de l'appelant doivent être autorisées, et il en faut au moins une. */
    fun allSignersAllowed(sha256s: List<String>): Boolean =
        sha256s.isNotEmpty() && sha256s.all(::isAllowedCertificate)

    /** Valide la demande ; null si un champ manque ou sort des bornes. */
    fun request(proposalId: String?, title: String?, dueDate: String?): HandoffRequest? {
        if (proposalId.isNullOrBlank() || proposalId.length > MAX_PROPOSAL_ID_LENGTH) return null
        val cleanTitle = title?.trim()
        if (cleanTitle.isNullOrEmpty() || cleanTitle.length > MAX_TITLE_LENGTH) return null
        if (dueDate == null || !isoDate.matches(dueDate)) return null
        val date = runCatching { LocalDate.parse(dueDate) }.getOrNull() ?: return null
        return HandoffRequest(proposalId, cleanTitle, date)
    }

    private fun normalizeCertificate(sha256: String): String =
        sha256.replace(":", "").lowercase()
}

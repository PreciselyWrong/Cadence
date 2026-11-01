package ch.nicolab.cadence.tasks.sync

import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.PortUnreachableException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Le serveur n'a pas pu être atteint : rien n'est revenu de lui. Une réponse, même d'erreur (HTTP, page HTML,
 * certificat présenté), prouve au contraire qu'il est joignable et ne doit jamais se lire « injoignable ».
 */
internal fun isUnreachable(error: Throwable): Boolean = when (error) {
    is HttpError, is ProtocolError, is ResetRequired, is SSLException -> false
    is UnknownHostException, is ConnectException, is NoRouteToHostException,
    is PortUnreachableException, is SocketTimeoutException -> true
    is IOException -> true
    else -> false
}

/** Message montré à la personne : ce qui s'est passé, avec le code HTTP quand il y en a un. */
internal fun describeFailure(error: Throwable): String = when (error) {
    is HttpError -> describeHttp(error)
    is ProtocolError -> "Réponse inattendue du serveur : est-ce bien Cadence à cette adresse ?"
    is ResetRequired -> "Le serveur demande une resynchronisation complète ; nouvel essai bientôt"
    is SSLException -> "Connexion sécurisée refusée (certificat du serveur)"
    is UnknownHostException -> "Adresse du serveur introuvable"
    is SocketTimeoutException -> "Le serveur ne répond pas (délai dépassé)"
    is ConnectException, is NoRouteToHostException, is PortUnreachableException -> "Serveur injoignable"
    is AuthError -> "Clé API refusée"
    is IOException -> "Erreur réseau" + (error.message?.let { " : $it" } ?: "")
    else -> "Erreur de synchronisation" + (error.message?.let { " : $it" } ?: "")
}

private fun describeHttp(error: HttpError): String {
    val detail = error.error?.let { " : $it" } ?: ""
    return when {
        error.code == 404 -> "Le serveur ne connaît pas cette requête (HTTP 404) : est-il à jour ?"
        error.code == 429 -> "Trop de requêtes, nouvel essai dans quelques minutes (HTTP 429)"
        error.code == 408 || error.code == 504 -> "Le serveur a mis trop de temps à répondre (HTTP ${error.code})"
        error.code == 502 || error.code == 503 -> "Serveur indisponible pour le moment (HTTP ${error.code})"
        error.code >= 500 -> "Erreur du serveur (HTTP ${error.code}$detail)"
        else -> "Requête refusée par le serveur (HTTP ${error.code}$detail)"
    }
}

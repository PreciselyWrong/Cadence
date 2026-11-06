package ch.nicolab.cadence.tasks.model

/** Où lire une bannière de projet, et si la clé d'API peut accompagner la requête. */
data class ProjectImageSource(val url: String, val sendToken: Boolean)

object ProjectImage {
    /**
     * `image_url` vient du serveur mais peut être posé par MCP avec n'importe quelle valeur :
     * seul un chemin de ce serveur reçoit la clé, une image hébergée ailleurs est lue sans elle.
     */
    fun source(serverUrl: String, imageUrl: String?): ProjectImageSource? {
        val image = imageUrl?.trim().orEmpty()
        return when {
            image.startsWith("http://") || image.startsWith("https://") -> ProjectImageSource(image, sendToken = false)
            image.startsWith("/") && !image.startsWith("//") && '\\' !in image ->
                ProjectImageSource(serverUrl.trimEnd('/') + image, sendToken = true)
            else -> null
        }
    }
}

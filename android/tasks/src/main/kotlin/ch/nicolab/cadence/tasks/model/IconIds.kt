package ch.nicolab.cadence.tasks.model

/** Identifiant d'icône du jeu partagé, au format que le serveur accepte (`utils/icon-validation.js`) : `home`, `smoke-free`. */
object IconIds {
    private const val MAX_LENGTH = 40
    private val KEBAB = Regex("[a-z0-9]+(-[a-z0-9]+)*")

    /** Null et vide retirent l'icône ; tout autre valeur doit être un identifiant valide. */
    fun isValid(icon: String?): Boolean = icon.isNullOrEmpty() || (icon.length <= MAX_LENGTH && KEBAB.matches(icon))

    /** La valeur à écrire : null pour retirer l'icône. */
    fun normalize(icon: String?): String? = icon?.takeIf { it.isNotEmpty() }
}

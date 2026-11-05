package ch.nicolab.cadence.tasks.notes

/** Champ qui reçoit le clavier quand l'éditeur de note passe en saisie. */
enum class NoteFocus {
    TITLE,
    BODY,
    ;

    companion object {
        /**
         * À la première saisie, le titre seulement s'il manque : une note née de l'ajout rapide a déjà le sien et
         * s'écrit tout de suite. Repasser en saisie ([firstFocus] faux) vise le contenu qu'on vient de toucher.
         */
        fun onOpen(exists: Boolean, title: String, firstFocus: Boolean): NoteFocus = when {
            !firstFocus -> BODY
            !exists || title.isBlank() -> TITLE
            else -> BODY
        }
    }
}

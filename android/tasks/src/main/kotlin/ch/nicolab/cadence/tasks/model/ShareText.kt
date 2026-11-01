package ch.nicolab.cadence.tasks.model

/** Texte partagé ou copié depuis une tâche, une note ou un lien : sans Android, pour les tests. */
object ShareText {
    /** Titre, puis la note après une ligne vide ; une note vide ou blanche ne laisse que le titre. */
    fun withNote(title: String, note: String?): String {
        val head = title.trim()
        val body = note?.trim().orEmpty()
        return if (body.isEmpty()) head else "$head\n\n$body"
    }

    /** Titre et adresse ; sans titre, seulement l'adresse. */
    fun link(title: String?, url: String): String {
        val head = title?.trim().orEmpty()
        return if (head.isEmpty()) url else "$head\n$url"
    }
}

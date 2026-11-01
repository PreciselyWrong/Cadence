package ch.nicolab.cadence.tasks.model

/** Titre de la fiche : un titre long reçoit un style plus petit, et s'affiche en entier (sans plafond de lignes). */
object DetailTitle {
    const val LONG_FROM_CHARS = 60

    fun isLong(title: String): Boolean = title.trim().length > LONG_FROM_CHARS
}

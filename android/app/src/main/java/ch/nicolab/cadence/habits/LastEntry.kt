package ch.nicolab.cadence.habits

/**
 * Dernière saisie enregistrée dans cette session, avec son habitude : « Annuler la dernière saisie »
 * dans la feuille d'une habitude ne doit jamais retirer la saisie d'une autre habitude.
 */
data class LastEntry(val entryId: String, val habitId: String) {
    /** L'identifiant à retirer depuis la feuille de [habitId], ou null si la saisie n'est pas la sienne. */
    fun undoableFor(habitId: String): String? = entryId.takeIf { this.habitId == habitId }
}

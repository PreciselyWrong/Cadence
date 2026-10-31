package ch.nicolab.cadence.tasks.swipe

/**
 * Une ligne d'événement d'agenda se comporte comme une tâche pour ce que Cadence peut faire sans
 * jamais écrire dans le fournisseur d'agendas : cocher (état local) et masquer (local aussi).
 * Planifier, déplacer ou prioriser n'ont aucun sens pour un rendez-vous existant.
 *
 * Correspondance avec Réglages › Gestes : Terminer devient cocher, Supprimer devient « Masquer ici »,
 * tout le reste n'a pas d'action.
 */
internal object EventActions {
    fun map(action: SwipeAction, checkable: Boolean): SwipeAction = when (action) {
        SwipeAction.COMPLETE -> if (checkable) SwipeAction.COMPLETE else SwipeAction.NONE
        SwipeAction.DELETE -> SwipeAction.DELETE
        else -> SwipeAction.NONE
    }

    fun swipeConfig(config: SwipeConfig, checkable: Boolean): SwipeConfig = SwipeConfig(
        rightShort = map(config.rightShort, checkable),
        rightLong = map(config.rightLong, checkable),
        leftShort = map(config.leftShort, checkable),
        leftLong = map(config.leftLong, checkable),
    )

    /** Actions du menu d'appui long, dans l'ordre : [SwipeAction.DELETE] y signifie « Masquer ici ». */
    fun menu(checkable: Boolean): List<SwipeAction> =
        if (checkable) listOf(SwipeAction.COMPLETE, SwipeAction.DELETE) else listOf(SwipeAction.DELETE)
}

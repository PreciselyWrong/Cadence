package ch.nicolab.cadence.widget.today

/**
 * Fond du widget : toujours une surface pleine tirée des jetons du design system. [AUTO] suit le
 * thème clair ou sombre du téléphone, [CLAIR] et [SOMBRE] le forcent, [AUCUN] ne pose aucune surface.
 */
enum class TodayBackground { AUTO, CLAIR, SOMBRE, AUCUN }

/** Couleur des icônes et des cases. [PROJET] colore chaque case dans la couleur de son projet. */
enum class ControlColour { BLANC, PROJET, INDIGO, CORAIL, MENTHE, AMBRE, LIBRE }

enum class HabitPlacement { ABOVE, BELOW, HIDDEN }

/** Habitudes affichées : selon l'heure (groupes actifs), toutes, ou une sélection. */
enum class HabitSelection { BY_TIME, ALL, CHOOSE }

enum class TaskScope { OVERDUE_AND_TODAY, TODAY, TOMORROW, NEXT_3, NEXT_7, NO_DATE, INBOX }

enum class TaskSort { DUE, PRIORITY, PROJECT }

enum class TodayTextSize { S, M, L }

/**
 * Réglages d'une instance du widget « Aujourd'hui ». Valeurs bornées par leur plage ; les
 * valeurs par défaut sont celles du premier placement.
 */
data class TodayWidgetConfig(
    val background: TodayBackground = TodayBackground.AUTO,
    val controlColour: ControlColour = ControlColour.INDIGO,
    /** Couleur choisie librement, utilisée quand [controlColour] vaut [ControlColour.LIBRE]. */
    val freeControlArgb: Int = TodayControlPalette.DEFAULT_FREE_ARGB,
    /** « Boutons discrets » : icônes seules, sans pastille. */
    val discreteButtons: Boolean = false,
    val showTasks: Boolean = true,
    val habitPlacement: HabitPlacement = HabitPlacement.BELOW,
    val habitSelection: HabitSelection = HabitSelection.BY_TIME,
    /** Habitudes retenues quand [habitSelection] vaut [HabitSelection.CHOOSE]. */
    val habitIds: Set<String> = emptySet(),
    /** Nombre maximal de facettes, 1 à 8. */
    val maxFacets: Int = 5,
    val taskScope: TaskScope = TaskScope.OVERDUE_AND_TODAY,
    val highPriorityOnly: Boolean = false,
    val hideRecurring: Boolean = false,
    /** Projets retenus ; vide = tous. */
    val projectUids: Set<String> = emptySet(),
    /** Étiquettes retenues (une suffit) ; vide = toutes. */
    val tagUids: Set<String> = emptySet(),
    val sort: TaskSort = TaskSort.DUE,
    /** Section « En retard » séparée, en tête de liste. */
    val showOverdueSection: Boolean = true,
    /** Cocher depuis le widget ; sinon un appui ouvre la tâche. */
    val checkFromWidget: Boolean = true,
    /** Trait de couleur du projet à gauche de chaque tâche. */
    val projectRail: Boolean = true,
    val showEvents: Boolean = false,
    val textSize: TodayTextSize = TodayTextSize.M,
    /** Rayon des angles en dp, 0 à 32. */
    val cornerRadiusDp: Int = 20,
)

/** Plages admises pour les réglages numériques. */
object TodayWidgetLimits {
    val FACETS = 1..8
    val CORNER_DP = 0..32
}

/**
 * Couleurs de contrôle : jeu fixe documenté du widget (la couleur libre est choisie
 * par l'utilisateur). Les couleurs de projet viennent de la base, jamais d'ici.
 */
object TodayControlPalette {
    const val DEFAULT_FREE_ARGB: Int = 0xFF7C8CFF.toInt()

    fun argb(colour: ControlColour, freeArgb: Int): Int? = when (colour) {
        ControlColour.BLANC -> 0xFFFFFFFF.toInt()
        ControlColour.PROJET -> null
        ControlColour.INDIGO -> 0xFF6F62F2.toInt()
        ControlColour.CORAIL -> 0xFFF0705C.toInt()
        ControlColour.MENTHE -> 0xFF3DD6A0.toInt()
        ControlColour.AMBRE -> 0xFFF5B942.toInt()
        ControlColour.LIBRE -> freeArgb
    }
}

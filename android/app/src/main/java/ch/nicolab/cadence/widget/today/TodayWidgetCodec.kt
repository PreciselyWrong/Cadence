package ch.nicolab.cadence.widget.today

/**
 * Stockage textuel de [TodayWidgetConfig] : une clé par réglage, lue par [decode] avec un repli
 * sur la valeur par défaut pour toute valeur absente, inconnue ou hors plage. Les clés retirées
 * (intensité, voile, lignes max.) restent dans les anciennes données et sont ignorées.
 */
object TodayWidgetConfigCodec {
    private const val BACKGROUND = "background"
    private const val CONTROL = "control"
    private const val FREE_CONTROL = "freeControl"
    private const val DISCRETE = "discreteButtons"
    private const val SHOW_TASKS = "showTasks"
    private const val HABIT_PLACEMENT = "habitPlacement"
    private const val HABIT_SELECTION = "habitSelection"
    private const val HABIT_IDS = "habitIds"
    private const val MAX_FACETS = "maxFacets"
    private const val TASK_SCOPE = "taskScope"
    private const val HIGH_PRIORITY = "highPriorityOnly"
    private const val HIDE_RECURRING = "hideRecurring"
    private const val PROJECT_IDS = "projectUids"
    private const val TAG_IDS = "tagUids"
    private const val SORT = "sort"
    private const val OVERDUE_SECTION = "showOverdue"
    private const val CHECK_FROM_WIDGET = "checkFromWidget"
    private const val PROJECT_RAIL = "projectRail"
    private const val SHOW_EVENTS = "showEvents"
    private const val TEXT_SIZE = "textSize"
    private const val CORNER = "cornerRadius"

    /** Les identifiants d'habitude, de projet et d'étiquette sont des UUID : la virgule ne peut pas s'y glisser. */
    private const val ID_SEPARATOR = ","

    fun encode(config: TodayWidgetConfig): Map<String, String> = mapOf(
        BACKGROUND to config.background.name,
        CONTROL to config.controlColour.name,
        FREE_CONTROL to config.freeControlArgb.toString(),
        DISCRETE to flag(config.discreteButtons),
        SHOW_TASKS to flag(config.showTasks),
        HABIT_PLACEMENT to config.habitPlacement.name,
        HABIT_SELECTION to config.habitSelection.name,
        HABIT_IDS to config.habitIds.joinToString(ID_SEPARATOR),
        MAX_FACETS to config.maxFacets.toString(),
        TASK_SCOPE to config.taskScope.name,
        HIGH_PRIORITY to flag(config.highPriorityOnly),
        HIDE_RECURRING to flag(config.hideRecurring),
        PROJECT_IDS to config.projectUids.joinToString(ID_SEPARATOR),
        TAG_IDS to config.tagUids.joinToString(ID_SEPARATOR),
        SORT to config.sort.name,
        OVERDUE_SECTION to flag(config.showOverdueSection),
        CHECK_FROM_WIDGET to flag(config.checkFromWidget),
        PROJECT_RAIL to flag(config.projectRail),
        SHOW_EVENTS to flag(config.showEvents),
        TEXT_SIZE to config.textSize.name,
        CORNER to config.cornerRadiusDp.toString(),
    )

    fun decode(read: (String) -> String?): TodayWidgetConfig {
        val defaults = TodayWidgetConfig()
        return TodayWidgetConfig(
            background = background(read(BACKGROUND), defaults.background),
            controlColour = enumOf(read(CONTROL), defaults.controlColour),
            freeControlArgb = read(FREE_CONTROL)?.toIntOrNull() ?: defaults.freeControlArgb,
            discreteButtons = bool(read(DISCRETE), defaults.discreteButtons),
            showTasks = bool(read(SHOW_TASKS), defaults.showTasks),
            habitPlacement = enumOf(read(HABIT_PLACEMENT), defaults.habitPlacement),
            habitSelection = enumOf(read(HABIT_SELECTION), defaults.habitSelection),
            habitIds = ids(read(HABIT_IDS)),
            maxFacets = int(read(MAX_FACETS), defaults.maxFacets, TodayWidgetLimits.FACETS),
            taskScope = enumOf(read(TASK_SCOPE), defaults.taskScope),
            highPriorityOnly = bool(read(HIGH_PRIORITY), defaults.highPriorityOnly),
            hideRecurring = bool(read(HIDE_RECURRING), defaults.hideRecurring),
            projectUids = ids(read(PROJECT_IDS)),
            tagUids = ids(read(TAG_IDS)),
            sort = enumOf(read(SORT), defaults.sort),
            showOverdueSection = bool(read(OVERDUE_SECTION), defaults.showOverdueSection),
            checkFromWidget = bool(read(CHECK_FROM_WIDGET), defaults.checkFromWidget),
            projectRail = bool(read(PROJECT_RAIL), defaults.projectRail),
            showEvents = bool(read(SHOW_EVENTS), defaults.showEvents),
            textSize = enumOf(read(TEXT_SIZE), defaults.textSize),
            cornerRadiusDp = int(read(CORNER), defaults.cornerRadiusDp, TodayWidgetLimits.CORNER_DP),
        )
    }

    /**
     * Les fonds translucides d'avant (« Flou », « Verre ») n'existent plus : « Flou » retombe sur le
     * fond plein par défaut, « Verre » (teinte sombre) sur le fond sombre plein.
     */
    private fun background(raw: String?, default: TodayBackground): TodayBackground = when (raw) {
        "FLOU" -> default
        "VERRE" -> TodayBackground.SOMBRE
        else -> enumOf(raw, default)
    }

    private fun ids(raw: String?): Set<String> = raw.orEmpty().split(ID_SEPARATOR).filter { it.isNotBlank() }.toSet()

    private fun flag(value: Boolean) = if (value) "1" else "0"

    private fun bool(raw: String?, default: Boolean): Boolean = when (raw) {
        "1", "true" -> true
        "0", "false" -> false
        else -> default
    }

    private fun int(raw: String?, default: Int, range: IntRange): Int =
        raw?.toIntOrNull()?.coerceIn(range) ?: default

    private inline fun <reified E : Enum<E>> enumOf(raw: String?, default: E): E =
        enumValues<E>().firstOrNull { it.name == raw } ?: default
}

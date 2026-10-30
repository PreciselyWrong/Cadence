package ch.nicolab.cadence.domain

/** Comment le widget répartit ses habitudes sur la largeur disponible. */
enum class WidgetSlotMode {
    /** Les habitudes affichées se partagent toute la largeur : moins d'habitudes, plus d'air. */
    FLEXIBLE,

    /** La largeur est découpée en emplacements fixes : l'espacement ne bouge jamais. */
    FIXED,
    ;

    companion object {
        fun fromStorage(raw: String?): WidgetSlotMode = entries.firstOrNull { it.name == raw } ?: FLEXIBLE
    }
}

/** Où se posent les emplacements fixes lorsqu'ils ne remplissent pas la largeur. */
enum class WidgetSlotAlignment {
    START,
    CENTER,
    END,
    ;

    companion object {
        fun fromStorage(raw: String?): WidgetSlotAlignment = entries.firstOrNull { it.name == raw } ?: CENTER
    }
}

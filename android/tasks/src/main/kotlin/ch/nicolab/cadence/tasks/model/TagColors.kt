package ch.nicolab.cadence.tasks.model

/** Couleur d'une étiquette en hexadécimal : [light] pour le mode clair, [dark] (plus claire) pour le mode sombre. */
data class TagColor(val light: String, val dark: String) {
    val lightArgb: Int get() = TagColors.argb(light)
    val darkArgb: Int get() = TagColors.argb(dark)
}

/**
 * Couleur d'une étiquette : la sienne, sinon celle du plus proche ancêtre qui en a une (`perso` pour
 * `perso/sport`), sinon une couleur dérivée du premier segment de son nom pour qu'un même nom ait toujours la
 * même teinte. Miroir de `frontend/utils/tagColor.ts` ; palette et cas partagés dans `fixtures/tags/colors.json`.
 */
object TagColors {
    /** Une teinte de la palette partagée : [deep] est la valeur enregistrée, [light] sa version pour fond sombre. */
    data class Hue(val key: String, val deep: String, val light: String, val medium: String)

    val PALETTE: List<Hue> = listOf(
        Hue("red", "#b91c1c", "#f87171", "#dc2626"),
        Hue("orange", "#c2410c", "#fb923c", "#ea580c"),
        Hue("yellow", "#ca8a04", "#facc15", "#eab308"),
        Hue("green", "#15803d", "#4ade80", "#16a34a"),
        Hue("teal", "#0f766e", "#2dd4bf", "#0d9488"),
        Hue("cyan", "#0e7490", "#22d3ee", "#0891b2"),
        Hue("blue", "#1d4ed8", "#60a5fa", "#2563eb"),
        Hue("indigo", "#4338ca", "#818cf8", "#4f46e5"),
        Hue("purple", "#7e22ce", "#c084fc", "#9333ea"),
        Hue("pink", "#be185d", "#f472b6", "#db2777"),
        Hue("gray", "#374151", "#9ca3af", "#4b5563"),
    )

    private val DERIVED = PALETTE.filter { it.key != "gray" }
    private val HEX = Regex("^#[0-9a-fA-F]{6}$")

    fun argb(hex: String): Int = (0xFF000000L or hex.removePrefix("#").toLong(16)).toInt()

    /** Trois nuances (clair, moyen, foncé) de chaque teinte, dans l'ordre de [PALETTE]. */
    fun shades(hue: Hue): List<String> = listOf(hue.light, hue.medium, hue.deep)

    /** Couleur enregistrée lue comme le web : une valeur de la palette garde son jumeau sombre, une autre vaut pour les deux modes. */
    fun parse(value: String?): TagColor? {
        val hex = value?.trim()?.lowercase()?.takeIf { HEX.matches(it) } ?: return null
        PALETTE.firstOrNull { it.deep == hex }?.let { return TagColor(it.deep, it.light) }
        PALETTE.firstOrNull { it.medium == hex }?.let { return TagColor(it.medium, it.light) }
        return TagColor(hex, hex)
    }

    fun derived(name: String): TagColor {
        val root = name.substringBefore(TagPaths.SEPARATOR).trim().lowercase(java.util.Locale.ROOT)
        var hash = 0L
        for (unit in root) hash = (hash * 31 + unit.code) and 0xFFFFFFFFL
        val hue = DERIVED[(hash % DERIVED.size).toInt()]
        return TagColor(hue.deep, hue.light)
    }

    fun resolve(tag: TagItem, tags: List<TagItem>): TagColor {
        parse(tag.color)?.let { return it }
        val byName = tags.associateBy { it.name }
        var path = tag.name
        while (path.contains(TagPaths.SEPARATOR)) {
            path = path.substringBeforeLast(TagPaths.SEPARATOR)
            parse(byName[path]?.color)?.let { return it }
        }
        return derived(tag.name)
    }

    /** Couleur de chaque étiquette de [tags], par uid : à calculer une fois par liste, pas par ligne. */
    fun byUid(tags: List<TagItem>): Map<String, TagColor> = tags.associate { it.uid to resolve(it, tags) }
}

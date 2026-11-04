package ch.nicolab.cadence.tasks.brief

import java.time.LocalTime
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Réglage `ui_settings.brief.evening` : bilan du soir actif, et heure à partir de laquelle il remplace le résumé du matin. */
data class EveningSwitch(val enabled: Boolean = true, val switchMinute: Int = DEFAULT_SWITCH_MINUTE) {
    companion object {
        const val DEFAULT_SWITCH_MINUTE = 18 * 60
    }
}

/** Quel résumé s'affiche. */
enum class BriefView { MORNING, EVENING }

/** Règles pures du bilan du soir : réglage, heure de bascule, choix de l'écran. */
object EveningMode {
    /** Réglage lu tel que le serveur le normalise ; absent ou illisible, le défaut (actif, 18:00) s'applique. */
    fun switchOf(settings: JsonObject?): EveningSwitch {
        val group = settings?.let { BriefSettingsJson.group(it, "evening") } ?: return EveningSwitch()
        val enabled = (group["enabled"] as? JsonPrimitive)?.content?.let { it == "true" } ?: true
        val minute = parseMinute((group["switchTime"] as? JsonPrimitive)?.content) ?: EveningSwitch.DEFAULT_SWITCH_MINUTE
        return EveningSwitch(enabled, minute)
    }

    /** Vrai quand le bilan remplace le résumé du matin : réglage actif et heure de bascule atteinte. */
    fun due(settings: JsonObject?, now: LocalTime): Boolean {
        val switch = switchOf(settings)
        return switch.enabled && now.hour * 60 + now.minute >= switch.switchMinute
    }

    /**
     * Écran à montrer. Le bilan passe en premier quand l'heure est venue, qu'il est lu et que la personne n'a pas
     * demandé le résumé du matin ([forcedMorning]) ; sans résumé du matin, le bilan s'affiche malgré tout.
     */
    fun view(due: Boolean, hasEvening: Boolean, hasMorning: Boolean, forcedMorning: Boolean): BriefView = when {
        !hasEvening -> BriefView.MORNING
        !hasMorning -> BriefView.EVENING
        due && !forcedMorning -> BriefView.EVENING
        else -> BriefView.MORNING
    }

    /** Remplace le réglage : les deux clés partent toujours ensemble, le serveur valide l'objet entier. */
    fun withSwitch(settings: JsonObject, next: EveningSwitch): JsonObject = BriefSettingsJson.withValue(
        settings,
        "evening",
        buildJsonObject {
            put("enabled", next.enabled)
            put("switchTime", clock(next.switchMinute))
        },
    )

    fun clock(minute: Int): String = "%02d:%02d".format(minute / 60, minute % 60)

    /** « HH:mm » par pas de 5 minutes (la règle du serveur), 00:00 à 23:55 ; null sinon. */
    fun parseMinute(value: String?): Int? {
        val parts = value?.trim()?.split(":") ?: return null
        if (parts.size != 2) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        return if (hour in 0..23 && minute in 0..59 && minute % 5 == 0) hour * 60 + minute else null
    }
}

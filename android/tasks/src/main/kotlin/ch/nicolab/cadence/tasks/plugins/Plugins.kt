package ch.nicolab.cadence.tasks.plugins

import java.net.URI
import java.net.URLEncoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/** Un champ du formulaire de réglages d'un plugin, tel que `GET /api/plugins` le décrit (`docs/46-plugins.md`). */
data class PluginSetting(
    val key: String,
    val type: String,
    val label: String,
    val required: Boolean = false,
    val help: String? = null,
    val options: List<String> = emptyList(),
    /** Valeur enregistrée (défauts remplis) ; jamais renvoyée pour un `secret`. */
    val value: JsonElement? = null,
    /** `secret` seulement : une valeur est enregistrée. */
    val hasValue: Boolean = false,
) {
    companion object {
        const val STRING = "string"
        const val SECRET = "secret"
        const val BOOLEAN = "boolean"
        const val NUMBER = "number"
        const val SELECT = "select"
    }
}

/** Ce que l'adresse `update.url` a dit au dernier « Vérifier les mises à jour ». */
data class PluginUpdate(val latest: String?, val available: Boolean, val checkedAt: String?, val error: String?)

data class Plugin(
    val id: String?,
    val name: String,
    val description: String,
    val version: String?,
    val loadedVersion: String?,
    val previousVersion: String?,
    val state: String,
    val lastError: String?,
    val permissions: List<String>,
    val events: List<String>,
    val settings: List<PluginSetting>,
    val update: PluginUpdate?,
    val installedFromGit: Boolean,
) {
    /** Comme le web : l'interrupteur est allumé quand le plugin tourne ou a échoué au démarrage. */
    val enabled: Boolean get() = state == ACTIVE || state == ERROR

    val canSwitch: Boolean get() = id != null && state in SWITCHABLE

    val showsSettings: Boolean get() = id != null && settings.isNotEmpty() && state !in NO_SETTINGS

    /** Le dossier a changé de version depuis le dernier chargement : un rechargement la prendra. */
    val reloadPending: Boolean get() = loadedVersion != null && version != null && loadedVersion != version

    companion object {
        const val ACTIVE = "active"
        const val ERROR = "error"
        const val DISABLED = "disabled"
        const val INVALID = "invalid"
        const val INCOMPATIBLE = "incompatible"
        const val NEEDS_APPROVAL = "needs_approval"
        const val MISSING = "missing"
        private val SWITCHABLE = setOf(DISABLED, ACTIVE, ERROR, NEEDS_APPROVAL)
        private val NO_SETTINGS = setOf(INVALID, INCOMPATIBLE, MISSING)
    }
}

/** Réponse de `GET /api/plugins` ; `configured` faux quand `TUDUDI_PLUGINS_DIR` n'est pas renseigné. */
data class PluginList(val configured: Boolean, val plugins: List<Plugin>)

/** Entrée de menu d'un plugin actif (`GET /api/plugins/menu`) ; sa page est servie à `/api/plugins/<id>/ui/<file>`. */
data class PluginMenuItem(val id: String, val label: String, val path: String, val file: String)

/** Bouton qu'un plugin ajoute en haut d'un écran ; [places] parmi plan, today, inbox, project, triage. */
data class PluginAction(val plugin: String, val id: String, val label: String, val places: List<String>)

/** Réponse de `GET /api/plugins/menu` : les pages des plugins actifs et leurs boutons d'action. */
data class PluginMenu(val items: List<PluginMenuItem>, val actions: List<PluginAction>) {
    companion object {
        val EMPTY = PluginMenu(items = emptyList(), actions = emptyList())
    }
}

/**
 * Règles des boutons d'action (docs/46-plugins.md, « Actions de page ») : même comportement que le web
 * (`frontend/components/Plugins/PluginActions.tsx`).
 */
object PluginActions {
    /** `?action=…&place=…`, puis les valeurs non vides de [context] dans son ordre, encodées. */
    fun query(actionId: String, place: String, context: Map<String, String?>): String = buildString {
        append("?action=").append(encode(actionId))
        append("&place=").append(encode(place))
        context.forEach { (key, value) ->
            if (!value.isNullOrEmpty()) append('&').append(encode(key)).append('=').append(encode(value))
        }
    }

    /** Les actions de [place] dont le plugin a une page dans le menu : sans page, rien à ouvrir. */
    fun forPlace(menu: PluginMenu, place: String): List<PluginAction> =
        menu.actions.filter { action -> place in action.places && menu.items.any { it.id == action.plugin } }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}

/** Lecture des réponses du serveur : un champ absent ou mal formé prend sa valeur neutre, jamais une exception. */
object PluginJson {
    fun list(body: JsonObject): PluginList = PluginList(
        configured = body.bool("configured") == true,
        plugins = (body["plugins"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::plugin) },
    )

    fun plugin(body: JsonObject): Plugin = Plugin(
        id = body.text("id"),
        name = body.text("name") ?: body.text("folder") ?: "?",
        description = body.text("description").orEmpty(),
        version = body.text("version"),
        loadedVersion = body.text("loaded_version"),
        previousVersion = body.text("previous_version"),
        state = body.text("state") ?: Plugin.MISSING,
        lastError = body.text("last_error"),
        permissions = body.texts("permissions"),
        events = body.texts("events"),
        settings = (body["settings"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::setting) },
        update = (body["update"] as? JsonObject)?.let { update ->
            PluginUpdate(
                latest = update.text("latest"),
                available = update.bool("available") == true,
                checkedAt = update.text("checked_at"),
                error = update.text("error"),
            )
        },
        installedFromGit = body.bool("installed_from_git") == true,
    )

    private fun setting(body: JsonObject): PluginSetting? {
        val key = body.text("key") ?: return null
        val type = body.text("type") ?: return null
        return PluginSetting(
            key = key,
            type = type,
            label = body.text("label") ?: key,
            required = body.bool("required") == true,
            help = body.text("help"),
            options = body.texts("options"),
            value = body["value"]?.takeIf { it !is JsonNull },
            hasValue = body.bool("has_value") == true,
        )
    }

    fun menu(body: JsonObject): PluginMenu = PluginMenu(
        items = (body["items"] as? JsonArray).orEmpty().mapNotNull { element ->
            val item = element as? JsonObject ?: return@mapNotNull null
            val id = item.text("id") ?: return@mapNotNull null
            val file = item.text("file") ?: return@mapNotNull null
            PluginMenuItem(id, item.text("label") ?: id, item.text("path") ?: "/plugins/$id", file)
        },
        actions = (body["actions"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::action) },
    )

    private fun action(body: JsonObject): PluginAction? {
        val plugin = body.text("plugin") ?: return null
        val id = body.text("id") ?: return null
        val label = body.text("label")?.takeIf { it.isNotBlank() } ?: return null
        return PluginAction(plugin, id, label, body.texts("places"))
    }

    /** Forme gardée en préférences, relue par [menu]. */
    fun menuBody(menu: PluginMenu): JsonObject = buildJsonObject {
        put(
            "items",
            buildJsonArray {
                menu.items.forEach { item ->
                    add(
                        buildJsonObject {
                            put("id", item.id)
                            put("label", item.label)
                            put("path", item.path)
                            put("file", item.file)
                        },
                    )
                }
            },
        )
        put(
            "actions",
            buildJsonArray {
                menu.actions.forEach { action ->
                    add(
                        buildJsonObject {
                            put("plugin", action.plugin)
                            put("id", action.id)
                            put("label", action.label)
                            put(
                                "places",
                                buildJsonArray { action.places.forEach { add(JsonPrimitive(it)) } },
                            )
                        },
                    )
                }
            },
        )
    }

    /** `{error}` d'un corps d'erreur, tel quel, pour l'afficher ; null pour une page HTML ou un corps vide. */
    fun error(body: JsonObject?): String? = body?.text("error")

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.texts(key: String): List<String> =
        (this[key] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
}

/**
 * Saisie du formulaire de réglages d'un plugin. [text] : champs texte, nombre, liste et secret (vide pour un secret
 * non saisi) ; [flags] : interrupteurs ; [cleared] : secrets à effacer.
 */
data class PluginSettingsForm(
    val text: Map<String, String> = emptyMap(),
    val flags: Map<String, Boolean> = emptyMap(),
    val cleared: Set<String> = emptySet(),
) {
    fun withText(key: String, value: String) = copy(text = text + (key to value), cleared = cleared - key)

    fun withFlag(key: String, value: Boolean) = copy(flags = flags + (key to value))

    /** « Effacer » d'un secret : la saisie en cours part avec. */
    fun clearSecret(key: String) = copy(text = text - key, cleared = cleared + key)

    companion object {
        /** Formulaire au repos, rempli depuis les valeurs du serveur ; les secrets restent vides. */
        fun of(fields: List<PluginSetting>): PluginSettingsForm {
            val text = mutableMapOf<String, String>()
            val flags = mutableMapOf<String, Boolean>()
            fields.forEach { field ->
                when (field.type) {
                    PluginSetting.SECRET -> Unit
                    PluginSetting.BOOLEAN -> flags[field.key] = (field.value as? JsonPrimitive)?.booleanOrNull == true
                    else -> text[field.key] = (field.value as? JsonPrimitive)?.contentOrNull.orEmpty()
                }
            }
            return PluginSettingsForm(text, flags)
        }

        /**
         * Corps `settings` de `PATCH /api/plugins/:id`, comme le web : un secret non saisi est absent (il garde sa
         * valeur), un secret effacé vaut null ; un nombre vide vaut null (retour au défaut). Échoue avec la clé d'un
         * nombre illisible ; le serveur valide le reste et son refus s'affiche.
         */
        fun body(fields: List<PluginSetting>, form: PluginSettingsForm): Result<JsonObject> {
            val values = mutableMapOf<String, JsonElement>()
            for (field in fields) {
                val draft = form.text[field.key].orEmpty()
                when (field.type) {
                    PluginSetting.SECRET -> when {
                        field.key in form.cleared -> values[field.key] = JsonNull
                        draft.isNotEmpty() -> values[field.key] = JsonPrimitive(draft)
                    }
                    PluginSetting.BOOLEAN -> values[field.key] = JsonPrimitive(form.flags[field.key] == true)
                    PluginSetting.NUMBER -> values[field.key] = if (draft.isBlank()) {
                        JsonNull
                    } else {
                        number(draft) ?: return Result.failure(IllegalArgumentException(field.key))
                    }
                    else -> values[field.key] = JsonPrimitive(draft)
                }
            }
            return Result.success(JsonObject(values))
        }

        /** Entier quand c'est un entier (le serveur garde `3`, pas `3.0`) ; virgule acceptée comme séparateur. */
        private fun number(raw: String): JsonPrimitive? {
            val parsed = JsonPrimitive(raw.trim().replace(',', '.')).doubleOrNull?.takeIf { it.isFinite() } ?: return null
            val whole = parsed.toLong()
            return if (whole.toDouble() == parsed) JsonPrimitive(whole) else JsonPrimitive(parsed)
        }
    }
}

/** Adresses des pages de plugins et règle de même origine pour l'en-tête `Authorization`. */
object PluginUrls {
    /**
     * [query] : celle de `/plugins/<id>?…` d'une notification (avec son `?`), déjà vérifiée par `LiveTarget` ; la page
     * la lit dans sa propre adresse.
     */
    fun page(baseUrl: String, item: PluginMenuItem, query: String = ""): String =
        baseUrl.trimEnd('/') + "/api/plugins/" + segment(item.id) + "/ui/" + segment(item.file) + query

    /** Même schéma, hôte et port que le serveur : seule une telle requête reçoit le jeton. */
    fun sameOrigin(baseUrl: String, url: String): Boolean {
        val server = runCatching { URI(baseUrl) }.getOrNull() ?: return false
        val target = runCatching { URI(url) }.getOrNull() ?: return false
        val scheme = target.scheme?.lowercase() ?: return false
        return scheme == server.scheme?.lowercase() &&
            target.host != null && target.host.equals(server.host, ignoreCase = true) &&
            portOf(target) == portOf(server)
    }

    private fun portOf(uri: URI): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> 443
        uri.scheme.equals("http", ignoreCase = true) -> 80
        else -> -1
    }

    private fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
}

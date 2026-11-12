package ch.nicolab.cadence.tasks.autoclassify

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/** Type d'un élément de la file « À trier » venu du classement automatique. */
const val AUTO_CLASSIFY_TYPE = "classify"

data class ProjectOption(val uid: String, val name: String, val areaName: String?)

data class AreaOffer(val uid: String, val name: String?)

data class NewProjectOffer(val name: String, val areaUid: String?, val areaName: String?)

/** Projet proposé : options classées (la meilleure d'abord), domaine seul, ou nouveau projet. */
data class ProjectOffer(val options: List<ProjectOption>, val area: AreaOffer?, val newProject: NewProjectOffer?)

data class TagOffer(val options: List<String>, val newTag: String?)

/** Carte « classement » : seules les lignes proposées (non nulles) y figurent. */
data class ClassifyCard(
    val suggestionUid: String,
    val entity: String,
    val itemUid: String,
    val title: String,
    val project: ProjectOffer?,
    val tags: TagOffer?,
    /** 1 = moyenne, 2 = haute (comme le serveur). */
    val priority: Int?,
)

/** Lecture tolérante des charges utiles : une forme inconnue donne null, jamais une exception. */
object AutoClassifyPayload {
    fun classify(payload: JsonObject?): ClassifyCard? {
        payload ?: return null
        return ClassifyCard(
            suggestionUid = text(payload, "suggestion_uid") ?: return null,
            entity = text(payload, "entity") ?: return null,
            itemUid = text(payload, "item_uid") ?: return null,
            title = text(payload, "title").orEmpty(),
            project = obj(payload, "project")?.let(::projectOffer),
            tags = obj(payload, "tags")?.let(::tagOffer),
            priority = obj(payload, "priority")?.let { int(it, "value") }?.takeIf { it == 1 || it == 2 },
        )
    }

    private fun projectOffer(project: JsonObject) = ProjectOffer(
        options = array(project, "options").mapNotNull { option ->
            val raw = option as? JsonObject ?: return@mapNotNull null
            ProjectOption(text(raw, "uid") ?: return@mapNotNull null, text(raw, "name").orEmpty(), text(raw, "area_name"))
        },
        area = obj(project, "area")?.let { area -> text(area, "uid")?.let { AreaOffer(it, text(area, "name")) } },
        newProject = obj(project, "new_project")?.let { raw ->
            text(raw, "name")?.let { NewProjectOffer(it, text(raw, "area_uid"), text(raw, "area_name")) }
        },
    )

    private fun tagOffer(tags: JsonObject) = TagOffer(
        options = array(tags, "options").mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) },
        newTag = text(tags, "new_tag"),
    )

    private fun obj(source: JsonObject, key: String): JsonObject? = source[key] as? JsonObject

    private fun array(source: JsonObject, key: String): List<JsonElement> = (source[key] as? JsonArray)?.toList().orEmpty()

    private fun text(source: JsonObject, key: String): String? =
        (source[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.contentOrNull?.takeIf(String::isNotBlank)

    private fun int(source: JsonObject, key: String): Int? = (source[key] as? JsonPrimitive)?.intOrNull
}

/** Où range-t-on l'élément, comme la réponse le demande. */
sealed interface ProjectAnswer {
    data object None : ProjectAnswer
    data class Existing(val uid: String) : ProjectAnswer
    data class Area(val uid: String) : ProjectAnswer
    data class NewProject(val name: String, val areaUid: String?) : ProjectAnswer
}

/** Réponse détaillée à une carte « classement ». */
data class ClassifyAnswer(
    val project: ProjectAnswer,
    val tags: List<String>,
    val newTag: String?,
    val priority: Int?,
)

/** Corps des réponses à la file « À trier » et aux notifications. */
object AutoClassifyChoices {
    /** Tout accepter : meilleur projet, tous les tags proposés, la priorité ; jamais de nouveau projet ni de nouveau tag. */
    val ACCEPT_ALL: JsonElement = JsonPrimitive("all")

    /** Garder l'élément tel quel. */
    val NONE: JsonElement = JsonPrimitive("none")

    /** La réponse de la carte telle que l'utilisateur l'a réglée. */
    fun answer(answer: ClassifyAnswer): JsonObject = buildJsonObject {
        put("project", project(answer.project))
        put("tags", JsonArray(answer.tags.map(::JsonPrimitive)))
        put("new_tag", answer.newTag?.let(::JsonPrimitive) ?: JsonNull)
        put("priority", answer.priority?.let(::JsonPrimitive) ?: JsonNull)
    }

    /** Réglage initial d'une carte : identique à « Tout accepter » côté serveur, pour que « Appliquer » sans toucher le confirme. */
    fun defaultAnswer(card: ClassifyCard): ClassifyAnswer = ClassifyAnswer(
        project = card.project?.let(::defaultProject) ?: ProjectAnswer.None,
        tags = card.tags?.options.orEmpty(),
        newTag = null,
        priority = card.priority,
    )

    fun defaultProject(offer: ProjectOffer): ProjectAnswer = when {
        offer.options.isNotEmpty() -> ProjectAnswer.Existing(offer.options.first().uid)
        offer.area != null -> ProjectAnswer.Area(offer.area.uid)
        else -> ProjectAnswer.None
    }

    private fun project(answer: ProjectAnswer): JsonObject = buildJsonObject {
        when (answer) {
            ProjectAnswer.None -> put("type", "none")
            is ProjectAnswer.Existing -> {
                put("type", "project")
                put("uid", answer.uid)
            }
            is ProjectAnswer.Area -> {
                put("type", "area")
                put("uid", answer.uid)
            }
            is ProjectAnswer.NewProject -> {
                put("type", "new_project")
                put("name", answer.name)
                put("area_uid", answer.areaUid?.let(::JsonPrimitive) ?: JsonNull)
            }
        }
    }
}

/** Suggestion en attente, telle que `GET /auto-classify/suggestions` la décrit. */
data class PendingSuggestion(
    val uid: String,
    val entity: String,
    val itemUid: String,
    val payload: JsonObject?,
) {
    /** Titre de l'élément classé. */
    val headline: String get() = (payload?.get("title") as? JsonPrimitive)?.contentOrNull.orEmpty()

    companion object {
        fun parse(element: JsonElement): PendingSuggestion? {
            val raw = element as? JsonObject ?: return null
            val uid = (raw["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) ?: return null
            return PendingSuggestion(
                uid = uid,
                entity = (raw["entity"] as? JsonPrimitive)?.contentOrNull.orEmpty(),
                itemUid = (raw["item_uid"] as? JsonPrimitive)?.contentOrNull.orEmpty(),
                payload = raw["payload"] as? JsonObject,
            )
        }
    }
}

/** Une marque de classement sur un élément, annulable tant que l'élément n'a pas changé. */
data class ClassifyMark(val changeId: Long, val fields: List<String>) {
    companion object {
        fun parse(element: JsonElement): ClassifyMark? {
            val raw = element as? JsonObject ?: return null
            val id = (raw["change_id"] as? JsonPrimitive)?.longOrNull ?: return null
            val fields = (raw["fields"] as? JsonArray)?.toList().orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            return ClassifyMark(id, fields)
        }
    }
}

internal fun JsonObject.boolean(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

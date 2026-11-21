package ch.nicolab.cadence.tasks.project

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** Modèle de projet du serveur (`GET /api/v1/templates`). */
data class ProjectTemplate(
    val uid: String,
    val name: String,
    val description: String = "",
    val category: String? = null,
    val taskCount: Int = 0,
)

/**
 * Client en ligne des modèles de projet (`GET /api/v1/templates`,
 * `POST /api/v1/template/:uid/clone`, `POST /api/v1/project/:uid/save-as-template`).
 * Pas de marketplace : uniquement les modèles personnels du compte.
 */
class TemplatesClient internal constructor(
    private val call: suspend (method: String, path: String, body: JsonObject?) -> JsonObject,
) {
    suspend fun list(): List<ProjectTemplate> =
        parseList(call("GET", "/api/v1/templates", null))

    suspend fun clone(templateUid: String, name: String): String {
        val body = JsonObject(mapOf("name" to JsonPrimitive(name.trim())))
        val response = call("POST", "/api/v1/template/$templateUid/clone", body)
        return (response["uid"] as? JsonPrimitive)?.contentOrNull.orEmpty()
    }

    suspend fun saveProjectAsTemplate(projectUid: String, name: String): ProjectTemplate {
        val body = JsonObject(mapOf("name" to JsonPrimitive(name.trim())))
        val response = call("POST", "/api/v1/project/$projectUid/save-as-template", body)
        return parseTemplate(response) ?: ProjectTemplate(uid = "", name = name.trim())
    }

    companion object {
        fun parseList(json: JsonObject): List<ProjectTemplate> =
            (json["templates"] as? JsonArray).orEmpty().mapNotNull { element ->
                (element as? JsonObject)?.let(::parseTemplate)
            }

        fun parseTemplate(item: JsonObject): ProjectTemplate? {
            val uid = (item["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val name = (item["name"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val description = (item["description"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val category = (item["template_category"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val taskCount = (item["task_count"] as? JsonPrimitive)?.intOrNull ?: 0
            return ProjectTemplate(
                uid = uid,
                name = name,
                description = description,
                category = category,
                taskCount = taskCount,
            )
        }
    }
}

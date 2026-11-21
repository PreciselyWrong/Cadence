package ch.nicolab.cadence.tasks.attachments

import ch.nicolab.cadence.tasks.plugins.NotConnected
import ch.nicolab.cadence.tasks.sync.ServerSession
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/** Cible d'une liste de pièces jointes : une tâche ou un projet. */
sealed interface AttachmentTarget {
    val listPath: String
    val uploadPath: String
    fun deletePath(attachmentUid: String): String
    fun downloadPath(attachmentUid: String): String

    data class Task(val taskUid: String) : AttachmentTarget {
        override val listPath: String get() = "/api/v1/tasks/$taskUid/attachments"
        override val uploadPath: String get() = "/api/v1/upload/task-attachment"
        override fun deletePath(attachmentUid: String): String =
            "/api/v1/tasks/$taskUid/attachments/$attachmentUid"
        override fun downloadPath(attachmentUid: String): String =
            "/api/v1/attachments/$attachmentUid/download"
    }

    data class Project(val projectUid: String) : AttachmentTarget {
        override val listPath: String get() = "/api/v1/project/$projectUid/attachments"
        override val uploadPath: String get() = "/api/v1/project/$projectUid/attachments"
        override fun deletePath(attachmentUid: String): String =
            "/api/v1/project/$projectUid/attachments/$attachmentUid"
        override fun downloadPath(attachmentUid: String): String =
            "/api/v1/project/$projectUid/attachments/$attachmentUid/download"
    }
}

/** Pièce jointe d'une tâche ou d'un projet sur le serveur. */
data class AttachmentItem(
    val uid: String,
    val originalFilename: String,
    val title: String? = null,
    val fileSize: Long = 0L,
    val mimeType: String = "application/octet-stream",
    val createdAt: String? = null,
) {
    val displayName: String
        get() = title?.takeIf { it.isNotBlank() } ?: originalFilename
}

/**
 * Client en ligne pour les pièces jointes des tâches et projets.
 * Hors ligne, les appels lèvent une exception réseau.
 */
class AttachmentsClient internal constructor(
    private val session: suspend () -> ServerSession?,
    private val callObj: suspend (method: String, path: String, body: JsonObject?) -> JsonObject,
    private val callJson: suspend (method: String, path: String) -> JsonElement,
) {
    /** Vérifie si le drapeau `attachments` est actif sur le serveur. */
    suspend fun isEnabled(): Boolean {
        val flags = callObj("GET", "/api/v1/feature-flags", null)
        val hosted = (flags["featureFlags"] as? JsonObject)
            ?.get("hosted")
            ?.let { (it as? JsonPrimitive)?.booleanOrNull } == true
        val billing = if (hosted) callObj("GET", "/api/v1/billing", null) else null
        return parseAttachmentsEnabled(flags, billing)
    }

    suspend fun list(target: AttachmentTarget): List<AttachmentItem> =
        parseAttachmentsList(callJson("GET", target.listPath))

    suspend fun delete(target: AttachmentTarget, attachmentUid: String) {
        callObj("DELETE", target.deletePath(attachmentUid), null)
    }

    /** Envoie un fichier en `multipart/form-data` avec le champ `file` (et `taskUid` pour une tâche). */
    suspend fun upload(
        target: AttachmentTarget,
        filename: String,
        mimeType: String,
        contentLength: Long,
        openStream: () -> InputStream,
    ): AttachmentItem = withContext(Dispatchers.IO) {
        val server = session() ?: throw NotConnected()
        val boundary = "----Cadence${UUID.randomUUID().toString().replace("-", "")}"
        val safeName = filename.replace("\"", "_").replace("\r", "").replace("\n", "")
        val safeMime = mimeType.ifBlank { "application/octet-stream" }

        val prefixBuilder = StringBuilder()
        if (target is AttachmentTarget.Task) {
            prefixBuilder.append("--").append(boundary).append("\r\n")
            prefixBuilder.append("Content-Disposition: form-data; name=\"taskUid\"\r\n\r\n")
            prefixBuilder.append(target.taskUid).append("\r\n")
        }
        prefixBuilder.append("--").append(boundary).append("\r\n")
        prefixBuilder.append("Content-Disposition: form-data; name=\"file\"; filename=\"").append(safeName).append("\"\r\n")
        prefixBuilder.append("Content-Type: ").append(safeMime).append("\r\n\r\n")

        val prefixBytes = prefixBuilder.toString().toByteArray(Charsets.UTF_8)
        val suffixBytes = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)

        val url = URL(server.baseUrl.trimEnd('/') + target.uploadPath)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = TIMEOUT_MS
            readTimeout = UPLOAD_READ_TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${server.token}")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            if (contentLength >= 0) {
                setFixedLengthStreamingMode(prefixBytes.size + contentLength + suffixBytes.size)
            } else {
                setChunkedStreamingMode(BUFFER_SIZE)
            }
        }
        try {
            connection.outputStream.use { out ->
                out.write(prefixBytes)
                openStream().use { input ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                    }
                }
                out.write(suffixBytes)
                out.flush()
            }
            val code = connection.responseCode
            if (code !in 200..299) {
                val errText = runCatching {
                    connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                }.getOrNull()
                throw IOException(extractErrorMessage(errText) ?: "HTTP $code")
            }
            val body = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            val json = Json.parseToJsonElement(body).jsonObject
            parseAttachment(json) ?: throw IOException("Réponse inattendue du serveur")
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Télécharge la pièce jointe dans `cacheDir/attachments/` via un fichier `.part`.
     * Réutilise le fichier déjà présent s'il a la taille attendue.
     */
    suspend fun downloadToCache(
        target: AttachmentTarget,
        item: AttachmentItem,
        cacheDir: File,
    ): File = withContext(Dispatchers.IO) {
        val dir = File(cacheDir, "attachments").apply { mkdirs() }
        val dest = File(dir, sanitizeCacheFilename(item.uid, item.originalFilename))
        if (dest.isFile && dest.length() > 0 && (item.fileSize <= 0L || dest.length() == item.fileSize)) {
            return@withContext dest
        }

        val server = session() ?: throw NotConnected()
        val url = URL(server.baseUrl.trimEnd('/') + target.downloadPath(item.uid))
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = UPLOAD_READ_TIMEOUT_MS
            setRequestProperty("Authorization", "Bearer ${server.token}")
        }
        val part = File(dir, dest.name + ".part")
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                val errText = runCatching {
                    connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                }.getOrNull()
                throw IOException(extractErrorMessage(errText) ?: "HTTP $code")
            }
            connection.inputStream.use { input ->
                part.outputStream().use { out ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                    }
                }
            }
            if (!part.renameTo(dest)) {
                part.copyTo(dest, overwrite = true)
            }
            dest
        } finally {
            part.delete()
            connection.disconnect()
        }
    }

    companion object {
        private const val TIMEOUT_MS = 15_000
        private const val UPLOAD_READ_TIMEOUT_MS = 60_000
        private const val BUFFER_SIZE = 32 * 1024

        fun parseAttachmentsEnabled(flagsJson: JsonObject, billingJson: JsonObject? = null): Boolean {
            val featureFlags = flagsJson["featureFlags"] as? JsonObject
            val explicit = featureFlags?.get("attachments")?.let { (it as? JsonPrimitive)?.booleanOrNull }
            if (explicit == false) return false
            val hosted = featureFlags?.get("hosted")?.let { (it as? JsonPrimitive)?.booleanOrNull } == true
            if (!hosted || billingJson == null) return true
            val reason = (billingJson["reason"] as? JsonPrimitive)?.contentOrNull
            if (reason != "trial") return true
            val trialFlag = (billingJson["features"] as? JsonObject)
                ?.get("attachments")
                ?.let { (it as? JsonPrimitive)?.booleanOrNull }
            return trialFlag != false
        }

        fun parseAttachmentsList(element: JsonElement): List<AttachmentItem> =
            (element as? JsonArray).orEmpty().mapNotNull { item ->
                (item as? JsonObject)?.let(::parseAttachment)
            }

        fun parseAttachment(json: JsonObject): AttachmentItem? {
            val uid = (json["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val filename = (json["original_filename"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
                ?: return null
            val title = (json["title"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val fileSize = (json["file_size"] as? JsonPrimitive)?.longOrNull ?: 0L
            val mimeType = (json["mime_type"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
                ?: "application/octet-stream"
            val createdAt = (json["created_at"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            return AttachmentItem(
                uid = uid,
                originalFilename = filename,
                title = title,
                fileSize = fileSize,
                mimeType = mimeType,
                createdAt = createdAt,
            )
        }

        fun formatFileSize(bytes: Long): String {
            if (bytes < 0L) return "0 o"
            if (bytes < 1024L) return "$bytes o"
            val kb = bytes / 1024.0
            if (kb < 1024.0) return String.format(java.util.Locale.FRENCH, "%.1f Ko", kb)
            val mb = kb / 1024.0
            return String.format(java.util.Locale.FRENCH, "%.1f Mo", mb)
        }

        fun sanitizeCacheFilename(uid: String, originalFilename: String): String {
            val cleanUid = uid.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val cleanName = originalFilename
                .substringAfterLast('/')
                .substringAfterLast('\\')
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .ifBlank { "fichier" }
            return "${cleanUid}_$cleanName"
        }

        internal fun extractErrorMessage(text: String?): String? {
            if (text.isNullOrBlank()) return null
            return runCatching {
                val obj = Json.parseToJsonElement(text).jsonObject
                (obj["error"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
                    ?: (obj["message"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            }.getOrNull()
        }
    }
}

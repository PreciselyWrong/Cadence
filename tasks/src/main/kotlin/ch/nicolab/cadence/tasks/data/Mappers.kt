package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

internal fun TaskRow.toItem(accountZone: ZoneId, deviceZone: ZoneId): TaskItem = with(task) {
    TaskItem(
        uid = uid,
        name = name,
        note = note,
        status = status,
        priority = priority,
        dueDate = parseInstant(dueDateRaw),
        dueHasTime = dueHasTime,
        dueDay = dueDayOf(dueDateRaw, dueHasTime, accountZone, deviceZone),
        deferUntil = parseInstant(deferUntilRaw),
        reminderAt = parseInstant(reminderAtRaw),
        recurrenceType = recurrenceType,
        projectUid = projectUid,
        areaUid = areaUid,
        parentTaskUid = parentTaskUid,
        tagUids = WireCodec.decodeTagUids(tagUidsJson),
        completedAt = parseInstant(completedAtRaw),
        pinnedAt = parseInstant(pinnedAtRaw),
        pendingSync = pendingSync,
    )
}

internal fun ProjectEntity.toItem() = ProjectItem(uid, name, status, color, areaUid, pinToSidebar)

internal fun AreaEntity.toItem() = AreaItem(uid, name, color)

internal fun TagEntity.toItem() = TagItem(uid, name, color)

internal fun InboxRow.toEntry() = InboxEntry(
    uid = item.uid,
    content = item.content,
    status = item.status,
    createdAt = parseInstant(item.createdAtRaw),
    pendingSync = pendingSync,
)

/**
 * Jour calendaire d'une échéance. Sans heure, le serveur stocke la fin du jour dans le
 * fuseau du compte ; avec heure, l'instant appartient au fuseau de l'appareil.
 */
internal fun dueDayOf(dueDateRaw: String?, dueHasTime: Boolean, accountZone: ZoneId, deviceZone: ZoneId): LocalDate? =
    parseInstant(dueDateRaw)?.atZone(if (dueHasTime) deviceZone else accountZone)?.toLocalDate()

/** Les dates serveur sont ISO-8601 avec un décalage ; une valeur illisible reste absente. */
internal fun parseInstant(raw: String?): Instant? =
    raw?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }

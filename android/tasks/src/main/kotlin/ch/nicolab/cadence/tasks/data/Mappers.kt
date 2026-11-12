package ch.nicolab.cadence.tasks.data

import ch.nicolab.cadence.tasks.model.AreaItem
import ch.nicolab.cadence.tasks.model.GoalBucket
import ch.nicolab.cadence.tasks.model.GoalHorizon
import ch.nicolab.cadence.tasks.model.GoalItem
import ch.nicolab.cadence.tasks.model.InboxEntry
import ch.nicolab.cadence.tasks.model.LinkItem
import ch.nicolab.cadence.tasks.model.LinkKind
import ch.nicolab.cadence.tasks.model.LinkStatus
import ch.nicolab.cadence.tasks.model.NoteItem
import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.Repetition
import ch.nicolab.cadence.tasks.model.TagItem
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

internal fun TaskRow.toItem(accountZone: ZoneId, deviceZone: ZoneId): TaskItem = with(task) {
    val extras = TaskExtras.parse(extrasJson)
    val startHasTime = extras["start_has_time"] == "true"
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
        startDate = parseInstant(extras["start_date"]),
        startHasTime = startHasTime,
        startDay = dueDayOf(extras["start_date"], startHasTime, accountZone, deviceZone),
        estimatedMinutes = extras["estimated_minutes"]?.toIntOrNull(),
        repetition = Repetition.of(recurrenceType, extras["recurrence_interval"]),
        extras = extras,
        fileBacked = fileBacked,
        inViewAt = parseInstant(inViewAtRaw),
        weekOf = parseDay(weekOf),
        monthOf = parseDay(monthOf),
        needsWhen = needsWhen,
        reviewOn = parseDay(reviewOn),
        reviewedAt = parseInstant(reviewedAtRaw),
        someday = someday,
        goalUid = extras["goal_uid"],
        recurrence = TaskExtras.recurrenceRule(extrasJson, accountZone),
    )
}

internal fun ProjectEntity.toItem() = ProjectItem(
    uid = uid,
    name = name,
    status = status,
    color = color,
    areaUid = areaUid,
    pinToSidebar = pinToSidebar,
    sourceType = sourceType,
    nextTaskUid = nextTaskUid,
    goalUid = goalUid,
    icon = icon,
    parentProjectUid = parentProjectUid,
    imageUrl = imageUrl,
)

internal fun GoalEntity.toItem() = GoalItem(
    uid = uid,
    title = title,
    why = why,
    horizon = GoalHorizon.fromWire(horizon),
    targetDate = parseDay(targetDateRaw),
    status = status,
    color = color,
    bucket = GoalBucket.fromWire(bucket),
    areaUid = areaUid,
    parentGoalUid = parentGoalUid,
)

internal fun AreaEntity.toItem() = AreaItem(uid, name, color)

internal fun TagEntity.toItem() = TagItem(uid, name, color, icon, parentUid)

internal fun NoteRow.toItem() = NoteItem(
    uid = note.uid,
    title = note.title,
    content = note.content,
    projectUid = note.projectUid,
    tagUids = WireCodec.decodeTagUids(note.tagUidsJson),
    color = note.color,
    updatedAt = parseInstant(note.updatedAtRaw),
    pendingSync = pendingSync,
    pinned = note.pinned,
)

internal fun LinkRow.toItem() = LinkItem(
    uid = link.uid,
    url = link.url,
    title = link.title,
    description = link.description,
    imageUrl = link.imageUrl,
    siteName = link.siteName,
    kind = LinkKind.fromWire(link.kind),
    githubStars = link.githubStars,
    githubLanguage = link.githubLanguage,
    githubLastCommit = parseInstant(link.githubLastCommitRaw),
    readmeExcerpt = link.readmeExcerpt,
    note = link.note,
    status = LinkStatus.fromWire(link.status),
    tagUids = WireCodec.decodeTagUids(link.tagUidsJson),
    sourceType = link.sourceType,
    sourceUid = link.sourceUid,
    fetching = link.fetchStatus == "pending",
    createdAt = parseInstant(link.createdAtRaw),
    pendingSync = pendingSync,
    reviewAt = parseDay(link.reviewAtRaw),
    projectUid = link.projectUid,
)

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

/**
 * Jour d'une occurrence récurrente, tel que le serveur le désigne : toujours dans le fuseau du compte,
 * même pour une échéance avec heure.
 */
internal fun occurrenceDayOf(dueDateRaw: String?, accountZone: ZoneId): LocalDate? =
    parseInstant(dueDateRaw)?.atZone(accountZone)?.toLocalDate()

/** Jour seul (`YYYY-MM-DD`) ; une valeur illisible reste absente. */
internal fun parseDay(raw: String?): LocalDate? =
    raw?.let { runCatching { LocalDate.parse(it.take(DAY_LENGTH)) }.getOrNull() }

private const val DAY_LENGTH = 10

/** Les dates serveur sont ISO-8601 avec un décalage ; une valeur illisible reste absente. */
internal fun parseInstant(raw: String?): Instant? =
    raw?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }

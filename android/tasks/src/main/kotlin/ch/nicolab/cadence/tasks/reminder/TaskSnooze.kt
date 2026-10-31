package ch.nicolab.cadence.tasks.reminder

import java.time.Instant

/**
 * « Plus tard » sur une notification de rappel : reste local à l'appareil, jamais envoyé au serveur.
 * [reminderAt] est le rappel d'origine : un rappel déplacé depuis annule le report.
 */
internal data class TaskSnooze(val uid: String, val reminderAt: Long, val triggerAt: Instant) {
    fun encode(): String = "$uid|$reminderAt|${triggerAt.toEpochMilli()}"

    companion object {
        fun decode(raw: String): TaskSnooze? {
            val parts = raw.split('|')
            if (parts.size < 3) return null
            // L'uid peut contenir le séparateur : les deux derniers champs sont numériques.
            val triggerAt = parts[parts.size - 1].toLongOrNull() ?: return null
            val reminderAt = parts[parts.size - 2].toLongOrNull() ?: return null
            val uid = parts.dropLast(2).joinToString("|")
            return if (uid.isEmpty()) null else TaskSnooze(uid, reminderAt, Instant.ofEpochMilli(triggerAt))
        }

        /** Un seul report par tâche : le dernier remplace le précédent. */
        fun replacing(stored: Set<String>, snooze: TaskSnooze): Set<String> = without(stored, snooze.uid) + snooze.encode()

        fun without(stored: Set<String>, uid: String): Set<String> =
            stored.filterTo(HashSet()) { decode(it)?.uid != uid }
    }
}

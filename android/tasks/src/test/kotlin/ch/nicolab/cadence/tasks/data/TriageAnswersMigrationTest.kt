package ch.nicolab.cadence.tasks.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TriageAnswersMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TududiDatabase::class.java,
    )

    private fun call(key: String, path: String) =
        "INSERT INTO deferred_calls (`key`, method, path, bodyJson, label, createdAtMs, attempts, lastError) " +
            "VALUES ('$key', 'POST', '$path', '{\"answer\":\"yes\"}', 'À trier', 1, 0, NULL)"

    @Test
    fun queuedAnswersMoveToTheTriageRouteAndOtherCallsStay() {
        helper.createDatabase("triage-answers", 22).apply {
            execSQL(call("brief-answer:k1", "/api/v1/daily-plan/2026-11-12/brief/answers"))
            execSQL(call("triage-answer:k2", "/api/v1/daily-plan/2026-11-13/brief/answers"))
            execSQL(call("brief-carry:k3", "/api/v1/daily-plan/2026-11-13/carry-over"))
            close()
        }

        helper.runMigrationsAndValidate("triage-answers", 23, true, MIGRATION_22_23).use { db ->
            db.query("SELECT `key`, path, bodyJson FROM deferred_calls ORDER BY `key`").use {
                val rows = buildList { while (it.moveToNext()) add(Triple(it.getString(0), it.getString(1), it.getString(2))) }
                assertEquals(
                    listOf(
                        Triple("brief-answer:k1", "/api/v1/triage/answers", "{\"answer\":\"yes\"}"),
                        Triple("brief-carry:k3", "/api/v1/daily-plan/2026-11-13/carry-over", "{\"answer\":\"yes\"}"),
                        Triple("triage-answer:k2", "/api/v1/triage/answers", "{\"answer\":\"yes\"}"),
                    ),
                    rows,
                )
            }
        }
    }
}

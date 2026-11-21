package ch.nicolab.cadence.tasks.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommentVisibilityTest {
    private lateinit var database: TududiDatabase

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, TududiDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun hidesSoftDeletedCommentsAndCommentsWhoseTaskIsAbsent() = runBlocking {
        database.taskDao().upsert(
            WireCodec.taskFromWire(
                Json.parseToJsonElement("""{"uid":"t1","name":"T1"}""").jsonObject,
            ),
        )
        database.commentDao().upsert(
            WireCodec.commentFromWire(
                Json.parseToJsonElement(
                    """{"uid":"c-live","task_uid":"t1","body":"Visible","deleted_at":null}""",
                ).jsonObject,
            ),
        )
        database.commentDao().upsert(
            WireCodec.commentFromWire(
                Json.parseToJsonElement(
                    """{"uid":"c-deleted","task_uid":"t1","body":"","deleted_at":"2026-11-21T09:30:00.000Z"}""",
                ).jsonObject,
            ),
        )
        database.commentDao().upsert(
            WireCodec.commentFromWire(
                Json.parseToJsonElement(
                    """{"uid":"c-orphan","task_uid":"t-missing","body":"Orphan","deleted_at":null}""",
                ).jsonObject,
            ),
        )

        val visibleForT1 = database.commentDao().observeForTask("t1").first()
        assertEquals(listOf("c-live"), visibleForT1.map { it.comment.uid })

        val visibleForMissing = database.commentDao().observeForTask("t-missing").first()
        assertEquals(emptyList<String>(), visibleForMissing.map { it.comment.uid })

        database.taskDao().delete("t1")
        val afterTaskDelete = database.commentDao().observeForTask("t1").first()
        assertEquals(emptyList<String>(), afterTaskDelete.map { it.comment.uid })
    }
}

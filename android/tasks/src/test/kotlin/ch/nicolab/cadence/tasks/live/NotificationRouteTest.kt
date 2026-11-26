package ch.nicolab.cadence.tasks.live

import android.content.Intent
import ch.nicolab.cadence.tasks.widget.EXTRA_OPEN_TASK_UID
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NotificationRouteTest {
    @After
    fun clear() = NotificationRoute.consume()

    // Widget, rappel et feuille de partage passent par openTaskIntent ; l'app qui tourne déjà le reçoit dans
    // onNewIntent, où seul NotificationRoute est lu.
    @Test
    fun aTaskIntentFromAWidgetRoutesToThatTask() {
        NotificationRoute.route(Intent().putExtra(EXTRA_OPEN_TASK_UID, "t1"))

        assertEquals(NotificationTarget.Task("t1"), NotificationRoute.pending.value)
    }

    @Test
    fun aNotificationTargetWinsOverATaskExtra() {
        val intent = Intent()
            .putExtra(NotificationRoute.EXTRA_TARGET, NotificationTargets.encode(NotificationTarget.Career))
            .putExtra(EXTRA_OPEN_TASK_UID, "t1")

        NotificationRoute.route(intent)

        assertEquals(NotificationTarget.Career, NotificationRoute.pending.value)
    }

    @Test
    fun anIntentWithoutTargetLeavesNothingPending() {
        NotificationRoute.route(Intent())

        assertNull(NotificationRoute.pending.value)
    }
}

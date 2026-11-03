package ch.nicolab.cadence.tasks.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlarmManager

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class ReminderAlarmsDozeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val pending = PendingIntent.getBroadcast(context, 1, Intent("test"), PendingIntent.FLAG_IMMUTABLE)

    @After
    fun restore() = ShadowAlarmManager.setCanScheduleExactAlarms(true)

    @Test
    fun withoutExactAlarmsTheReminderStillRingsWhileThePhoneSleeps() {
        // A plain window alarm waits for Doze to end: a 5:50 reminder then fires after the event started.
        ShadowAlarmManager.setCanScheduleExactAlarms(false)
        val trigger = 1_800_000_000_000L

        ReminderAlarms.arm(context, trigger, pending)

        val alarm = shadowOf(alarms).scheduledAlarms.single()
        assertTrue(alarm.isAllowWhileIdle)
        assertEquals(ReminderAlarms.windowStart(trigger), alarm.triggerAtMs)
    }

    @Test
    fun withExactAlarmsTheReminderRingsOnTimeWhileThePhoneSleeps() {
        ShadowAlarmManager.setCanScheduleExactAlarms(true)
        val trigger = 1_800_000_000_000L

        ReminderAlarms.arm(context, trigger, pending)

        val alarm = shadowOf(alarms).scheduledAlarms.single()
        assertTrue(alarm.isAllowWhileIdle)
        assertEquals(trigger, alarm.triggerAtMs)
    }
}

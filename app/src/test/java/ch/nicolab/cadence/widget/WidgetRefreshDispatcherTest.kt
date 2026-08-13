package ch.nicolab.cadence.widget

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WidgetRefreshDispatcherTest {
    @Test
    fun `refresh continues independently from the screen lifecycle`() {
        val refreshed = CountDownLatch(1)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val dispatcher = WidgetRefreshDispatcher(scope) { refreshed.countDown() }

        dispatcher.request()

        assertTrue(refreshed.await(2, TimeUnit.SECONDS))
    }
}

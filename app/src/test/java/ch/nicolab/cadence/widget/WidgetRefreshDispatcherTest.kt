package ch.nicolab.cadence.widget

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
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

    @Test
    fun `caller can wait for the requested refresh before confirming`() {
        var refreshed = false
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val dispatcher = WidgetRefreshDispatcher(scope) { delay(50); refreshed = true }

        runBlocking { dispatcher.request().join() }

        assertTrue(refreshed)
    }
}

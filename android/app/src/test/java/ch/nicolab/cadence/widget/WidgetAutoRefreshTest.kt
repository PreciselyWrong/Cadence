package ch.nicolab.cadence.widget

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class WidgetAutoRefreshTest {

    @Test
    fun `une revision declenche un rendu`() = runTest {
        val revisions = MutableSharedFlow<Int>()
        var refreshes = 0
        val scope = TestScope(StandardTestDispatcher(testScheduler))
        WidgetAutoRefresh(revisions) { refreshes++ }.start(scope)
        scope.advanceUntilIdle()

        revisions.emit(1)
        scope.advanceUntilIdle()

        assertEquals(1, refreshes)
    }

    @Test
    fun `une rafale d ecritures ne rend qu une fois`() = runTest {
        val revisions = MutableSharedFlow<Int>()
        var refreshes = 0
        val scope = TestScope(StandardTestDispatcher(testScheduler))
        WidgetAutoRefresh(revisions, quietMillis = 60) { refreshes++ }.start(scope)
        scope.advanceUntilIdle()

        repeat(5) {
            revisions.emit(it)
            scope.advanceTimeBy(10)
        }
        scope.advanceUntilIdle()

        assertEquals(1, refreshes)
    }

    @Test
    fun `des revisions continues ne repoussent pas le rendu`() = runTest {
        val revisions = MutableSharedFlow<Int>()
        var refreshes = 0
        val scope = TestScope(StandardTestDispatcher(testScheduler))
        WidgetAutoRefresh(revisions, quietMillis = 60) { refreshes++ }.start(scope)
        scope.advanceUntilIdle()

        repeat(10) {
            revisions.emit(it)
            scope.advanceTimeBy(10)
        }

        assertEquals(1, refreshes)
    }

    @Test
    fun `une revision ne peut pas annuler un rendu en cours`() = runTest {
        val revisions = MutableSharedFlow<Int>()
        var refreshesCompleted = 0
        val scope = TestScope(StandardTestDispatcher(testScheduler))
        WidgetAutoRefresh(revisions, quietMillis = 60) {
            delay(50)
            refreshesCompleted++
        }.start(scope)
        scope.advanceUntilIdle()

        revisions.emit(1)
        scope.advanceTimeBy(80)
        revisions.emit(2)
        scope.advanceUntilIdle()

        assertEquals(2, refreshesCompleted)
    }
}

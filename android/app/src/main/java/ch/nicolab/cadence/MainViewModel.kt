package ch.nicolab.cadence

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.entities.HabitQuickValueEntity
import ch.nicolab.cadence.data.local.entities.HabitReminderEntity
import ch.nicolab.cadence.data.local.model.IdentifiedPause
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEntry
import ch.nicolab.cadence.domain.LearnedAnswer
import ch.nicolab.cadence.domain.LearnedPattern
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.domain.LearnedQuestionSettings
import ch.nicolab.cadence.domain.GoalType
import ch.nicolab.cadence.domain.AbstinenceStats
import ch.nicolab.cadence.domain.AbstinenceJournalSummary
import ch.nicolab.cadence.domain.AbstinenceStatsCalculator
import ch.nicolab.cadence.domain.AlcoholConsumption
import ch.nicolab.cadence.domain.AlcoholStats
import ch.nicolab.cadence.domain.AlcoholStatsCalculator
import ch.nicolab.cadence.domain.HabitEntryCorrection
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitPause
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.HealthConnectImportPlanner
import ch.nicolab.cadence.domain.HealthConnectRule
import ch.nicolab.cadence.domain.PauseReason
import ch.nicolab.cadence.domain.HabitInsights
import ch.nicolab.cadence.domain.HabitInsightsCalculator
import ch.nicolab.cadence.domain.HabitStatisticsSummary
import ch.nicolab.cadence.domain.HabitActivityStats
import ch.nicolab.cadence.domain.InsightDay
import ch.nicolab.cadence.domain.PeriodType
import ch.nicolab.cadence.domain.HabitStreak
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.StreakCalculator
import ch.nicolab.cadence.domain.isPlannedOn
import ch.nicolab.cadence.domain.TodayPresentation
import ch.nicolab.cadence.reminder.ReminderScheduler
import ch.nicolab.cadence.reminder.ReminderNotifications
import ch.nicolab.cadence.reminder.AbstinenceMilestoneScheduler
import ch.nicolab.cadence.reminder.AlcoholFollowUpPlanner
import ch.nicolab.cadence.reminder.AlcoholFollowUpScheduler
import ch.nicolab.cadence.reminder.LearnedQuestionScheduler
import ch.nicolab.cadence.reminder.TimerNotifications
import ch.nicolab.cadence.health.HealthConnectAvailability
import ch.nicolab.cadence.health.HealthConnectGateway
import ch.nicolab.cadence.health.HealthConnectPermissionMissing
import java.time.Clock
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first

data class DirectActionReceipt(
    val habitId: String,
    val entryId: String? = null,
    val previousTimer: HabitTimer? = null,
    val startedTimer: HabitTimer? = null,
)

data class HabitCardState(
    val stored: PersistedHabit,
    val evaluation: HabitEvaluation,
    val quickValues: List<Long>,
    val reminders: List<HabitReminderEntity>,
    val history: List<PeriodStat>,
    val entryCount: Int,
    val dailyHistory: List<DailyStat>,
    /** Tendances calculées sur la même fenêtre, absentes quand l'échantillon ne les porte pas. */
    val insights: HabitInsights,
    /** Historique complet, de la plus récente à la plus ancienne, pour lecture et correction. */
    val recentEntries: List<HabitEntry>,
    /** Sauts et suspensions de l'habitude, avec leur identifiant pour les annuler. */
    val pauses: List<IdentifiedPause>,
    /** Périodes planifiées réussies d'affilée, et meilleure série passée. */
    val streak: HabitStreak,
    val abstinenceStats: AbstinenceStats? = null,
    val alcoholConsumptions: List<AlcoholConsumption> = emptyList(),
    val alcoholStats: AlcoholStats? = null,
    val statistics: HabitStatisticsSummary? = null,
    val activityStats: HabitActivityStats? = null,
) {
    /** Saut du jour encore annulable, s'il existe. */
    fun cancellableSkip(today: LocalDate): IdentifiedPause? =
        pauses.firstOrNull { it.pause.isCancellableOn(today) }

    /** Suspension en cours qu'une reprise anticipée peut écourter. */
    fun activePause(today: LocalDate): IdentifiedPause? =
        pauses.firstOrNull { !it.pause.isSingleDay && it.pause.includes(today) }
}

data class PeriodStat(
    val label: String,
    val progressMinor: Long,
    val targetMinor: Long,
    val succeeded: Boolean,
    val excludedByPause: Boolean,
)

data class HealthConnectSourceOption(
    val packageName: String,
    val label: String,
)

/** Réglage d'une habitude et sa régularité observée, lus ensemble pour le panneau. */
data class LearnedPanelState(val settings: LearnedQuestionSettings, val pattern: LearnedPattern)

data class HealthConnectUiState(
    val availability: HealthConnectAvailability = HealthConnectAvailability.UNAVAILABLE,
    val permissionGranted: Boolean = false,
    val syncEnabled: Boolean = false,
    val syncing: Boolean = false,
    val rules: List<HealthConnectRule> = emptyList(),
    val sources: List<HealthConnectSourceOption> = emptyList(),
    val lastImportedCount: Int? = null,
    val failed: Boolean = false,
)

class MainViewModel(
    private val app: CadenceApp,
    private val repository: CadenceRepository,
    private val clock: Clock = Clock.systemDefaultZone(),
) : ViewModel() {
    private val healthConnect = HealthConnectGateway(app)
    private val healthPreferences = app.getSharedPreferences("health_connect", android.content.Context.MODE_PRIVATE)
    private val healthState = MutableStateFlow(
        HealthConnectUiState(
            availability = healthConnect.availability(),
            syncEnabled = healthPreferences.getBoolean("sync_enabled", false),
        ),
    )
    val healthConnectState: StateFlow<HealthConnectUiState> = healthState
    private val evaluator = HabitEvaluator()
    private val learnedQuestions = app.learnedQuestions
    private val pending = MutableStateFlow<List<LearnedQuestion>>(emptyList())
    /** Questions de la veille, répondues dans Habitudes › Aujourd'hui ou depuis la notification. */
    val pendingQuestions: StateFlow<List<LearnedQuestion>> = pending
    private val cards = MutableStateFlow<List<HabitCardState>>(emptyList())
    val isLoaded = MutableStateFlow(false)
    val habits: StateFlow<List<HabitCardState>> = cards.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyList(),
    )
    val lastEntryId = MutableStateFlow<String?>(null)
    private val saving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = saving
    private val savingError = MutableStateFlow<String?>(null)
    val saveError: StateFlow<String?> = savingError

    private val returning = MutableStateFlow(false)
    val offerReturn: StateFlow<Boolean> = returning

    fun dismissReturn() { returning.value = false }

    fun onAppVisible() = viewModelScope.launch {
        isLoaded.first { it }
        val preferences = app.getSharedPreferences("today_visit", android.content.Context.MODE_PRIVATE)
        val previous = preferences.getString("last_visit", null)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val today = LocalDate.now(clock)
        val ordinary = cards.value.filter { !it.stored.goal.isAbstinence && !it.stored.archived && it.stored.active }
        val latestEntry = ordinary.flatMap { it.recentEntries }.maxOfOrNull { it.localDate }
        if (TodayPresentation.shouldOfferReturn(previous, latestEntry, today, ordinary.any { it.evaluation.needsAttentionNow }) &&
            repository.getTimers().values.none { it.isRunning }
        ) returning.value = true
        preferences.edit().putString("last_visit", today.toString()).apply()
        refreshHealthConnect(autoSync = true)
    }

    fun onHealthConnectPermissionResult(granted: Set<String>) {
        val allowed = granted.containsAll(HealthConnectGateway.permissions)
        if (allowed) healthPreferences.edit().putBoolean("sync_enabled", true).apply()
        healthState.value = healthState.value.copy(permissionGranted = allowed, syncEnabled = allowed, failed = false)
        if (allowed) syncHealthConnect()
    }

    fun setHealthConnectSyncEnabled(enabled: Boolean) {
        healthPreferences.edit().putBoolean("sync_enabled", enabled).apply()
        healthState.value = healthState.value.copy(syncEnabled = enabled, failed = false)
        if (enabled) syncHealthConnect()
    }

    fun syncHealthConnect() {
        if (healthState.value.syncing) return
        viewModelScope.launch { performHealthConnectSync() }
    }

    fun saveHealthConnectRule(rule: HealthConnectRule, onSaved: () -> Unit = {}) = viewModelScope.launch {
        val habit = latest.firstOrNull { it.id == rule.habitId }
        require(habit != null && habit.active && !habit.archived && habit.goal.goalType == GoalType.DURATION)
        repository.saveHealthConnectRule(rule)
        healthState.value = healthState.value.copy(rules = repository.getHealthConnectRules(), failed = false)
        onSaved()
        if (healthState.value.syncEnabled && healthState.value.permissionGranted) performHealthConnectSync()
    }

    fun deleteHealthConnectRule(habitId: String) = viewModelScope.launch {
        repository.deleteHealthConnectRule(habitId)
        healthState.value = healthState.value.copy(rules = repository.getHealthConnectRules(), failed = false)
    }

    fun healthConnectManageIntent(): android.content.Intent = healthConnect.manageAccessIntent()

    private suspend fun refreshHealthConnect(autoSync: Boolean) {
        val availability = healthConnect.availability()
        val permission = runCatching { healthConnect.hasPermission() }.getOrDefault(false)
        val enabled = healthPreferences.getBoolean("sync_enabled", false)
        healthState.value = healthState.value.copy(
            availability = availability,
            permissionGranted = permission,
            syncEnabled = enabled,
            rules = repository.getHealthConnectRules(),
            failed = false,
        )
        if (autoSync && availability == HealthConnectAvailability.AVAILABLE && permission && enabled) {
            performHealthConnectSync()
        }
    }

    private suspend fun performHealthConnectSync() {
        if (healthState.value.syncing) return
        val availability = healthConnect.availability()
        if (availability != HealthConnectAvailability.AVAILABLE) {
            healthState.value = healthState.value.copy(availability = availability, syncing = false)
            return
        }
        healthState.value = healthState.value.copy(syncing = true, failed = false)
        try {
            if (!healthConnect.hasPermission()) {
                healthState.value = healthState.value.copy(permissionGranted = false, syncing = false)
                return
            }
            val now = clock.instant()
            val sessions = healthConnect.readSessions(now.minusSeconds(30L * 24 * 60 * 60), now, clock.zone)
            val rules = repository.getHealthConnectRules()
            val planned = HealthConnectImportPlanner.plan(rules, sessions, repository.getHealthConnectImports())
            val imported = repository.importHealthConnectEntries(planned)
            val sources = sessions.map { it.dataOriginPackage }.distinct().map { packageName ->
                HealthConnectSourceOption(
                    packageName,
                    healthConnect.applicationLabel(packageName) ?: packageName,
                )
            }.sortedBy { it.label.lowercase() }
            healthState.value = healthState.value.copy(
                permissionGranted = true,
                syncing = false,
                rules = rules,
                sources = sources,
                lastImportedCount = imported,
                failed = false,
            )
            if (imported > 0) refreshAll()
        } catch (_: HealthConnectPermissionMissing) {
            healthState.value = healthState.value.copy(permissionGranted = false, syncing = false)
        } catch (_: Exception) {
            healthState.value = healthState.value.copy(syncing = false, failed = true)
        }
    }

    /** Le reçu cible cette action précise : une saisie ultérieure ne peut pas être annulée à sa place. */
    fun directAction(item: HabitCardState, onSaved: (DirectActionReceipt) -> Unit) {
        var receipt: DirectActionReceipt? = null
        saveSafely(onSaved = { receipt?.let(onSaved) }) {
            val today = LocalDate.now(clock)
            val habit = repository.getHabitEffectiveAt(item.stored.id, today) ?: return@saveSafely
            val evaluation = evaluator.evaluate(habit.definition, today, repository.getEntries(habit.id), repository.getIdentifiedPauses(habit.id).map { it.pause })
            val quickValues = repository.getQuickValues(habit.id).map { it.amountMinor }
            val amount = TodayPresentation.directAmount(evaluation, quickValues) ?: return@saveSafely
            if (habit.timerEnabled && habit.goal.goalType == GoalType.DURATION) {
                val previous = repository.getTimer(habit.id)
                if (previous?.isRunning == true) return@saveSafely
                val started = previous?.resumedAt(clock.instant()) ?: HabitTimer.started(habit.id, clock.instant())
                repository.saveTimer(started)
                TimerNotifications.show(app, habit, started)
                receipt = DirectActionReceipt(habit.id, previousTimer = previous, startedTimer = started)
            } else {
                val id = persistEntry(item, amount, "APP")
                receipt = DirectActionReceipt(habit.id, entryId = id)
            }
            returning.value = false
        }
    }

    fun undoDirectAction(receipt: DirectActionReceipt) = saveSafely {
        if (receipt.entryId != null) {
            repository.deleteEntry(receipt.entryId)
            if (lastEntryId.value == receipt.entryId) lastEntryId.value = null
        } else if (receipt.startedTimer != null && repository.getTimer(receipt.habitId) == receipt.startedTimer) {
            if (receipt.previousTimer == null) repository.clearTimer(receipt.habitId)
            else repository.saveTimer(receipt.previousTimer)
            TimerNotifications.cancel(app, receipt.habitId)
        }
    }

    fun clearSaveError() { savingError.value = null }

    private fun saveSafely(onSaved: () -> Unit = {}, write: suspend () -> Unit) {
        if (saving.value) return
        saving.value = true
        savingError.value = null
        viewModelScope.launch {
            try {
                write()
                refreshAll()
                onSaved()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                savingError.value = app.getString(R.string.abstinence_save_failed)
            } finally {
                saving.value = false
            }
        }
    }

    private var latest: List<PersistedHabit> = emptyList()
    /** Groupes disponibles, garnis à la première ouverture avec les moments livrés. */
    val groups: StateFlow<List<HabitGroup>> = repository.observeGroups().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyList(),
    )

    init {
        viewModelScope.launch { repository.ensureDefaultGroups() }
        viewModelScope.launch { learnedQuestions.observeRevision().collect { refreshQuestions() } }

        // Les saisies venues du widget écrivent directement en base : l'état affiché est
        // reconstruit à chaque révision des habitudes, des saisies ou des pauses, sans
        // dépendre d'une copie conservée en mémoire par l'application.
        viewModelScope.launch {
            combine(
                repository.observeHabits(),
                repository.observeEntryRevision(),
                repository.observeAlcoholRevision(),
                repository.observePauseRevision(),
                flow {
                    while (true) {
                        emit(LocalDate.now(clock))
                        delay(60_000)
                    }
                }.distinctUntilChanged(),
            ) { source, _, _, _, _ -> source }.collect { source ->
                latest = source
                rebuild(source)
            }
        }
    }

    fun addEntry(
        habit: HabitCardState,
        valueMinor: Long,
        source: String = "APP",
        sessionId: String? = null,
        note: String? = null,
    ) = viewModelScope.launch {
        persistEntry(habit, valueMinor, source, sessionId, note)
        refreshAll()
    }

    private suspend fun persistEntry(
        habit: HabitCardState,
        valueMinor: Long,
        source: String,
        sessionId: String? = null,
        note: String? = null,
    ): String {
        require(valueMinor > 0)
        val now = clock.instant()
        val zone = clock.zone
        val entryId = UUID.randomUUID().toString()
        repository.addEntry(
            HabitEntry(
                id = entryId,
                habitId = habit.stored.id,
                occurredAt = now,
                localDate = now.atZone(zone).toLocalDate(),
                observedZoneId = zone,
                valueMinor = valueMinor,
                sessionId = sessionId ?: entryId,
                note = note?.trim()?.ifBlank { null },
            ),
            source = source,
        )
        lastEntryId.value = entryId
        return entryId
    }

    fun recordAbstinenceOccurrence(habit: HabitCardState, note: String?, onSaved: () -> Unit) = saveSafely(onSaved) {
        require(habit.stored.goal.isAbstinence && !habit.evaluation.isPaused)
        persistEntry(habit, 1, "APP", note = note)
    }

    fun recordAlcoholToday(habit: HabitCardState, onSaved: () -> Unit) = saveSafely(onSaved) {
        require(habit.stored.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL)
        require(!habit.evaluation.isPaused)
        val today = LocalDate.now(clock)
        val existing = repository.getAlcoholConsumptions(habit.stored.id).firstOrNull { it.localDate == today }
        if (existing == null) {
            val consumption = AlcoholConsumption(
                id = UUID.randomUUID().toString(),
                habitId = habit.stored.id,
                localDate = today,
                observedZoneId = clock.zone,
                followUpDate = today.plusDays(1),
                observedAt = clock.instant(),
            )
            repository.saveAlcoholConsumption(consumption)
            AlcoholFollowUpScheduler.schedule(
                app,
                consumption,
                habit.stored.alcoholFollowUpTime?.let { raw -> runCatching { LocalTime.parse(raw) }.getOrNull() }
                    ?: AlcoholFollowUpPlanner.defaultTime,
                clock.zone,
                clock.instant(),
            )
        }
    }

    fun saveAlcoholConsumption(
        habit: HabitCardState,
        existing: AlcoholConsumption?,
        localDate: LocalDate,
        standardDrinks: Int,
        onSaved: () -> Unit,
    ) = saveSafely(onSaved) {
        require(habit.stored.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL)
        require(standardDrinks > 0 && localDate <= LocalDate.now(clock))
        val today = LocalDate.now(clock)
        val consumption = (existing ?: AlcoholConsumption(
            id = UUID.randomUUID().toString(),
            habitId = habit.stored.id,
            localDate = localDate,
            observedZoneId = clock.zone,
            observedAt = clock.instant().takeIf { localDate == today },
        )).copy(
            localDate = localDate,
            standardDrinks = standardDrinks,
            followUpDate = null,
            followUpNotified = true,
        )
        repository.saveAlcoholConsumption(consumption)
        AlcoholFollowUpScheduler.cancel(app, consumption.id, consumption.habitId)
    }

    fun deleteAlcoholConsumption(consumption: AlcoholConsumption, onSaved: () -> Unit) = saveSafely(onSaved) {
        AlcoholFollowUpScheduler.cancel(app, consumption.id, consumption.habitId)
        repository.deleteAlcoholConsumption(consumption.id)
    }

    fun answerQuestion(question: LearnedQuestion, answer: LearnedAnswer, onSaved: () -> Unit) = saveSafely(onSaved) {
        learnedQuestions.answer(question, answer)
        LearnedQuestionScheduler.cancelAnswered(app, question.habitId, question.date)
    }

    fun dismissQuestion(question: LearnedQuestion) = saveSafely {
        learnedQuestions.dismiss(question)
        LearnedQuestionScheduler.cancelAnswered(app, question.habitId, question.date)
    }

    fun muteLearnedWeekday(habitId: String, weekday: DayOfWeek, onSaved: () -> Unit) = saveSafely(onSaved) {
        learnedQuestions.muteWeekday(habitId, weekday)
        LearnedQuestionScheduler.scheduleAll(app, learnedQuestions)
    }

    fun saveLearnedSettings(settings: LearnedQuestionSettings, onSaved: () -> Unit) = saveSafely(onSaved) {
        learnedQuestions.updateSettings(settings)
        LearnedQuestionScheduler.scheduleAll(app, learnedQuestions)
    }

    suspend fun learnedPanel(habitId: String): LearnedPanelState = LearnedPanelState(
        settings = learnedQuestions.settings(habitId),
        pattern = learnedQuestions.pattern(habitId),
    )

    fun undoLastEntry() = viewModelScope.launch {
        val id = lastEntryId.value ?: return@launch
        repository.deleteEntry(id)
        refreshAll()
        lastEntryId.value = null
    }

    fun saveHabit(
        habit: PersistedHabit,
        quickValues: List<Long>,
        reminderTimes: List<String>,
        conditionalReminders: Boolean,
        isNew: Boolean,
        onSaved: () -> Unit,
    ) = saveSafely(onSaved) {
        require(habit.name.isNotBlank())
        require(quickValues.all { it > 0 })
        // Une reprise après l'échec des rappels conserve la ligne et son historique.
        if (isNew && repository.getHabitEffectiveAt(habit.id, LocalDate.now(clock)) == null) {
            repository.addHabit(habit, habit.startsOn)
        } else repository.updateHabit(habit, effectiveFrom = if (isNew) habit.startsOn else LocalDate.now(clock))
        if (!habit.timerEnabled || habit.goal.goalType != GoalType.DURATION) {
            TimerNotifications.cancel(app, habit.id)
        }
        repository.replaceQuickValues(habit.id, quickValues.distinct())
        ReminderScheduler.cancelSnooze(app, habit.id)
        repository.getReminders(habit.id).forEach { ReminderScheduler.cancel(app, it.id) }
        val reminders = reminderTimes.distinct().map { time ->
            HabitReminderEntity(
                id = UUID.randomUUID().toString(),
                habitId = habit.id,
                time = time,
                daysOfWeek = "",
                enabled = true,
                conditional = conditionalReminders,
            )
        }
        repository.replaceReminders(habit.id, reminders)
        reminders.forEach { ReminderScheduler.schedule(app, it) }
    }

    fun archiveHabit(habit: PersistedHabit, archived: Boolean) = viewModelScope.launch {
        if (archived) ReminderScheduler.cancelSnooze(app, habit.id)
        repository.updateHabit(habit.copy(archived = archived), effectiveFrom = LocalDate.now(clock))
        refreshAll()
    }

    fun togglePause(habit: HabitCardState) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        if (habit.evaluation.isPaused) repository.resumeHabit(habit.stored.id, today)
        else repository.pauseHabit(habit.stored.id, today)
        refreshAll()
    }

    /**
     * Saute la journée avec un motif. Le saut ne valide pas l'habitude et ne casse pas la
     * série : il reste une pause d'un jour, annulable tant que ce jour dure.
     */
    fun skipToday(
        habit: HabitCardState,
        reason: PauseReason = PauseReason.REST,
        label: String? = null,
    ) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        repository.addPause(
            habit.stored.id,
            UUID.randomUUID().toString(),
            HabitPause.skip(today, reason, label),
        )
        refreshAll()
    }

    /**
     * Chronomètres en cours, réémis à chaque commande. Le temps affiché se dérive de cet
     * état et de l'horloge : rien n'a besoin d'être rattrapé après un redémarrage.
     */
    val timers: StateFlow<Map<String, HabitTimer>> = repository.observeTimers().stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        emptyMap(),
    )

    fun startTimer(habitId: String) = viewModelScope.launch {
        val existing = repository.getTimer(habitId)
        // Un second appui sur `Démarrer` ne repart pas de zéro : il reprend.
        val timer = existing?.resumedAt(clock.instant()) ?: HabitTimer.started(habitId, clock.instant())
        repository.saveTimer(timer)
        latest.firstOrNull { it.id == habitId }?.let { TimerNotifications.show(app, it, timer) }
    }

    fun pauseTimer(habitId: String) = viewModelScope.launch {
        val timer = repository.getTimer(habitId) ?: return@launch
        repository.saveTimer(timer.pausedAt(clock.instant()))
        TimerNotifications.cancel(app, habitId)
    }

    fun resetTimer(habitId: String) = viewModelScope.launch {
        repository.clearTimer(habitId)
        TimerNotifications.cancel(app, habitId)
    }

    /**
     * Termine la séance : une seule saisie de durée est enregistrée, puis le chronomètre
     * disparaît. Un chronomètre resté à zéro n'écrit rien.
     */
    fun finishTimer(habit: HabitCardState) = viewModelScope.launch {
        val timer = repository.getTimer(habit.stored.id) ?: return@launch
        val seconds = timer.elapsedSecondsAt(clock.instant())
        repository.clearTimer(habit.stored.id)
        TimerNotifications.cancel(app, habit.stored.id)
        if (seconds <= 0) {
            refreshAll()
            return@launch
        }
        addEntry(habit, seconds, source = "TIMER").join()
    }

    fun cancelSkip(pauseId: String) = viewModelScope.launch {
        repository.deletePause(pauseId)
        refreshAll()
    }

    /** Suspend plusieurs habitudes sur une plage inclusive, sélection par groupe comprise. */
    fun startTravel(habitIds: List<String>, from: LocalDate, toInclusive: LocalDate) = viewModelScope.launch {
        if (habitIds.isEmpty()) return@launch
        repository.startTravel(habitIds, from, toInclusive)
        refreshAll()
    }

    /** Reprise anticipée d'une suspension, à partir du jour choisi. */
    fun resumePause(pauseId: String, date: LocalDate = LocalDate.now(clock)) = viewModelScope.launch {
        repository.resumePause(pauseId, date)
        refreshAll()
    }

    fun moveHabit(habitId: String, direction: Int) = viewModelScope.launch {
        val ordered = latest.sortedBy(PersistedHabit::sortOrder)
        val index = ordered.indexOfFirst { it.id == habitId }
        val otherIndex = index + direction
        if (index !in ordered.indices || otherIndex !in ordered.indices) return@launch
        val current = ordered[index]
        val other = ordered[otherIndex]
        repository.updateSortOrder(current.id, other.sortOrder)
        repository.updateSortOrder(other.id, current.sortOrder)
        refreshAll()
    }

    fun duplicateHabit(habit: PersistedHabit) = viewModelScope.launch {
        val copy = habit.copy(
            id = UUID.randomUUID().toString(),
            name = "${habit.name} (copie)",
            archived = false,
            abstinenceStartedAt = if (habit.goal.isAbstinence) clock.instant() else null,
            createdAtEpochMs = 0,
            updatedAtEpochMs = 0,
            sortOrder = latest.maxOfOrNull(PersistedHabit::sortOrder)?.plus(1) ?: 0,
        )
        repository.addHabit(copy)
        repository.replaceQuickValues(copy.id, repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor))
        refreshAll()
    }

    fun deleteHabit(habitId: String) = viewModelScope.launch {
        ReminderScheduler.cancelSnooze(app, habitId)
        repository.getReminders(habitId).forEach { ReminderScheduler.cancel(app, it.id) }
        repository.getAlcoholConsumptions(habitId).forEach { AlcoholFollowUpScheduler.cancel(app, it.id, habitId) }
        AbstinenceMilestoneScheduler.cancel(app, habitId)
        repository.deleteHabit(habitId)
        refreshAll()
    }

    /**
     * Corrige une saisie déjà enregistrée. Progression, séries, statistiques et widget
     * se recalculent depuis les saisies, il n'y a donc rien d'autre à mettre à jour.
     */
    fun correctEntry(
        entry: HabitEntry,
        valueMinor: Long,
        localDate: LocalDate? = null,
        localTime: LocalTime? = null,
        note: String? = null,
        onSaved: () -> Unit,
    ) = saveSafely(onSaved) {
        val corrected = HabitEntryCorrection.apply(
            entry = entry,
            valueMinor = valueMinor,
            localDate = localDate?.takeUnless { it == entry.localDate },
            localTime = localTime?.takeUnless { it == entry.occurredAt.atZone(entry.observedZoneId).toLocalTime() },
            note = note,
        )
        repository.updateEntry(corrected)
    }

    fun deleteEntry(entryId: String, onSaved: () -> Unit) = saveSafely(onSaved) {
        repository.deleteEntry(entryId)
        if (lastEntryId.value == entryId) lastEntryId.value = null
    }

    fun saveGroup(group: HabitGroup) = viewModelScope.launch {
        repository.saveGroup(group)
        refreshAll()
    }

    fun addGroup(name: String, startMinute: Int?, endMinute: Int?) = viewModelScope.launch {
        val order = (groups.value.maxOfOrNull(HabitGroup::sortOrder) ?: 0) + 1
        repository.saveGroup(HabitGroup(UUID.randomUUID().toString(), name, startMinute, endMinute, order))
        refreshAll()
    }

    fun deleteGroup(groupId: String) = viewModelScope.launch {
        repository.deleteGroup(groupId)
        refreshAll()
    }

    /** Échange un groupe avec son voisin. `Journée` reste en tête : c'est le repli. */
    fun moveGroup(groupId: String, direction: Int) = viewModelScope.launch {
        val ordered = groups.value.sortedBy(HabitGroup::sortOrder)
        val index = ordered.indexOfFirst { it.id == groupId }
        val otherIndex = index + direction
        if (index !in ordered.indices || otherIndex !in ordered.indices) return@launch
        val current = ordered[index]
        val other = ordered[otherIndex]
        if (current.id == HabitGroup.ALL_DAY_ID || other.id == HabitGroup.ALL_DAY_ID) return@launch
        repository.saveGroups(
            listOf(
                current.copy(sortOrder = other.sortOrder),
                other.copy(sortOrder = current.sortOrder),
            ),
        )
        refreshAll()
    }

    /** Déplace une habitude vers un autre groupe, sans toucher à son objectif. */
    /**
     * Arrête la progression en gelant la cible là où elle en est. Le changement prend effet
     * aujourd'hui : les périodes déjà écoulées gardent la cible qui les a produites.
     */
    fun stopProgression(habit: PersistedHabit) = viewModelScope.launch {
        val today = LocalDate.now(clock)
        val frozen = habit.goal.withoutProgression(today)
        repository.updateHabit(habit.copy(goal = frozen), effectiveFrom = today)
        refreshAll()
    }

    fun moveHabitToGroup(habit: PersistedHabit, groupId: String) = viewModelScope.launch {
        if (habit.groupId == groupId) return@launch
        repository.updateHabit(habit.copy(groupId = groupId))
        refreshAll()
    }

    fun exportBackup(onReady: (String) -> Unit) = viewModelScope.launch { onReady(repository.exportBackup()) }

    fun importBackup(content: String, onComplete: () -> Unit, onError: (String) -> Unit) = viewModelScope.launch {
        runCatching { repository.importBackup(content) }
            .onSuccess {
                repository.getAllReminders().forEach { ReminderScheduler.schedule(app, it) }
                AlcoholFollowUpScheduler.scheduleAll(app, repository, clock.zone, clock.instant())
                LearnedQuestionScheduler.scheduleAll(app, learnedQuestions)
                refreshAll()
                onComplete()
            }
            .onFailure { onError(it.message ?: "Fichier de sauvegarde invalide") }
    }

    /**
     * Redessine l'écran après une écriture. Les widgets ne sont pas prévenus ici : ils
     * suivent les révisions de la base et se mettent à jour d'eux-mêmes.
     */
    private suspend fun refreshAll() {
        rebuild(latest)
        AbstinenceMilestoneScheduler.scheduleAll(app, repository, clock.instant())
        AlcoholFollowUpScheduler.scheduleAll(app, repository, clock.zone, clock.instant())
    }

    private suspend fun rebuild(source: List<PersistedHabit>) {
        val date = LocalDate.now(clock)
        // Chaque habitude lit la base une fois pour toutes : ses versions, ses saisies et
        // ses pauses. Les 90 jours d'historique sont ensuite dérivés en mémoire, sinon
        // l'écran reste vide le temps d'autant d'allers-retours SQL.
        val rebuilt = coroutineScope {
            source.sortedBy(PersistedHabit::sortOrder).map { habit ->
                async { buildCard(habit, date) }
            }.awaitAll()
        }
        rebuilt.filter { ReminderNotifications.shouldCancel(it.evaluation) }
            .forEach { ReminderNotifications.cancel(app, it.stored.id) }
        cards.value = rebuilt
        isLoaded.value = true
        refreshQuestions()
    }

    private suspend fun refreshQuestions() {
        pending.value = learnedQuestions.pendingQuestions(LocalDate.now(clock))
    }

    private suspend fun buildCard(habit: PersistedHabit, date: LocalDate): HabitCardState {
        val window = PeriodCalculator.window(date, habit.goal.period, habit.schedule.firstDayOfWeek)
        val identifiedPauses = repository.getIdentifiedPauses(habit.id)
        val pauses = identifiedPauses.map(IdentifiedPause::pause)
        val allEntries = repository.getEntries(habit.id)
        val alcoholConsumptions = if (habit.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL) {
            repository.getAlcoholConsumptions(habit.id)
        } else emptyList()
        val trackingEntries = if (habit.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL) alcoholConsumptions.map { consumption ->
            HabitEntry(
                id = consumption.id,
                habitId = consumption.habitId,
                occurredAt = consumption.localDate.atStartOfDay(consumption.observedZoneId).toInstant(),
                localDate = consumption.localDate,
                observedZoneId = consumption.observedZoneId,
                valueMinor = 1,
            )
        } else allEntries
        val entries = trackingEntries.filter { it.localDate >= window.start && it.localDate < window.endExclusive }
        val versions = repository.habitVersionsOf(habit.id)
        val effectiveAt = { day: LocalDate -> versions(day) ?: habit }
        val streak = StreakCalculator.compute(
            habitAt = { day -> versions(day)?.definition },
            today = date,
            entries = trackingEntries,
            pauses = pauses,
        )
        var cursor = date
        val history = buildList {
            repeat(6) {
                val historicalHabit = effectiveAt(cursor)
                val historicalWindow = PeriodCalculator.window(cursor, historicalHabit.goal.period, historicalHabit.schedule.firstDayOfWeek)
                val evaluation = evaluator.evaluate(historicalHabit.definition, cursor, trackingEntries, pauses)
                val paused = generateSequence(historicalWindow.start) { it.plusDays(1) }
                    .takeWhile { it < historicalWindow.endExclusive }
                    .any { day -> pauses.any { it.includes(day) } }
                add(PeriodStat(historicalWindow.start.toString(), evaluation.progressMinor, historicalHabit.goal.targetMinor, evaluation.isCompleted, paused))
                cursor = historicalWindow.start.minusDays(1)
            }
        }.reversed()
        val dailyStart = date.minusDays(83)
        val valuesByDate = trackingEntries.filter { it.localDate in dailyStart..date }
            .groupBy(HabitEntry::localDate)
            .mapValues { (_, dayEntries) -> dayEntries.sumOf(HabitEntry::valueMinor) }
        val dailyHistory = mutableListOf<DailyStat>()
        val insightDays = mutableListOf<InsightDay>()
        for (offset in 0 until 84) {
            val day = dailyStart.plusDays(offset.toLong())
            val historicalHabit = effectiveAt(day)
            val paused = pauses.any { it.includes(day) }
            dailyHistory.add(
                DailyStat(
                    date = day,
                    valueMinor = valuesByDate[day] ?: 0,
                    targetMinor = historicalHabit.goal.targetMinor,
                    paused = paused,
                ),
            )
            insightDays.add(
                InsightDay(
                    date = day,
                    minimumMinor = historicalHabit.goal.effectiveMinimumMinor,
                    targetMinor = historicalHabit.goal.targetMinor,
                    planned = isPlannedOn(historicalHabit.definition, day),
                    paused = paused,
                    dailyGoal = historicalHabit.goal.period == PeriodType.DAY && !historicalHabit.goal.isTracker,
                ),
            )
        }
        return HabitCardState(
            stored = habit,
            evaluation = evaluator.evaluate(habit.definition, date, entries, pauses),
            quickValues = repository.getQuickValues(habit.id).map(HabitQuickValueEntity::amountMinor),
            reminders = repository.getReminders(habit.id),
            history = history,
            entryCount = trackingEntries.size,
            dailyHistory = dailyHistory,
            insights = HabitInsightsCalculator.of(trackingEntries, date, insightDays),
            recentEntries = if (habit.goal.isAbstinence && habit.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL)
                emptyList() else trackingEntries.sortedByDescending(HabitEntry::occurredAt),
            pauses = identifiedPauses,
            streak = streak,
            statistics = if (habit.goal.isAbstinence || habit.goal.isTracker) null else HabitStatisticsSummary.compute(
                habitAt = { day -> versions(day)?.definition }, today = date, entries = trackingEntries, pauses = pauses,
            ),
            activityStats = if (habit.goal.isAbstinence) null else HabitActivityStats.compute(
                habitId = habit.id, startsOn = habit.startsOn, today = date, entries = trackingEntries,
            ),
            abstinenceStats = habit.abstinenceStartedOn(clock.zone)?.takeIf { habit.goal.isAbstinence }?.let { start ->
                AbstinenceStatsCalculator.compute(habit.id, start, date, trackingEntries, pauses)
            },
            alcoholConsumptions = alcoholConsumptions.sortedByDescending(AlcoholConsumption::localDate),
            alcoholStats = habit.abstinenceStartedOn(clock.zone)
                ?.takeIf { habit.abstinenceProfile == ch.nicolab.cadence.domain.AbstinenceProfile.ALCOHOL }
                ?.let { start -> AlcoholStatsCalculator.compute(habit.id, start, date, alcoholConsumptions, pauses) },
        )
    }
}

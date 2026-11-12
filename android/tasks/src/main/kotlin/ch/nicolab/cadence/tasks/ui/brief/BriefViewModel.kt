package ch.nicolab.cadence.tasks.ui.brief

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.brief.AnticipateDto
import ch.nicolab.cadence.tasks.brief.BriefStore
import ch.nicolab.cadence.tasks.brief.BriefUndo
import ch.nicolab.cadence.tasks.brief.BriefView
import ch.nicolab.cadence.tasks.brief.CachedBrief
import ch.nicolab.cadence.tasks.brief.CachedEvening
import ch.nicolab.cadence.tasks.brief.EveningMode
import ch.nicolab.cadence.tasks.brief.MoveDto
import ch.nicolab.cadence.tasks.brief.audio.AudioChoice
import ch.nicolab.cadence.tasks.brief.audio.AudioSource
import ch.nicolab.cadence.tasks.brief.audio.AudioTarget
import ch.nicolab.cadence.tasks.brief.audio.BriefAudioScheduler
import ch.nicolab.cadence.tasks.brief.audio.BriefPlayer
import ch.nicolab.cadence.tasks.brief.audio.BriefVoice
import ch.nicolab.cadence.tasks.brief.audio.BriefVoiceInstaller
import ch.nicolab.cadence.tasks.brief.audio.ChapterMark
import ch.nicolab.cadence.tasks.brief.audio.PlayerState
import ch.nicolab.cadence.tasks.brief.audio.StoredAudio
import ch.nicolab.cadence.tasks.brief.audio.VoiceInstallState
import ch.nicolab.cadence.tasks.brief.audioTarget
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.reminder.PlanSlotsStore
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

/** Message de l'écran, avec son annulation quand l'action en a une. */
internal class BriefNotice(val message: String, val undo: BriefUndo?)

/** Ce que la carte d'Aujourd'hui annonce : le verdict du matin, ou celui du bilan du soir. */
internal data class BriefCardState(val evening: Boolean, val verdict: String)

/**
 * Résumé du jour et bilan du soir : lit le brief (Room d'abord, serveur ensuite), les tâches et les réglages, et porte
 * les actions. Chaque action passe par [ch.nicolab.cadence.tasks.brief.BriefActions] ; l'écran n'écrit rien lui-même.
 * Un geste se voit tout de suite ([pending]) : la ligne se coche, la carte se referme sur son choix, puis « Annuler ».
 */
internal class BriefViewModel(application: Application) : AndroidViewModel(application) {
    private val briefs = TasksGraph.brief(application)
    private val evenings = TasksGraph.evening(application)
    private val settingsRepository = TasksGraph.briefSettings(application)
    private val actions = TasksGraph.briefActions(application)
    private val tasksRepository = TasksGraph.repository(application)
    private val store = TasksGraph.briefStore(application)
    private val connection = TasksGraph.connection(application)
    private val audio = TasksGraph.briefAudio(application)
    private val planSlots = PlanSlotsStore(application)
    private val player = BriefPlayer(application, viewModelScope)
    private val installer = BriefVoiceInstaller(audio.voices, viewModelScope)

    val zone: StateFlow<ZoneId> = connection.observe()
        .map { it?.accountZone ?: ZoneId.systemDefault() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ZoneId.systemDefault())

    val today: StateFlow<LocalDate> = zone
        .map { LocalDate.now(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, LocalDate.now())

    @OptIn(ExperimentalCoroutinesApi::class)
    val brief: StateFlow<CachedBrief?> = today
        .flatMapLatest { briefs.observe(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    @OptIn(ExperimentalCoroutinesApi::class)
    val evening: StateFlow<CachedEvening?> = today
        .flatMapLatest { evenings.observe(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    val tasks: StateFlow<Map<String, TaskItem>> = tasksRepository.observeAllTasks()
        .map { list -> list.associateBy { it.uid } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), emptyMap())

    val settings: StateFlow<JsonObject?> = settingsRepository.settings

    val notifyReady: StateFlow<Boolean> = store.notifyReady

    /** L'heure du compte, à la minute : sert à savoir si le bilan du soir a pris la place du résumé du matin. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val clock: StateFlow<LocalTime> = zone
        .flatMapLatest { zoneId ->
            flow {
                while (true) {
                    val now = LocalTime.now(zoneId)
                    emit(now.truncatedTo(ChronoUnit.MINUTES))
                    delay(ChronoUnit.MILLIS.between(now, now.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1)).coerceAtLeast(1))
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), LocalTime.now())

    private val eveningDue: StateFlow<Boolean> = combine(settings, clock) { current, now -> EveningMode.due(current, now) }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val forcedMorning = MutableStateFlow(false)

    /** Le résumé du matin ou le bilan du soir : le bilan prend la place après l'heure de bascule, le matin reste à un appui. */
    val view: StateFlow<BriefView> = combine(eveningDue, brief, evening, forcedMorning) { due, morning, night, forced ->
        EveningMode.view(due, night?.evening != null, morning?.brief != null, forced)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), BriefView.MORNING)

    /** Carte d'Aujourd'hui ; null sans résumé du jour lisible, ou une fois la vue du moment ouverte (ici ou sur le web). */
    val card: StateFlow<BriefCardState?> = combine(view, brief, evening, store.seen, today) { shown, morning, night, seen, day ->
        MyDay.card(
            view = shown,
            morningVerdict = morning?.brief?.verdict?.text,
            eveningVerdict = night?.evening?.verdict?.text,
            morningSeen = BriefStore.seenKey(day, BriefView.MORNING) in seen,
            eveningSeen = BriefStore.seenKey(day, BriefView.EVENING) in seen,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    /** Le jour a un résumé ou un bilan : Ma journée a déjà sa carte, inutile d'y ajouter celle du matin. */
    val hasBrief: StateFlow<Boolean> = combine(brief, evening) { morning, night -> morning?.brief != null || night?.evening != null }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), false)

    private val _pending = MutableStateFlow(BriefPending())
    /** Gestes montrés avant que Room ou le serveur ne les rattrape. */
    val pending: StateFlow<BriefPending> = _pending.asStateFlow()

    /** Ce que la voix lit pour l'écran affiché. */
    private val audioTarget: StateFlow<AudioTarget?> = combine(view, brief, evening) { shown, morning, night ->
        if (shown == BriefView.EVENING) night?.audioTarget() else morning?.audioTarget()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    /** Source et durée du bouton « Écouter » ; recalculées quand le brief, la voix, la vitesse ou le rendu changent. */
    val audioChoice: StateFlow<AudioChoice> = combine(
        audioTarget,
        audio.prefs.voiceId,
        audio.prefs.speed,
        WorkManager.getInstance(application).getWorkInfosForUniqueWorkFlow(BriefAudioScheduler.UNIQUE_NAME),
    ) { target, _, _, _ -> audio.choose(target) }
        .flowOn(Dispatchers.IO)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), AudioChoice(AudioSource.NONE, null))

    /** Identifiant `<date>-v<version>` du fichier que l'écran affiché lit ; null sans script. */
    val audioKey: StateFlow<String?> = audioTarget
        .map { target -> target?.let { ch.nicolab.cadence.tasks.brief.audio.BriefAudioFiles.key(it.date, it.version) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), null)

    val playerState: StateFlow<PlayerState> = player.state

    private val _preparing = MutableStateFlow(false)
    /** Rendu de la voix en cours après « Écouter » : le bouton montre qu'il travaille. */
    val preparing: StateFlow<Boolean> = _preparing.asStateFlow()

    private val _voiceSheet = MutableStateFlow(false)
    /** La feuille « Choisir une voix » est ouverte (aucune voix installée). */
    val voiceSheet: StateFlow<Boolean> = _voiceSheet.asStateFlow()

    val voiceInstall: StateFlow<VoiceInstallState> = installer.state

    /** Chapitres du fichier chargé dans le lecteur, pour « Chapitre n sur N » (lus dans la fiche du fichier). */
    val marks: StateFlow<List<ChapterMark>> = player.state
        .map { it.key }
        .distinctUntilChanged()
        .map { key -> key?.let { audio.files.findByKey(it) }?.meta?.marks().orEmpty() }
        .flowOn(Dispatchers.IO)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_MS), emptyList())

    private val _notices = MutableSharedFlow<BriefNotice>(extraBufferCapacity = 4)
    val notices: SharedFlow<BriefNotice> = _notices.asSharedFlow()

    init {
        // Les décisions du jour (déplacé, répondu, avis, reporté) reviennent avec l'écran, pas seulement avec le processus.
        viewModelScope.launch {
            today.collect { day -> _pending.value = BriefPending.fromLasting(store.readDecisions(day.toString())) }
        }
        // L'heure de bascule passe pendant que l'appli est ouverte : le bilan se lit sans attendre la prochaine synchro.
        viewModelScope.launch {
            eveningDue.filter { it }.collect { evenings.refreshToday() }
        }
    }

    /** À l'ouverture de l'écran : le bilan du soir redevient l'écran par défaut. */
    fun opened() {
        forcedMorning.value = false
    }

    /** La vue affichée est lue : Aujourd'hui cesse de l'annoncer, ici tout de suite et ailleurs à la prochaine synchro. */
    fun markSeen() {
        val shown = view.value
        val day = today.value
        val exists = if (shown == BriefView.EVENING) evening.value?.evening != null else brief.value?.brief != null
        if (!exists || !store.markSeen(day, shown)) return
        viewModelScope.launch {
            try {
                actions.seen(day, shown)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                // Sans l'appel, seul l'autre client continue d'annoncer cette vue : rien à montrer ici.
                Log.w(TAG, "Brief seen call not queued", error)
            }
        }
    }

    fun showMorning() {
        forcedMorning.value = true
    }

    fun showEvening() {
        forcedMorning.value = false
    }

    /** Relit le résumé du jour (et le bilan du soir quand il a pris la place) ; hors ligne, le dernier gardé reste affiché. */
    fun refresh() {
        viewModelScope.launch {
            briefs.refreshToday()
            evenings.refreshIfDue(settings.value)
            BriefAudioScheduler.request(getApplication())
        }
        player.attach()
    }

    /**
     * Lit l'écran affiché : fichier local, sinon MP3 du serveur (copié), sinon rendu tout de suite avec la voix Piper
     * installée ; sans voix, la feuille propose d'en télécharger une.
     */
    fun playAudio() {
        val target = audioTarget.value ?: return
        viewModelScope.launch {
            when (withContext(Dispatchers.IO) { audio.choose(target) }.source) {
                AudioSource.LOCAL, AudioSource.SERVER -> {
                    val stored = withContext(Dispatchers.IO) { audio.files.find(target.date, target.version) ?: audio.ensureServerCopy(target) }
                    if (stored != null) start(stored) else notify(R.string.brief_audio_unavailable)
                }
                AudioSource.RENDER -> {
                    _preparing.value = true
                    val stored = try {
                        audio.renderNow(target)
                    } finally {
                        _preparing.value = false
                    }
                    if (stored != null) start(stored) else notify(R.string.brief_audio_render_failed)
                }
                AudioSource.GET_VOICE -> _voiceSheet.value = true
                AudioSource.NONE -> notify(R.string.brief_audio_unavailable)
            }
        }
    }

    private fun start(stored: StoredAudio) {
        val resume = audio.prefs.position(stored.key).takeIf { it < stored.meta.durationMs - RESUME_END_MS } ?: 0L
        player.play(stored, resume)
    }

    /** « Télécharger » dans la feuille : installe la voix, la choisit, puis rend et lit. */
    fun downloadVoice(voice: BriefVoice) {
        installer.clearMessage()
        installer.download(voice, onInstalled = {
            audio.prefs.setVoice(voice.id)
            BriefAudioScheduler.request(getApplication())
            _voiceSheet.value = false
            playAudio()
        })
    }

    fun cancelVoiceDownload() = installer.cancel()

    fun dismissVoiceSheet() {
        installer.cancel()
        installer.clearMessage()
        _voiceSheet.value = false
    }

    fun toggleAudio() = player.toggle()

    fun nextChapter() = player.next()

    fun previousChapter() = player.previous()

    fun complete(task: TaskItem) = change(
        apply = { it.complete(task.uid) },
        revert = { it.uncomplete(task.uid) },
        message = string(R.string.brief_done_notice, task.name),
    ) { actions.complete(task.uid) }

    fun move(date: LocalDate, task: TaskItem, move: MoveDto, target: LocalDate) = change(
        apply = { it.move(move.proposalKey, target) },
        revert = { it.unmove(move.proposalKey) },
        message = string(R.string.brief_moved_notice, BriefFormat.chip(target)),
    ) { actions.move(date, move, task, target) }

    fun feedback(date: LocalDate, card: AnticipateDto, vote: String) = change(
        apply = { it.vote(card.key, vote) },
        revert = { it.unvote(card.key) },
        message = string(R.string.brief_feedback_notice),
    ) { actions.feedback(date, card, vote) }

    /**
     * « Reporter à demain » : les tâches rejoignent le plan de demain, leur échéance ne change pas. Celles que la dernière
     * lecture du plan montre déjà à demain ne repartent pas et ne seront pas retirées par « Annuler ».
     */
    fun carryOver(taskUids: List<String>) {
        val tomorrow = today.value.plusDays(1)
        val planned = planSlots.entries().filter { it.day == tomorrow }.mapTo(HashSet()) { it.uid }
        val added = taskUids.filter { it !in planned }
        if (added.isEmpty()) {
            updatePending { it.carry(taskUids) }
            return
        }
        change(
            apply = { it.carry(taskUids) },
            revert = { it.uncarry(added) },
            message = string(R.string.evening_carried_notice),
        ) { actions.carryOver(tomorrow, added) }
    }

    /** « Choisir une date » du bilan du soir : l'échéance change, la ligne dit « Échéance : jeu 6 ». */
    fun setDue(task: TaskItem, day: LocalDate) = change(
        apply = { it.decide(task.uid, RowOutcome.Due(day)) },
        revert = { it.undecide(task.uid) },
        message = string(R.string.evening_due_notice, BriefFormat.dueChip(day)),
    ) { actions.setDue(task, day) }

    fun later(task: TaskItem) = change(
        apply = { it.decide(task.uid, RowOutcome.Later) },
        revert = { it.undecide(task.uid) },
        message = string(R.string.evening_later_notice),
    ) { actions.later(task) }

    fun abandon(task: TaskItem) = change(
        apply = { it.decide(task.uid, RowOutcome.Abandoned) },
        revert = { it.undecide(task.uid) },
        message = string(R.string.evening_abandoned_notice),
    ) { actions.abandon(task) }

    /** Sauvegarde les réglages ; un refus du serveur est annoncé, la lecture gardée revient. */
    fun saveSettings(next: JsonObject) {
        viewModelScope.launch {
            settingsRepository.save(next).onFailure { error ->
                _notices.emit(BriefNotice(error.message ?: string(R.string.tasks_error_generic), null))
            }
        }
    }

    fun setNotifyReady(enabled: Boolean) = store.setNotifyReady(enabled)

    override fun onCleared() {
        // La lecture d'un fichier continue dans le service ; la feuille de voix et son téléchargement s'arrêtent avec l'écran.
        installer.cancel()
        player.release()
        super.onCleared()
    }

    /**
     * Montre [apply] tout de suite, écrit, puis propose « Annuler » (qui rend la main à [revert]). Si l'écriture échoue,
     * l'état revient et l'échec est annoncé : une ligne cochée ou une carte refermée ne ment jamais.
     */
    private fun change(
        apply: (BriefPending) -> BriefPending,
        revert: (BriefPending) -> BriefPending,
        message: String,
        block: suspend () -> BriefUndo,
    ) {
        updatePending(apply)
        viewModelScope.launch {
            try {
                val undo = block()
                val wrapped: BriefUndo = {
                    updatePending(revert)
                    undo()
                }
                _notices.emit(BriefNotice(message, wrapped))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                updatePending(revert)
                _notices.emit(BriefNotice(string(R.string.tasks_error_generic), null))
            }
        }
    }

    private fun updatePending(transform: (BriefPending) -> BriefPending) {
        _pending.update(transform)
        store.writeDecisions(today.value.toString(), _pending.value.lasting())
    }

    private suspend fun notify(res: Int) {
        _notices.emit(BriefNotice(string(res), null))
    }

    private fun string(res: Int, vararg args: Any): String = getApplication<Application>().getString(res, *args)

    private companion object {
        const val TAG = "BriefViewModel"
        const val STOP_MS = 5_000L
        const val RESUME_END_MS = 2_000L
    }
}

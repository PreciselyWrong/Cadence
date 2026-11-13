package ch.nicolab.cadence.tasks.proposals

import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

/** Onglet à montrer après un tap sur une notification de proposition : Planifier, la revue ou la carrière. */
enum class ProposalTab { PLAN, REVIEW, CAREER }

/**
 * État des propositions de ce processus : la dernière de chaque sorte (lue en ligne), la feuille de la semaine
 * ouverte, et l'onglet demandé par une notification. Rien n'est gardé sur le téléphone ; hors ligne, les appels
 * échouent avec une [java.io.IOException] que l'appelant montre.
 */
class ProposalRepository internal constructor(private val client: ProposalsClient) {
    private val _latest = MutableStateFlow<Map<ProposalKind, ProposalDto>>(emptyMap())
    val latest: StateFlow<Map<ProposalKind, ProposalDto>> = _latest.asStateFlow()

    private val _sheet = MutableStateFlow<String?>(null)

    /** Uid de la semaine prête dont la feuille est ouverte ; null hors feuille. */
    val sheet: StateFlow<String?> = _sheet.asStateFlow()

    private val _tab = MutableStateFlow<ProposalTab?>(null)

    /** Onglet demandé ; l'écran le consomme. */
    val tab: StateFlow<ProposalTab?> = _tab.asStateFlow()

    /** Jugements de la revue prête (ou partiellement appliquée) : la revue rapide les affiche. */
    val judgements: Flow<Map<String, ReviewJudgement>> = latest.map { Proposals.judgementsOf(it[ProposalKind.REVIEW]) }

    suspend fun refresh(): Result<Unit> = attempt {
        _latest.value = ProposalJson.decodeFromJsonElement<ProposalListDto>(client.list()).proposals
            .mapNotNull { dto -> ProposalKind.of(dto.kind)?.let { it to dto } }
            .toMap()
    }

    /** « Planifier ma semaine » : une seule demande en attente par sorte ; le serveur renvoie celle qui existe. */
    suspend fun create(kind: ProposalKind): Result<Unit> = attempt {
        client.create(kind)
        refresh().getOrThrow()
    }

    /** La proposition avec ses faits, pour la feuille. */
    suspend fun detail(uid: String): Result<ProposalDto> = attempt { ProposalJson.decodeFromJsonElement<ProposalDto>(client.get(uid)) }

    suspend fun reply(uid: String, text: String): Result<Unit> = attempt {
        client.reply(uid, text)
        refresh().getOrThrow()
    }

    suspend fun apply(uid: String, body: JsonObject): Result<ApplyOutcome> = attempt {
        val outcome = Proposals.applyOutcome(client.apply(uid, body))
        refresh()
        outcome
    }

    /** « Envoyer » avec des remarques : les décisions sans remarque partent, les tâches remarquées reviennent à l'agent. */
    suspend fun send(uid: String, body: JsonObject): Result<Unit> = attempt {
        client.send(uid, body)
        refresh().getOrThrow()
    }

    /** La carrière prête la plus récente, lue en ligne ; null s'il n'y en a pas. */
    suspend fun career(): Result<CareerProposalDto?> = attempt {
        CareerModel.newestReady(CareerModel.parseList(client.listCareer()))
    }

    /** Une décision de carrière ; la liste se relit ensuite par [career]. */
    suspend fun decideCareer(uid: String, decision: CareerDecision): Result<Unit> = attempt {
        client.apply(uid, CareerModel.applyBody(decision))
        Unit
    }

    suspend fun dismiss(uid: String): Result<Unit> = attempt {
        client.dismiss(uid)
        refresh().getOrThrow()
    }

    fun show(uid: String) {
        _sheet.value = uid
    }

    fun closeSheet() {
        _sheet.value = null
    }

    fun consumeTab() {
        _tab.value = null
    }

    /** Route une notification ou un lancement : la feuille d'une semaine prête, ou un onglet. */
    fun route(intent: Intent?) {
        when (intent?.getStringExtra(ProposalNotifications.EXTRA_ROUTE)) {
            ProposalNotifications.ROUTE_SHOW -> intent.getStringExtra(ProposalNotifications.EXTRA_UID)?.let(::show)
            ProposalNotifications.ROUTE_PLAN -> _tab.value = ProposalTab.PLAN
            ProposalNotifications.ROUTE_REVIEW -> _tab.value = ProposalTab.REVIEW
            ProposalNotifications.ROUTE_CAREER -> _tab.value = ProposalTab.CAREER
        }
    }

    private inline fun <T> attempt(block: () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        Result.failure(error)
    }

    companion object {
        @Volatile
        private var instance: ProposalRepository? = null

        fun of(context: Context): ProposalRepository = instance ?: synchronized(this) {
            instance ?: ProposalRepository(proposalsClient(context)).also { instance = it }
        }
    }
}

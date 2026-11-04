package ch.nicolab.cadence.tasks.brief.audio

/**
 * Archive d'une voix : [bytes] et [sha256] décrivent le `.tar.bz2` téléchargé, [required] ce qui doit exister une
 * fois décompressé, [maxExpandedBytes] la taille décompressée au-delà de laquelle l'archive est refusée.
 */
data class VoicePackage(
    val id: String,
    val archiveRoot: String,
    val bytes: Long,
    val sha256: String,
    val required: List<String>,
    val maxExpandedBytes: Long,
)

/** Voix Piper française installable sur le téléphone ; [license] est la ligne affichée dans les réglages. */
data class BriefVoice(
    val id: String,
    val title: String,
    val license: String,
    val modelFile: String,
    val pack: VoicePackage,
) {
    val url: String get() = "$RELEASE_BASE/${pack.archiveRoot}.tar.bz2"

    private companion object {
        const val RELEASE_BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
    }
}

/**
 * Les deux voix françaises de Piper en version int8, hébergées par les releases de Sherpa-ONNX. Les empreintes
 * viennent de SonOhé, qui les a vérifiées ; la fiche `MODEL_CARD` de chaque archive est décompressée avec le modèle.
 */
object BriefVoiceCatalog {
    const val DEFAULT_ID = "piper-siwis"

    val voices: List<BriefVoice> = listOf(
        BriefVoice(
            id = "piper-siwis",
            title = "Siwis",
            license = "CC BY 4.0",
            modelFile = "fr_FR-siwis-medium.onnx",
            pack = VoicePackage(
                id = "piper-siwis",
                archiveRoot = "vits-piper-fr_FR-siwis-medium-int8",
                bytes = 20_914_888L,
                sha256 = "3909cff9b3cfd4820c66aa13bf554315c82e34899c161f0b446ece372bc4b5ec",
                required = listOf("fr_FR-siwis-medium.onnx", "tokens.txt", "espeak-ng-data"),
                maxExpandedBytes = 45_000_000L,
            ),
        ),
        BriefVoice(
            id = "piper-tom",
            title = "Tom",
            license = "AGPL-3.0",
            modelFile = "fr_FR-tom-medium.onnx",
            pack = VoicePackage(
                id = "piper-tom",
                archiveRoot = "vits-piper-fr_FR-tom-medium-int8",
                bytes = 21_019_617L,
                sha256 = "b158f884eb4231b8dddd372c3dc506949630c992a8e48ca692a90323e8bb4e09",
                required = listOf("fr_FR-tom-medium.onnx", "tokens.txt", "espeak-ng-data"),
                maxExpandedBytes = 45_000_000L,
            ),
        ),
    )

    fun find(id: String?): BriefVoice? = voices.firstOrNull { it.id == id }

    /** La voix choisie, ou la première du catalogue quand l'identifiant gardé n'existe plus. */
    fun resolve(id: String?): BriefVoice = find(id) ?: voices.first()
}

package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceProfile

data class EvidenceSource(val label: Int, val url: String)

data class AbstinenceMilestone(
    val days: Long,
    val scientific: Boolean = false,
    val detail: Int = R.string.abstinence_personal_detail,
    val sources: List<EvidenceSource> = emptyList(),
    val timeLabel: Int? = null,
) {
    fun reached(completedDays: Long): Boolean = completedDays >= days
}

data class AbstinenceProfileContent(
    val label: Int,
    val defaultName: Int,
    val description: Int,
    val tip: Int,
    val notice: Int?,
    val sources: List<EvidenceSource>,
)

object AbstinenceGuide {
    private val milestoneDays = listOf(7L, 14L, 30L, 90L)
    val alcoholStudy = EvidenceSource(R.string.abstinence_source_mehta, "https://pmc.ncbi.nlm.nih.gov/articles/PMC5942469/")
    val alcoholTips = EvidenceSource(R.string.abstinence_source_niaaa_tips, "https://rethinkingdrinking.niaaa.nih.gov/tools/worksheets-more/how-stop-alcohol-cravings")
    val alcoholSafety = EvidenceSource(R.string.abstinence_source_niaaa_safety, "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/understanding-alcohol-use-disorder")
    val sexualHealth = EvidenceSource(R.string.abstinence_source_nhs, "https://www.devonsexualhealth.nhs.uk/your-sexual-health/relationships-and-intimacy/")
    val retraction = EvidenceSource(R.string.abstinence_source_retracted, "https://pubmed.ncbi.nlm.nih.gov/12659241/")
    val smokingTimeline = EvidenceSource(R.string.catalogue_source_nhs_smoking, "https://www.nhs.uk/better-health/quit-smoking/")
    val smokingBenefits = EvidenceSource(R.string.catalogue_source_cdc_smoking, "https://www.cdc.gov/tobacco/about/benefits-of-quitting.html")
    val smokingSupport = EvidenceSource(R.string.catalogue_source_cdc_support, "https://www.cdc.gov/tobacco/about/how-to-quit.html")
    val vapingSupport = EvidenceSource(R.string.catalogue_source_cdc_vaping, "https://www.cdc.gov/tobacco/e-cigarettes/quitting.html")
    val cannabisWithdrawal = EvidenceSource(R.string.catalogue_source_nida, "https://datashare.nida.nih.gov/instrument/marijuana-withdrawal-symptom-checklist")
    val caffeineAdvice = EvidenceSource(R.string.catalogue_source_fda, "https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much")

    fun content(profile: AbstinenceProfile): AbstinenceProfileContent = when (profile) {
        AbstinenceProfile.NONE -> AbstinenceProfileContent(
            R.string.abstinence_none, R.string.catalogue_none_name,
            R.string.catalogue_none_description, R.string.abstinence_personal_detail,
            null, emptyList(),
        )
        AbstinenceProfile.ALCOHOL -> AbstinenceProfileContent(
            R.string.abstinence_alcohol, R.string.catalogue_alcohol_name,
            R.string.catalogue_alcohol_description, R.string.abstinence_alcohol_tip,
            R.string.abstinence_alcohol_safety, listOf(alcoholTips, alcoholSafety, alcoholStudy),
        )
        AbstinenceProfile.MASTURBATION -> AbstinenceProfileContent(
            R.string.abstinence_masturbation, R.string.catalogue_masturbation_name,
            R.string.catalogue_masturbation_description, R.string.abstinence_masturbation_tip,
            R.string.abstinence_masturbation_evidence, listOf(sexualHealth, retraction),
        )
        AbstinenceProfile.SMOKING -> AbstinenceProfileContent(
            R.string.catalogue_smoking_label, R.string.catalogue_smoking_name,
            R.string.catalogue_smoking_description, R.string.catalogue_smoking_tip,
            R.string.catalogue_smoking_notice, listOf(smokingTimeline, smokingBenefits, smokingSupport),
        )
        AbstinenceProfile.VAPING -> AbstinenceProfileContent(
            R.string.catalogue_vaping_label, R.string.catalogue_vaping_name,
            R.string.catalogue_vaping_description, R.string.catalogue_vaping_tip,
            R.string.catalogue_vaping_notice, listOf(vapingSupport),
        )
        AbstinenceProfile.CANNABIS -> AbstinenceProfileContent(
            R.string.catalogue_cannabis_label, R.string.catalogue_cannabis_name,
            R.string.catalogue_cannabis_description, R.string.catalogue_cannabis_tip,
            R.string.catalogue_cannabis_notice, listOf(cannabisWithdrawal),
        )
        AbstinenceProfile.CAFFEINE -> AbstinenceProfileContent(
            R.string.catalogue_caffeine_label, R.string.catalogue_caffeine_name,
            R.string.catalogue_caffeine_description, R.string.catalogue_caffeine_tip,
            R.string.catalogue_caffeine_notice, listOf(caffeineAdvice),
        )
        AbstinenceProfile.CUSTOM -> AbstinenceProfileContent(
            R.string.catalogue_custom_label, R.string.catalogue_custom_name,
            R.string.catalogue_custom_description, R.string.catalogue_custom_tip,
            R.string.catalogue_custom_notice, emptyList(),
        )
    }

    fun milestones(profile: AbstinenceProfile): List<AbstinenceMilestone> = when (profile) {
        AbstinenceProfile.NONE -> emptyList()
        AbstinenceProfile.ALCOHOL -> milestoneDays.map { day ->
            if (day == 30L) AbstinenceMilestone(day, true, R.string.abstinence_alcohol_month, listOf(alcoholStudy))
            else AbstinenceMilestone(day)
        }
        AbstinenceProfile.SMOKING -> listOf(
            AbstinenceMilestone(2, true, R.string.catalogue_smoking_taste, listOf(smokingTimeline)),
            AbstinenceMilestone(3, true, R.string.catalogue_smoking_breathing, listOf(smokingTimeline)),
            AbstinenceMilestone(14, true, R.string.catalogue_smoking_circulation, listOf(smokingTimeline), R.string.catalogue_time_weeks_2_12),
            AbstinenceMilestone(90, true, R.string.catalogue_smoking_cough, listOf(smokingTimeline), R.string.catalogue_time_months_3_9),
            AbstinenceMilestone(365, true, R.string.catalogue_smoking_heart, listOf(smokingBenefits), R.string.catalogue_time_years_1_2),
        )
        AbstinenceProfile.MASTURBATION, AbstinenceProfile.VAPING, AbstinenceProfile.CANNABIS,
        AbstinenceProfile.CAFFEINE, AbstinenceProfile.CUSTOM -> milestoneDays.map { AbstinenceMilestone(it) }
    }
}

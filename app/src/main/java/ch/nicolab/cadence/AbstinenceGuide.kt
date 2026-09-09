package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceProfile

data class EvidenceSource(val label: Int, val url: String)

data class AbstinenceMilestone(
    val days: Long,
    val detail: Int,
    val sources: List<EvidenceSource>,
    val timeLabel: Int? = null,
) {
    fun reached(completedDays: Long): Boolean = completedDays >= days
}

data class AbstinenceProfileContent(
    val label: Int,
    val defaultName: Int,
    val description: Int,
    val notice: Int?,
    val sources: List<EvidenceSource>,
)

object AbstinenceGuide {
    val alcoholStudy = EvidenceSource(R.string.abstinence_source_mehta, "https://pmc.ncbi.nlm.nih.gov/articles/PMC5942469/")
    val alcoholSafety = EvidenceSource(R.string.abstinence_source_niaaa_safety, "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/understanding-alcohol-use-disorder")
    val sexualHealth = EvidenceSource(R.string.abstinence_source_nhs, "https://www.devonsexualhealth.nhs.uk/your-sexual-health/relationships-and-intimacy/")
    val retraction = EvidenceSource(R.string.abstinence_source_retracted, "https://pubmed.ncbi.nlm.nih.gov/12659241/")
    val smokingTimeline = EvidenceSource(R.string.catalogue_source_nhs_smoking, "https://www.nhs.uk/better-health/quit-smoking/")
    val smokingBenefits = EvidenceSource(R.string.catalogue_source_cdc_smoking, "https://www.cdc.gov/tobacco/about/benefits-of-quitting.html")
    val vapingSupport = EvidenceSource(R.string.catalogue_source_cdc_vaping, "https://www.cdc.gov/tobacco/e-cigarettes/quitting.html")
    val cannabisWithdrawal = EvidenceSource(R.string.catalogue_source_nida, "https://datashare.nida.nih.gov/instrument/marijuana-withdrawal-symptom-checklist")
    val caffeineAdvice = EvidenceSource(R.string.catalogue_source_fda, "https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much")
    val gamblingAdvice = EvidenceSource(R.string.catalogue_source_who_gambling, "https://www.who.int/news-room/fact-sheets/detail/gambling")
    val sleepAdvice = EvidenceSource(R.string.catalogue_source_nhs_sleep, "https://oxfordhealth.nhs.uk/mindset/skills/sleep-hygiene/")
    val pornographyAdvice = EvidenceSource(R.string.catalogue_source_nhs_pornography, "https://www.sexualhealthoxfordshire.nhs.uk/services/psychosexual-therapy/sex-addiction/")

    fun occurrenceAction(profile: AbstinenceProfile): Int = when (profile) {
        AbstinenceProfile.NONE -> R.string.abst_occurrence_title
        AbstinenceProfile.ALCOHOL -> R.string.abst_occurrence_alcohol
        AbstinenceProfile.SMOKING -> R.string.abst_occurrence_smoking
        AbstinenceProfile.VAPING -> R.string.abst_occurrence_vaping
        AbstinenceProfile.CANNABIS -> R.string.abst_occurrence_cannabis
        AbstinenceProfile.CAFFEINE -> R.string.abst_occurrence_caffeine
        AbstinenceProfile.MASTURBATION -> R.string.abst_occurrence_masturbation
        AbstinenceProfile.GAMBLING -> R.string.abst_occurrence_gambling
        AbstinenceProfile.SOCIAL_MEDIA -> R.string.abst_occurrence_social_media
        AbstinenceProfile.BEDTIME_SCREENS -> R.string.abst_occurrence_bedtime_screens
        AbstinenceProfile.IMPULSE_SHOPPING -> R.string.abst_occurrence_impulse_shopping
        AbstinenceProfile.PORNOGRAPHY -> R.string.abst_occurrence_pornography
        AbstinenceProfile.CUSTOM -> R.string.abst_occurrence_custom
    }

    fun content(profile: AbstinenceProfile): AbstinenceProfileContent = when (profile) {
        AbstinenceProfile.NONE -> AbstinenceProfileContent(
            R.string.abstinence_none, R.string.catalogue_none_name,
            R.string.catalogue_none_description, null, emptyList(),
        )
        AbstinenceProfile.ALCOHOL -> AbstinenceProfileContent(
            R.string.abstinence_alcohol, R.string.catalogue_alcohol_name,
            R.string.catalogue_alcohol_description, R.string.abstinence_alcohol_safety,
            listOf(alcoholSafety, alcoholStudy),
        )
        AbstinenceProfile.MASTURBATION -> AbstinenceProfileContent(
            R.string.abstinence_masturbation, R.string.catalogue_masturbation_name,
            R.string.catalogue_masturbation_description, R.string.abstinence_masturbation_evidence,
            listOf(sexualHealth, retraction),
        )
        AbstinenceProfile.SMOKING -> AbstinenceProfileContent(
            R.string.catalogue_smoking_label, R.string.catalogue_smoking_name,
            R.string.catalogue_smoking_description, R.string.catalogue_smoking_notice,
            listOf(smokingTimeline, smokingBenefits),
        )
        AbstinenceProfile.VAPING -> AbstinenceProfileContent(
            R.string.catalogue_vaping_label, R.string.catalogue_vaping_name,
            R.string.catalogue_vaping_description, R.string.catalogue_vaping_notice, listOf(vapingSupport),
        )
        AbstinenceProfile.CANNABIS -> AbstinenceProfileContent(
            R.string.catalogue_cannabis_label, R.string.catalogue_cannabis_name,
            R.string.catalogue_cannabis_description, R.string.catalogue_cannabis_notice, listOf(cannabisWithdrawal),
        )
        AbstinenceProfile.CAFFEINE -> AbstinenceProfileContent(
            R.string.catalogue_caffeine_label, R.string.catalogue_caffeine_name,
            R.string.catalogue_caffeine_description, R.string.catalogue_caffeine_notice, listOf(caffeineAdvice),
        )
        AbstinenceProfile.GAMBLING -> AbstinenceProfileContent(
            R.string.catalogue_gambling_label, R.string.catalogue_gambling_name,
            R.string.catalogue_gambling_description, R.string.catalogue_gambling_notice, listOf(gamblingAdvice),
        )
        AbstinenceProfile.SOCIAL_MEDIA -> AbstinenceProfileContent(
            R.string.catalogue_social_media_label, R.string.catalogue_social_media_name,
            R.string.catalogue_social_media_description, R.string.catalogue_social_media_notice, emptyList(),
        )
        AbstinenceProfile.BEDTIME_SCREENS -> AbstinenceProfileContent(
            R.string.catalogue_bedtime_screens_label, R.string.catalogue_bedtime_screens_name,
            R.string.catalogue_bedtime_screens_description, R.string.catalogue_bedtime_screens_notice, listOf(sleepAdvice),
        )
        AbstinenceProfile.IMPULSE_SHOPPING -> AbstinenceProfileContent(
            R.string.catalogue_impulse_shopping_label, R.string.catalogue_impulse_shopping_name,
            R.string.catalogue_impulse_shopping_description, R.string.catalogue_impulse_shopping_notice, emptyList(),
        )
        AbstinenceProfile.PORNOGRAPHY -> AbstinenceProfileContent(
            R.string.catalogue_pornography_label, R.string.catalogue_pornography_name,
            R.string.catalogue_pornography_description, R.string.catalogue_pornography_notice, listOf(pornographyAdvice),
        )
        AbstinenceProfile.CUSTOM -> AbstinenceProfileContent(
            R.string.catalogue_custom_label, R.string.catalogue_custom_name,
            R.string.catalogue_custom_description, R.string.catalogue_custom_notice, emptyList(),
        )
    }

    fun milestones(profile: AbstinenceProfile): List<AbstinenceMilestone> = when (profile) {
        AbstinenceProfile.NONE -> emptyList()
        AbstinenceProfile.ALCOHOL -> listOf(
            AbstinenceMilestone(30, R.string.abstinence_alcohol_month, listOf(alcoholStudy)),
        )
        AbstinenceProfile.SMOKING -> listOf(
            AbstinenceMilestone(2, R.string.catalogue_smoking_taste, listOf(smokingTimeline)),
            AbstinenceMilestone(3, R.string.catalogue_smoking_breathing, listOf(smokingTimeline)),
            AbstinenceMilestone(14, R.string.catalogue_smoking_circulation, listOf(smokingTimeline), R.string.catalogue_time_weeks_2_12),
            AbstinenceMilestone(90, R.string.catalogue_smoking_cough, listOf(smokingTimeline), R.string.catalogue_time_months_3_9),
            AbstinenceMilestone(365, R.string.catalogue_smoking_heart, listOf(smokingBenefits), R.string.catalogue_time_years_1_2),
        )
        AbstinenceProfile.MASTURBATION, AbstinenceProfile.VAPING, AbstinenceProfile.CANNABIS,
        AbstinenceProfile.CAFFEINE, AbstinenceProfile.GAMBLING, AbstinenceProfile.SOCIAL_MEDIA,
        AbstinenceProfile.BEDTIME_SCREENS, AbstinenceProfile.IMPULSE_SHOPPING,
        AbstinenceProfile.PORNOGRAPHY, AbstinenceProfile.CUSTOM -> emptyList()
    }
}

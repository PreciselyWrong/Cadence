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

enum class EvidenceStatus { LIMITED, DOCUMENTED }

data class AbstinenceEvidenceCheckpoint(
    val days: Long,
    val detail: Int,
    val status: EvidenceStatus,
    val sources: List<EvidenceSource> = emptyList(),
    val timeLabel: Int? = null,
    val summary: Int = detail,
) {
    val unlockable: Boolean get() = status == EvidenceStatus.DOCUMENTED
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
    val alcoholSafety = EvidenceSource(R.string.abstinence_source_asam, "https://www.asam.org/docs/default-source/quality-science/the_asam_clinical_practice_guideline_on-alcohol-1.pdf")
    val alcoholOneWeek = EvidenceSource(R.string.abstinence_source_mundle, "https://pubmed.ncbi.nlm.nih.gov/2706096/")
    val alcoholTwoWeeks = EvidenceSource(R.string.abstinence_source_kirpitchny, "https://pubmed.ncbi.nlm.nih.gov/28166367/")
    val alcoholBrainRecovery = EvidenceSource(R.string.abstinence_source_durazzo, "https://pmc.ncbi.nlm.nih.gov/articles/PMC4345147/")
    val alcoholImmuneRecovery = EvidenceSource(R.string.abstinence_source_li, "https://pubmed.ncbi.nlm.nih.gov/28466561/")
    val alcoholCancerReview = EvidenceSource(R.string.abstinence_source_iarc, "https://www.iarc.who.int/faq/iarc-handbooks-of-cancer-prevention-volume-20a-reduction-or-cessation-of-alcohol-consumption/")
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

    fun evidenceTimeline(profile: AbstinenceProfile): List<AbstinenceEvidenceCheckpoint> = when (profile) {
        AbstinenceProfile.ALCOHOL -> listOf(
            AbstinenceEvidenceCheckpoint(
                3, R.string.abstinence_alcohol_acute_withdrawal, EvidenceStatus.DOCUMENTED,
                listOf(alcoholSafety), R.string.abstinence_alcohol_time_24_72_hours,
                R.string.abstinence_alcohol_acute_withdrawal_summary,
            ),
            AbstinenceEvidenceCheckpoint(
                7, R.string.abstinence_alcohol_one_week, EvidenceStatus.LIMITED,
                listOf(alcoholOneWeek, alcoholSafety), R.string.abstinence_alcohol_time_one_week,
                R.string.abstinence_alcohol_one_week_summary,
            ),
            AbstinenceEvidenceCheckpoint(
                14, R.string.abstinence_alcohol_two_weeks, EvidenceStatus.LIMITED,
                listOf(alcoholTwoWeeks), R.string.abstinence_alcohol_time_two_weeks,
                R.string.abstinence_alcohol_two_weeks_summary,
            ),
            AbstinenceEvidenceCheckpoint(
                30, R.string.abstinence_alcohol_month, EvidenceStatus.DOCUMENTED,
                listOf(alcoholStudy), R.string.abstinence_alcohol_time_one_month,
                R.string.abstinence_alcohol_month_summary,
            ),
            AbstinenceEvidenceCheckpoint(
                90, R.string.abstinence_alcohol_brain_recovery, EvidenceStatus.LIMITED,
                listOf(alcoholBrainRecovery), R.string.abstinence_alcohol_time_three_to_eight_months,
                R.string.abstinence_alcohol_brain_recovery_summary,
            ),
            AbstinenceEvidenceCheckpoint(
                365, R.string.abstinence_alcohol_one_year, EvidenceStatus.LIMITED,
                listOf(alcoholImmuneRecovery, alcoholCancerReview), R.string.abstinence_alcohol_time_one_year_plus,
                R.string.abstinence_alcohol_one_year_summary,
            ),
        )
        else -> milestones(profile).map {
            AbstinenceEvidenceCheckpoint(it.days, it.detail, EvidenceStatus.DOCUMENTED, it.sources)
        }
    }
}

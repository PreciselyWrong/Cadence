package ch.nicolab.cadence.ui.icon

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DirectionsBike
import androidx.compose.material.icons.automirrored.outlined.DirectionsRun
import androidx.compose.material.icons.automirrored.outlined.DirectionsWalk
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Brush
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Park
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material.icons.outlined.PhonelinkOff
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.SelfImprovement
import androidx.compose.material.icons.outlined.SentimentSatisfied
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ch.nicolab.cadence.R

enum class IconCategory(val labelResId: Int) {
    ALL(R.string.icon_cat_all),
    HEALTH(R.string.icon_cat_health),
    PRODUCTIVITY(R.string.icon_cat_productivity),
    LEISURE(R.string.icon_cat_leisure),
    HOME(R.string.icon_cat_home),
}

data class HabitIcon(
    val id: String,
    val imageVector: ImageVector,
    val labelFr: String,
    val labelEn: String,
    val category: IconCategory,
    val searchTerms: List<String>,
)

object HabitIconRegistry {
    val DEFAULT_ICON_ID = "target"

    val ICONS: List<HabitIcon> = listOf(
        HabitIcon("fitness", Icons.Outlined.FitnessCenter, "Fitness", "Fitness", IconCategory.HEALTH, listOf("fitness", "sport", "gym", "muscu", "workout")),
        HabitIcon("run", Icons.AutoMirrored.Outlined.DirectionsRun, "Course", "Running", IconCategory.HEALTH, listOf("course", "run", "running", "jogging")),
        HabitIcon("walk", Icons.AutoMirrored.Outlined.DirectionsWalk, "Marche", "Walking", IconCategory.HEALTH, listOf("marche", "walk", "pas", "steps")),
        HabitIcon("bike", Icons.AutoMirrored.Outlined.DirectionsBike, "Vélo", "Cycling", IconCategory.HEALTH, listOf("velo", "bike", "cyclisme", "cycling")),
        HabitIcon("water", Icons.Outlined.WaterDrop, "Eau", "Water", IconCategory.HEALTH, listOf("eau", "water", "boire", "drink", "hydratation")),
        HabitIcon("food", Icons.Outlined.Restaurant, "Alimentation", "Food", IconCategory.HEALTH, listOf("nourriture", "food", "repas", "meal", "diet")),
        HabitIcon("bed", Icons.Outlined.Bedtime, "Sommeil", "Sleep", IconCategory.HEALTH, listOf("sommeil", "sleep", "nuit", "lit", "bed")),
        HabitIcon("meditation", Icons.Outlined.SelfImprovement, "Méditation", "Meditation", IconCategory.HEALTH, listOf("meditation", "zen", "mindfulness", "relaxation")),
        HabitIcon("pill", Icons.Outlined.Medication, "Santé", "Health", IconCategory.HEALTH, listOf("sante", "health", "medicament", "pill", "soin")),
        HabitIcon("heart", Icons.Outlined.Favorite, "Bien-être", "Wellbeing", IconCategory.HEALTH, listOf("coeur", "heart", "bien-etre", "love")),

        HabitIcon("book", Icons.AutoMirrored.Outlined.MenuBook, "Lecture", "Reading", IconCategory.PRODUCTIVITY, listOf("lecture", "book", "livre", "read")),
        HabitIcon("study", Icons.Outlined.School, "Études", "Study", IconCategory.PRODUCTIVITY, listOf("etudes", "study", "ecole", "school", "apprendre")),
        HabitIcon("code", Icons.Outlined.Code, "Code", "Coding", IconCategory.PRODUCTIVITY, listOf("code", "dev", "programmation", "tech")),
        HabitIcon("work", Icons.Outlined.Work, "Travail", "Work", IconCategory.PRODUCTIVITY, listOf("travail", "work", "job", "bureau")),
        HabitIcon("money", Icons.Outlined.Savings, "Épargne", "Savings", IconCategory.PRODUCTIVITY, listOf("argent", "money", "epargne", "finance", "budget")),
        HabitIcon("timer", Icons.Outlined.Timer, "Chrono", "Timer", IconCategory.PRODUCTIVITY, listOf("chrono", "timer", "temps", "pomodoro")),
        HabitIcon("check", Icons.Outlined.CheckCircle, "Objectif", "Goal", IconCategory.PRODUCTIVITY, listOf("objectif", "goal", "check", "valide")),
        HabitIcon("star", Icons.Outlined.Star, "Priorité", "Priority", IconCategory.PRODUCTIVITY, listOf("etoile", "star", "priorite", "favori")),
        HabitIcon("calendar", Icons.Outlined.CalendarToday, "Rendez-vous", "Schedule", IconCategory.PRODUCTIVITY, listOf("calendrier", "calendar", "date", "planning")),
        HabitIcon("target", Icons.Outlined.TrackChanges, "Cible", "Target", IconCategory.PRODUCTIVITY, listOf("cible", "target", "rythme", "habitude")),

        HabitIcon("music", Icons.Outlined.MusicNote, "Musique", "Music", IconCategory.LEISURE, listOf("musique", "music", "chanson", "instrument")),
        HabitIcon("brush", Icons.Outlined.Brush, "Art", "Art", IconCategory.LEISURE, listOf("art", "dessin", "peinture", "brush", "creativite")),
        HabitIcon("camera", Icons.Outlined.PhotoCamera, "Photo", "Camera", IconCategory.LEISURE, listOf("photo", "camera", "image", "souvenir")),
        HabitIcon("nature", Icons.Outlined.Park, "Nature", "Nature", IconCategory.LEISURE, listOf("nature", "parc", "foret", "outdoor", "arbre")),
        HabitIcon("sun", Icons.Outlined.WbSunny, "Soleil", "Outdoor", IconCategory.LEISURE, listOf("soleil", "sun", "dehors", "air")),
        HabitIcon("phone", Icons.Outlined.PhonelinkOff, "Déconnexion", "Digital detox", IconCategory.LEISURE, listOf("deconnexion", "screen", "detox", "ecran")),
        HabitIcon("pet", Icons.Outlined.Pets, "Animaux", "Pets", IconCategory.LEISURE, listOf("chat", "chien", "animal", "pet")),

        HabitIcon("clean", Icons.Outlined.CleaningServices, "Ménage", "Cleaning", IconCategory.HOME, listOf("menage", "clean", "rangement", "proprete")),
        HabitIcon("home", Icons.Outlined.Home, "Maison", "Home", IconCategory.HOME, listOf("maison", "home", "foyer")),
        HabitIcon("shopping", Icons.Outlined.ShoppingCart, "Courses", "Shopping", IconCategory.HOME, listOf("courses", "shopping", "achats")),
        HabitIcon("smile", Icons.Outlined.SentimentSatisfied, "Humeur", "Mood", IconCategory.HOME, listOf("humeur", "mood", "joie", "smile")),
    )

    private val iconMap: Map<String, HabitIcon> = ICONS.associateBy { it.id }

    fun getIcon(id: String?): HabitIcon {
        if (id.isNullOrBlank()) return iconMap.getValue(DEFAULT_ICON_ID)
        return iconMap[id] ?: iconMap.getValue(DEFAULT_ICON_ID)
    }

    fun search(query: String, category: IconCategory = IconCategory.ALL): List<HabitIcon> {
        val q = query.trim().lowercase()
        val candidates = ICONS.filter { icon ->
            val matchesCategory = category == IconCategory.ALL || icon.category == category
            val matchesQuery = q.isEmpty() ||
                icon.labelFr.lowercase().contains(q) ||
                icon.labelEn.lowercase().contains(q) ||
                icon.searchTerms.any { it.lowercase().contains(q) }
            matchesCategory && matchesQuery
        }
        if (q.isEmpty()) return candidates
        val exactMatches = candidates.filter { icon ->
            icon.labelFr.lowercase() == q ||
                icon.labelEn.lowercase() == q ||
                icon.searchTerms.any { it.lowercase() == q }
        }
        return exactMatches.ifEmpty { candidates }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HabitIconPicker(
    selectedIconId: String?,
    onIconSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf(IconCategory.ALL) }
    val filteredIcons = remember(searchQuery, selectedCategory) {
        HabitIconRegistry.search(searchQuery, selectedCategory)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            label = { Text(stringResource(R.string.icon_picker_search_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(8.dp))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            IconCategory.entries.forEach { category ->
                FilterChip(
                    selected = selectedCategory == category,
                    onClick = { selectedCategory = category },
                    label = { Text(stringResource(category.labelResId)) },
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 56.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp),
        ) {
            items(filteredIcons, key = { it.id }) { icon ->
                val isSelected = (selectedIconId ?: HabitIconRegistry.DEFAULT_ICON_ID) == icon.id
                val cd = stringResource(R.string.icon_accessibility_format, icon.labelFr)

                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(
                            if (isSelected) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceContainerHigh
                        )
                        .then(
                            if (isSelected) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                            else Modifier
                        )
                        .clickable { onIconSelected(icon.id) }
                        .semantics { contentDescription = cd },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon.imageVector,
                        contentDescription = icon.labelFr,
                        tint = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }
        }
    }
}

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
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Coffee
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material.icons.outlined.Hiking
import androidx.compose.material.icons.outlined.Kitchen
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.LocalDrink
import androidx.compose.material.icons.outlined.LocalLaundryService
import androidx.compose.material.icons.outlined.MonitorWeight
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Piano
import androidx.compose.material.icons.outlined.Pool
import androidx.compose.material.icons.outlined.SmokeFree
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.SportsEsports
import androidx.compose.material.icons.outlined.TravelExplore
import androidx.compose.material.icons.outlined.Yard
import androidx.compose.material.icons.outlined.AccessibilityNew
import androidx.compose.material.icons.outlined.CleanHands
import androidx.compose.material.icons.outlined.Soap
import androidx.compose.material.icons.outlined.SportsGymnastics
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
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
        HabitIcon("swim", Icons.Outlined.Pool, "Natation", "Swimming", IconCategory.HEALTH, listOf("natation", "nage", "piscine", "swim")),
        HabitIcon("spa", Icons.Outlined.Spa, "Détente", "Relaxation", IconCategory.HEALTH, listOf("detente", "spa", "repos", "relax")),
        HabitIcon("weight", Icons.Outlined.MonitorWeight, "Poids", "Weight", IconCategory.HEALTH, listOf("poids", "balance", "weight")),
        HabitIcon("drink", Icons.Outlined.LocalDrink, "Boisson", "Drink", IconCategory.HEALTH, listOf("boisson", "verre", "drink")),
        HabitIcon("coffee", Icons.Outlined.Coffee, "Café", "Coffee", IconCategory.HEALTH, listOf("café", "cafe", "coffee", "thé", "the")),
        HabitIcon("smoke-free", Icons.Outlined.SmokeFree, "Sans tabac", "Smoke free", IconCategory.HEALTH, listOf("tabac", "cigarette", "smoke", "arreter")),
        HabitIcon("hike", Icons.Outlined.Hiking, "Randonnée", "Hiking", IconCategory.HEALTH, listOf("randonnee", "hike", "montagne", "marche")),
        HabitIcon("stretch", Icons.Outlined.AccessibilityNew, "Étirements", "Stretching", IconCategory.HEALTH, listOf("étirements", "etirements", "stretch", "bras en l'air", "échauffement")),
        HabitIcon("abs", Icons.Outlined.SportsGymnastics, "Abdos", "Abs", IconCategory.HEALTH, listOf("abdos", "abdominaux", "gainage", "abs", "gymnastique")),
        HabitIcon("toothpaste", Icons.Outlined.CleanHands, "Dentifrice", "Toothpaste", IconCategory.HEALTH, listOf("dentifrice", "dents", "brossage", "toothpaste", "hygiène")),
        HabitIcon("tooth", ToothIcon, "Dent", "Tooth", IconCategory.HEALTH, listOf("dent", "dents", "dentaire", "dentiste", "tooth")),
        HabitIcon("cream", Icons.Outlined.Soap, "Crème", "Cream", IconCategory.HEALTH, listOf("crème", "creme", "soin", "peau", "cream", "cosmétique")),

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
        HabitIcon("notes", Icons.Outlined.EditNote, "Écriture", "Writing", IconCategory.PRODUCTIVITY, listOf("ecriture", "notes", "journal", "writing")),
        HabitIcon("email", Icons.Outlined.Email, "Messages", "Messages", IconCategory.PRODUCTIVITY, listOf("email", "mail", "message", "courrier")),
        HabitIcon("language", Icons.Outlined.Language, "Langue", "Language", IconCategory.PRODUCTIVITY, listOf("langue", "language", "anglais", "vocabulaire")),
        HabitIcon("calculate", Icons.Outlined.Calculate, "Calcul", "Calculation", IconCategory.PRODUCTIVITY, listOf("calcul", "math", "calculate", "chiffres")),
        HabitIcon("idea", Icons.Outlined.Lightbulb, "Idée", "Idea", IconCategory.PRODUCTIVITY, listOf("idee", "idea", "creer", "projet")),

        HabitIcon("music", Icons.Outlined.MusicNote, "Musique", "Music", IconCategory.LEISURE, listOf("musique", "music", "chanson", "instrument")),
        HabitIcon("brush", Icons.Outlined.Brush, "Art", "Art", IconCategory.LEISURE, listOf("art", "dessin", "peinture", "brush", "creativite")),
        HabitIcon("camera", Icons.Outlined.PhotoCamera, "Photo", "Camera", IconCategory.LEISURE, listOf("photo", "camera", "image", "souvenir")),
        HabitIcon("nature", Icons.Outlined.Park, "Nature", "Nature", IconCategory.LEISURE, listOf("nature", "parc", "foret", "outdoor", "arbre")),
        HabitIcon("sun", Icons.Outlined.WbSunny, "Soleil", "Outdoor", IconCategory.LEISURE, listOf("soleil", "sun", "dehors", "air")),
        HabitIcon("phone", Icons.Outlined.PhonelinkOff, "Déconnexion", "Digital detox", IconCategory.LEISURE, listOf("deconnexion", "screen", "detox", "ecran")),
        HabitIcon("pet", Icons.Outlined.Pets, "Animaux", "Pets", IconCategory.LEISURE, listOf("chat", "chien", "animal", "pet")),
        HabitIcon("movie", Icons.Outlined.Movie, "Cinéma", "Movie", IconCategory.LEISURE, listOf("cinema", "film", "movie", "serie")),
        HabitIcon("games", Icons.Outlined.SportsEsports, "Jeux", "Games", IconCategory.LEISURE, listOf("jeu", "gaming", "game", "console")),
        HabitIcon("piano", Icons.Outlined.Piano, "Piano", "Piano", IconCategory.LEISURE, listOf("piano", "instrument", "musique")),
        HabitIcon("palette", Icons.Outlined.Palette, "Création", "Creative", IconCategory.LEISURE, listOf("creation", "palette", "couleur", "art")),
        HabitIcon("travel", Icons.Outlined.TravelExplore, "Découverte", "Explore", IconCategory.LEISURE, listOf("voyage", "explorer", "travel", "decouverte")),
        HabitIcon("flight", Icons.Outlined.Flight, "Voyage", "Travel", IconCategory.LEISURE, listOf("avion", "flight", "voyage", "vacances")),

        HabitIcon("clean", Icons.Outlined.CleaningServices, "Ménage", "Cleaning", IconCategory.HOME, listOf("menage", "clean", "rangement", "proprete")),
        HabitIcon("home", Icons.Outlined.Home, "Maison", "Home", IconCategory.HOME, listOf("maison", "home", "foyer")),
        HabitIcon("shopping", Icons.Outlined.ShoppingCart, "Courses", "Shopping", IconCategory.HOME, listOf("courses", "shopping", "achats")),
        HabitIcon("smile", Icons.Outlined.SentimentSatisfied, "Humeur", "Mood", IconCategory.HOME, listOf("humeur", "mood", "joie", "smile")),
        HabitIcon("laundry", Icons.Outlined.LocalLaundryService, "Lessive", "Laundry", IconCategory.HOME, listOf("lessive", "linge", "laundry", "machine")),
        HabitIcon("garden", Icons.Outlined.Yard, "Jardin", "Garden", IconCategory.HOME, listOf("jardin", "plante", "garden", "fleur")),
        HabitIcon("tidy", Icons.Outlined.DeleteSweep, "Rangement", "Tidying", IconCategory.HOME, listOf("rangement", "ranger", "tidy", "tri")),
        HabitIcon("car", Icons.Outlined.DirectionsCar, "Voiture", "Car", IconCategory.HOME, listOf("voiture", "car", "conduite", "auto")),
        HabitIcon("cook", Icons.Outlined.Kitchen, "Cuisine", "Cooking", IconCategory.HOME, listOf("cuisine", "cuisiner", "cook", "frigo")),
        HabitIcon("family", Icons.Outlined.ChildCare, "Famille", "Family", IconCategory.HOME, listOf("famille", "enfant", "family", "bébé", "bebe")),
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

private val ToothIcon: ImageVector by lazy {
    ImageVector.Builder("Dent", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(7.2f, 2.2f)
            curveTo(5.0f, 2.7f, 3.8f, 4.6f, 4.1f, 7.1f)
            curveTo(4.5f, 10.2f, 6.0f, 11.4f, 6.5f, 15.3f)
            curveTo(6.9f, 18.4f, 7.6f, 21.8f, 9.3f, 21.8f)
            curveTo(10.8f, 21.8f, 10.7f, 16.0f, 12.0f, 16.0f)
            curveTo(13.3f, 16.0f, 13.2f, 21.8f, 14.7f, 21.8f)
            curveTo(16.4f, 21.8f, 17.1f, 18.4f, 17.5f, 15.3f)
            curveTo(18.0f, 11.4f, 19.5f, 10.2f, 19.9f, 7.1f)
            curveTo(20.2f, 4.6f, 19.0f, 2.7f, 16.8f, 2.2f)
            curveTo(15.2f, 1.8f, 13.7f, 3.0f, 12.0f, 3.0f)
            curveTo(10.3f, 3.0f, 8.8f, 1.8f, 7.2f, 2.2f)
            close()
        }
    }.build()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HabitIconPicker(
    selectedIconId: String?,
    onIconSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    accent: androidx.compose.ui.graphics.Color? = null,
) {
    val palette = ch.nicolab.cadence.ui.theme.cadence
    val fill = accent ?: palette.accent
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf(IconCategory.ALL) }
    val filteredIcons = remember(searchQuery, selectedCategory) {
        HabitIconRegistry.search(searchQuery, selectedCategory)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        ch.nicolab.cadence.ui.components.CadenceField(
            value = searchQuery,
            onValue = { searchQuery = it },
            label = stringResource(R.string.icon_picker_search_placeholder),
            accent = fill,
        )

        Spacer(Modifier.height(ch.nicolab.cadence.ui.theme.Space.md))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(ch.nicolab.cadence.ui.theme.Space.sm),
            verticalArrangement = Arrangement.spacedBy(ch.nicolab.cadence.ui.theme.Space.sm),
        ) {
            IconCategory.entries.forEach { category ->
                ch.nicolab.cadence.ui.components.ChoiceChip(
                    label = stringResource(category.labelResId),
                    selected = selectedCategory == category,
                    accent = fill,
                ) { selectedCategory = category }
            }
        }

        Spacer(Modifier.height(ch.nicolab.cadence.ui.theme.Space.md))

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 56.dp),
            horizontalArrangement = Arrangement.spacedBy(ch.nicolab.cadence.ui.theme.Space.sm),
            verticalArrangement = Arrangement.spacedBy(ch.nicolab.cadence.ui.theme.Space.sm),
            modifier = Modifier.fillMaxWidth().height(200.dp),
        ) {
            items(filteredIcons, key = { it.id }) { icon ->
                val isSelected = (selectedIconId ?: HabitIconRegistry.DEFAULT_ICON_ID) == icon.id
                val cd = stringResource(R.string.icon_accessibility_format, icon.labelFr)
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .clip(ch.nicolab.cadence.ui.theme.Radius.Control)
                        .background(if (isSelected) fill else palette.sunken)
                        .clickable { onIconSelected(icon.id) }
                        .semantics { contentDescription = cd },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon.imageVector,
                        contentDescription = icon.labelFr,
                        tint = if (isSelected) ch.nicolab.cadence.ui.components.onColorOf(fill) else palette.inkMuted,
                        modifier = Modifier.size(ch.nicolab.cadence.ui.theme.Size.iconLarge),
                    )
                }
            }
        }
    }
}

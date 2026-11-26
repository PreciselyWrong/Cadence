package ch.nicolab.cadence.tasks.model

/**
 * Ce que les filtres de liste laissent voir. Le filtre « Avec un lien » est gardé entre les sessions et se pose
 * depuis le sélecteur de listes : il ne vaut que pour les listes qu'on parcourt (Étiquettes, Terminées). Aujourd'hui,
 * À venir, les suggestions et Planifier ne le subissent jamais (le web ne le pose que sur la liste Tâches) : un
 * filtre oublié y viderait la journée sans rien montrer.
 */
object TaskScope {
    /** Aujourd'hui, À venir, suggestions, À classer et Planifier : le domaine choisi seul. */
    fun planning(all: List<TaskItem>, projects: List<ProjectItem>, areaUid: String?): List<TaskItem> =
        AreaFilter.tasks(all, projects, areaUid)

    /** Étiquettes et Terminées : le domaine, puis « Avec un lien » si posé. */
    fun lists(all: List<TaskItem>, projects: List<ProjectItem>, areaUid: String?, withLink: Boolean): List<TaskItem> =
        WithLinkFilter.tasks(AreaFilter.tasks(all, projects, areaUid), withLink)
}

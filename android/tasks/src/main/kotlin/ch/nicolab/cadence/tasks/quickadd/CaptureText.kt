package ch.nicolab.cadence.tasks.quickadd

/**
 * Le champ de capture passe à la ligne pour montrer tout le titre, mais un titre reste une seule ligne :
 * un saut de ligne collé ou tapé devient une espace. La longueur ne change pas, le curseur reste en place.
 */
fun singleLineCapture(text: String): String = text.replace('\n', ' ').replace('\r', ' ')

@file:OptIn(ExperimentalFoundationApi::class)

package ch.nicolab.cadence.tasks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import ch.nicolab.cadence.designsystem.components.Panel
import ch.nicolab.cadence.designsystem.components.rememberCadenceHaptic
import ch.nicolab.cadence.designsystem.theme.Radius
import ch.nicolab.cadence.designsystem.theme.Space
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.designsystem.theme.cadence
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.CommentItem
import ch.nicolab.cadence.tasks.notes.ContentRef
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun TaskCommentsSection(
    comments: List<CommentItem>,
    onAdd: (String) -> Unit,
    onDelete: (String) -> Unit,
    onRef: ((ContentRef) -> Unit)? = null,
    onWikiLink: (String) -> Unit = {},
) {
    val palette = cadence
    val haptic = rememberCadenceHaptic()
    var draft by remember { mutableStateOf("") }
    val send = {
        val text = draft.trim()
        if (text.isNotEmpty()) {
            onAdd(text)
            draft = ""
        }
    }

    Panel {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Space.md),
            verticalArrangement = Arrangement.spacedBy(Space.sm),
        ) {
            Text(
                text = stringResource(R.string.tasks_comments_title),
                style = MaterialTheme.typography.titleSmall,
                color = palette.onSurface,
            )
            comments.forEach { comment ->
                val authorLabel = comment.authorName
                    ?: if (comment.isOwn) stringResource(R.string.tasks_comments_author_me) else ""
                val timeLabel = comment.createdAt?.let { relativeCommentTime(it) }.orEmpty()
                val header = listOf(authorLabel, timeLabel).filter { it.isNotBlank() }.joinToString(" · ")
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(Radius.Control)
                        .then(
                            if (comment.isOwn) {
                                Modifier.combinedClickable(
                                    onClick = {},
                                    onLongClick = {
                                        haptic.longPress()
                                        onDelete(comment.uid)
                                    },
                                )
                            } else {
                                Modifier
                            },
                        )
                        .padding(vertical = Space.xs),
                    verticalArrangement = Arrangement.spacedBy(Space.xs),
                ) {
                    if (header.isNotBlank()) {
                        Text(
                            text = header,
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.onSurfaceVariant,
                        )
                    }
                    MarkdownView(
                        content = comment.body,
                        onToggleCheckbox = {},
                        onWikiLink = onWikiLink,
                        onRef = onRef,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.xs),
            ) {
                BasicTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier
                        .weight(1f)
                        .padding(vertical = Space.xs),
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = palette.onSurface),
                    cursorBrush = SolidColor(palette.primary),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        imeAction = ImeAction.Send,
                    ),
                    keyboardActions = KeyboardActions(onSend = { send() }),
                    decorationBox = { inner ->
                        if (draft.isEmpty()) {
                            Text(
                                text = stringResource(R.string.tasks_comments_add_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.onSurfaceVariant,
                            )
                        }
                        inner()
                    },
                )
                IconButton(
                    onClick = send,
                    enabled = draft.isNotBlank(),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.Send,
                        contentDescription = stringResource(R.string.tasks_comments_send),
                        tint = if (draft.isNotBlank()) palette.primary else palette.outline,
                    )
                }
            }
        }
    }
}

@Composable
private fun relativeCommentTime(at: Instant): String {
    val now = remember(at) { Instant.now() }
    val minutes = Duration.between(at, now).toMinutes().coerceAtLeast(0)
    return when {
        minutes < 1 -> stringResource(R.string.tasks_comments_just_now)
        minutes < 60 -> stringResource(R.string.tasks_comments_minutes_ago, minutes.toInt())
        minutes < 24 * 60 -> stringResource(R.string.tasks_comments_hours_ago, (minutes / 60).toInt())
        minutes < 7 * 24 * 60 -> stringResource(R.string.tasks_comments_days_ago, (minutes / (24 * 60)).toInt())
        else -> DateTimeFormatter.ofPattern("d MMM").withZone(ZoneId.systemDefault()).format(at)
    }
}

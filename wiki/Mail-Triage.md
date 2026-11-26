# Mail triage

Mails that ask something of you arrive in Cadence as **cards**: you decide in one gesture (create a task, reply, put an appointment in the calendar, postpone, archive, ignore), without leaving Cadence and without opening your mailbox.

![The "Sort my mail" deck](images/web/mail-deck.png)

## What it is, and what it is not

Cadence **is not a mail client**. It never displays an HTML message, never sends anything, has no attachments, and only talks to Gmail to archive a thread when you ask. The reading work is done by an **external agent** (a plugin or a scheduled job, see [Integrations-MCP-and-Plugins](Integrations-MCP-and-Plugins)) that reads your mailbox, possibly prepares a draft, then **proposes** a card for each thread that needs action. Cadence stores the card, shows it to you, and records your decision. The agent then carries out the rest (create the draft, archive, create the event) and reports its result.

Principles that never change:

- **The agent proposes, you decide.** A card changes nothing until you have decided it.
- **Only mails that call for an action** (a reply, a task, a decision). Newsletters, notifications and receipts never become cards.
- **One card per discussion thread.** A new message in a thread already pending updates the card; a thread already decided only gets a new card if a new message arrives *after* your decision.
- **Text is text.** Sender, subject, summary, full mail and draft are displayed as plain text: no Markdown, no links, and control characters and those that hide or reorder text are removed. The only link is the one that opens the thread in Gmail.
- **Short lifespan.** A decided card is deleted 30 days later.

Without an external agent, there are simply no mail cards: no button is displayed.

## Where to find them

| Entry point | Effect |
|---|---|
| "1 mail to sort" / "N mails to sort" notification | Arrives about 2 minutes after the last card of a series (a single message for the whole burst). On the web, it opens the deck. |
| **To sort (n)** in the inbox header, or at the top of "Ma journée" (My day) on Android | The "To sort" queue, where mail cards are in a list. |
| **Sort my mail (n)** button at the top of "To sort" | Opens the cards in a **full-screen deck**, one at a time. Only appears if there are cards. |
| « Relever les mails » (Check mail) | Asks the agent to poll your mailbox right away (see below). |
| **Ma matinée** (My morning) (Android) | Starts with the mail deck if there is one, then moves on to overdue tasks and the day. |

![The "To sort" queue](images/web/triage.png)

## A card

| Content | Detail |
|---|---|
| Sender and date | Date of the last message in the thread |
| Subject | "(no subject)" if empty |
| Summary | 2 to 3 lines (500 characters at most), with line breaks: who is writing, what it is about, what to do and by when |
| Full mail | In plain text cleaned by the server (20,000 characters at most), **collapsed** under "**Read the mail**"; the button expands it then becomes "Collapse". The text is readable on the card without leaving Cadence. |
| Appointment | When the mail sets a meeting: title, start, end, place |
| Draft | Beginning (280 characters) of the reply already prepared, and the full text quoted in the deck |
| Open in Gmail | The only link: it is only accepted if it points to Gmail |

## The decisions

Each card offers 2 to 5 decisions, in the order chosen by the agent. One is **advised**: framed and tinted, never presented as a sentence.

| Decision | Effect |
|---|---|
| **Task** | Creates a task: name and date (or horizon) pre-filled from the suggestion, note with the summary and the Gmail link, origin "Gmail" (badge). A single gesture if the suggestion suits you. |
| **Draft** | Asks the agent to create the reply draft in Gmail. The card says "Draft being prepared in Gmail". Cadence itself does not touch Gmail. |
| **Reply** | Opens the thread (or the draft) in Gmail. Sending is always done in Gmail, by you. Only exists on older cards or when the agent proposes it. |
| **Calendar** | An appointment that the agent must put in your Google calendar: "Appointment sent to the agent". Refused without a start time. |
| **Later** | The card comes back tomorrow 08:00 (your profile's time zone), or on the chosen date. |
| **Archive** | Asks the agent to archive the thread: "Archiving requested". |
| **Delete** | Asks the agent to move the thread to the Gmail trash: "Deletion requested". |
| **Ignore** | The card is finished, nothing else. |
| **Answer in a word** | A note (500 characters) for the agent. The card leaves the deck ("Sent back to the Trieur") and will be proposed again, corrected, on its next pass. |

**Also archive.** With Task, Reply, Calendar or Ignore (not with Draft, Later or Archive, which already archives), an "Archive in Gmail" checkbox (unticked) also archives the thread. It only exists if the Gmail gateway is configured on the server; without it, nothing leaves Cadence for Gmail.

**If the action fails.** The agent reports its result. On failure (for example "The draft could not be prepared"), the card **reopens** with the error at the top, and you can press again. An archiving failure shows "Not archived in Gmail": the decision itself stays recorded.

**Create the task: horizons.** When the mail gives no day, the suggestion may file the task on a horizon (This week, Next week, This month, Next month, Someday). "Edit task" opens the form: name, date, and these five chips; choosing a date clears the horizon, and vice versa.

## The "Sort my mail" deck

Full screen, one card at a time.

- **Header**: progress "4 / 17" with a thin bar (cards decided since opening).
- **Card**: sender · date, subject, summary, any appointment, collapsed full mail, "Open in Gmail", quoted draft.
- **A row of 2 to 5 big buttons** in the agent's order (Draft, Reply, Task, Calendar, Later, Archive, Delete, Ignore, with their icons). The advice is framed; the **Task** button shows the name of the proposed task, **Calendar** the time.
- **Below, discreet**: "Answer in a word", "Chat" (opens the conversation with the agent about this card, only if an agent plugin is running), "Skip" (the card goes to the bottom of the pile), "Undo", "Open mail".
- **After each decision**, the card leaves with a short animation (none if you asked for less motion), the next one arrives. **The last decision waits a moment** before being sent, so that "Undo" can reverse it: on the web until the next decision, 5 seconds or the closing of the deck; on Android during the 4.5-second undo window, including offline.
- **End**: "All sorted" and a "Back to "To sort"" button.

**Card order**: first those whose advice is an appointment, then a draft or a reply, then a task, then the rest; the most recent first within each group.

**Shortcuts (web)**

| Key | Action |
|---|---|
| Enter or → | Follow the advice (nothing if the agent gives none) |
| 1 to 5 | Choose that button |
| ← | Later |
| ↓ | Skip |
| Ctrl or ⌘ + Z | Undo the last decision |
| Esc | Close the deck (or the task form) |

Keys are ignored while you are typing in a field.

**Android**: swiping right follows the advice, swiping left puts it off until later (also available as custom actions for TalkBack); back closes the deck.

**Gmail from the phone.** Android opens Gmail **in the browser** (the mobile site), not in the app: the Gmail app ignores the thread's address and opens its inbox.

## Archive the noise in one gesture

When the deck opens with at least two cards for which the agent advises archiving, it starts with a "**N emails to archive**" screen: one line per mail (sender · subject, summary), all ticked, with **Archive N** and **Go through them one by one**. Unticked cards stay in the deck. The screen only appears once per opening. There is no undo: the ticked list is the confirmation, and an archived thread stays in Gmail's "All Mail".

## Always archive this sender

On a card (deck or list), "**Always archive this sender**" saves a rule for the address (lowercased) and archives the card. After that, a mail from this sender has **no card anymore**: it is archived directly at the agent's next pass, without a notification. The rules are managed in Profile › To sort ("Always-archived senders", "Remove" button) and in Réglages › À trier (Settings › To sort) on Android ("Expéditeurs archivés automatiquement" (Automatically archived senders)). Offline, the list is unavailable.

## Poll mail now

The **« Relever les mails »** (Check mail) button (next to "Sort my mail", even with no card, and at the end of the deck; web and Android) asks the agent to start its polling job right away. New cards arrive as usual, with the "N mails to sort" notification.

| Case | Result |
|---|---|
| Normal press | "C'est lancé." (It's started.); cards arrive within about a minute |
| A poll is already running, or started less than 2 minutes ago | No second start |
| Nothing new | The agent is not woken up: a press for nothing costs nothing |
| Offline | Never queued: a poll replayed later would start work that nobody asked for at that moment |

The button may display the last run ("polled at 9:12", "running...").

## Conflicts, offline, edge cases

| Situation | What happens |
|---|---|
| You decide on the web and the phone at the same time | The card is "taken" before the work: the first decision wins, the other shows "Already settled elsewhere." |
| Same decision sent twice (unstable network) | Treated as done, with no duplicate (idempotency key) |
| Decision offline on Android | Replayed when the network returns, once only |
| A decision fails | The card comes back in the deck |
| The server crashes in the middle of a decision | The card is free again after 5 minutes |
| Several cards arrive at once | A single notification for the burst |
| A card is opened without a connection (Android) | The last queue is readable offline; decisions are sent later |
| Cards from one account to another | Each card is private to its account |

## The "To sort" list screens

The mail cards in the list show the same buttons as the deck (the advice framed). On the web: subject as title, sender and date, summary, draft excerpt; main button Reply when the agent suggests a reply, Task otherwise.

## Going further

- [Mail cards in "To sort"](https://github.com/PreciselyWrong/cadence/blob/main/docs/43-mail-triage.md) (the agent's full contract)
- [The "To sort" queue](https://github.com/PreciselyWrong/cadence/blob/main/docs/40-triage.md)
- Related pages: [AI-and-Proposals](AI-and-Proposals), [Inbox-and-Capture](Inbox-and-Capture), [Notifications-and-Reminders](Notifications-and-Reminders), [Android](Android)

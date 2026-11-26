# Getting Started

Cadence keeps your tasks, projects, habits, notes and captures in one place, on the web, on Android and on Linux, with a calm interface that also works without a network. This page explains how to sign in, which clients to install and how to find your way around the vocabulary before you read the rest of the wiki.

![Today, day view and calendar](images/web/today.png)

## Available clients

All clients talk to the same server: what you do on one shows up on the others.

| Client | What it is for | How to get it |
|---|---|---|
| **Web** (installable app) | The full application, usable offline | Open your server's address (for example `https://cadence.example.com`) in a browser |
| **Android** | Tasks, plan, habits, notes, review, widgets, reminders | Install the APK provided by the person who runs your server, or build it from the repository (see [Android](Android)) |
| **Linux** | The web window with a system tray icon, keyboard quick add, native notifications | RPM package or AppImage (see [Linux Client and Firefox](Linux-Client-and-Firefox)) |
| **Firefox add-on** | Send the open page or a link to Cadence | Extension signed outside the public catalogue (see [Linux Client and Firefox](Linux-Client-and-Firefox)) |

There is no app store: the server is your own, or belongs to someone who invited you. Server installation is described in [Self-Hosting](Self-Hosting).

### Install the web version as an app

The site installs as an app (PWA): it opens in its own window, without an address bar.

| Browser | Gesture |
|---|---|
| Chrome or Edge (desktop, Android) | Install icon in the address bar, or menu ⋮ › "Install app" |
| Safari (iPhone, iPad, iOS 16.4 or later) | Share button › "Add to Home Screen" |
| Firefox (Android) | Menu ⋮ › "Install" |

Installation requires an HTTPS address (except locally). Once installed, the app also appears in the system share sheet on Android and in Chrome or Edge on desktop: see [Inbox and Capture](Inbox-and-Capture).

## Account and sign-in

### Create an account

- **Open sign-up is disabled by default.** The server administrator opens it or creates accounts by hand.
- **The first account created becomes the administrator.** The following ones are ordinary users.
- When sign-up is open, the email address must be valid, unique and from a domain that can receive mail (disposable addresses are refused). The password is at least 8 characters long.
- A verification email contains a link valid for 24 hours. Until it is clicked, sign-in is refused; the sign-in page lets you request a new link. If the server cannot send the email, sign-up fails without creating anything: you can simply try again later.

### Sign in

- Sign in with email and password. The error message deliberately stays vague ("Invalid credentials") so as not to reveal anything.
- You can be signed in on several devices at the same time; the session lasts until you sign out or it expires.
- If the administrator has configured an identity provider (OIDC/SSO), a single sign-on button appears on the sign-in page.
- **Two-factor authentication (optional).** Profile › Access › Security: scan the QR code with an authenticator app, enter a code, then keep the 10 backup codes shown only once. After that, sign-in asks for a 6-digit code after the password, or a backup code (each can be used only once). Five wrong codes in a row force you to enter the password again. If you lose both your phone and your codes, the administrator can reset two-factor authentication.

### API keys

Profile › Access › API Keys creates personal keys that start with `tt_`. They connect the Android app (a QR code is shown under the key), the Linux client, the Firefox add-on and integrations. The full key is shown only once: copy it right away and do not share it (in this wiki it is written `<jeton>`). A key can be revoked at any time, and it can have an expiry date.

## Where to find the settings

The "Profile Settings" page opens from the user menu ("Profile"). Its navigation is grouped:

| Group | Sections |
|---|---|
| Account | General, Plan & Billing (hosted servers only) |
| Interface | Appearance, Shortcuts, Sidebar |
| Organization | Notifications, Calendars, Planning, To sort, Filing |
| Integrations | Telegram, Sync, CalDAV Sync, MCP Integration, Agents, Plugins, AI Assistant |
| Access | Security, OIDC/SSO, API Keys |
| Advanced | Features & Add-ons, Import & export |

On a phone, the open section is a row that unfolds this menu. The wiki cites settings in the form "Profile › Group › Section"; on Android, they are in **Réglages** (Settings; the gear at the top right of Tâches, Agenda, Habitudes and Bilan, that is Tasks, Agenda, Habits and Review).

### Language, timezone, first day of the week

In Profile › Account › General: **Language** (26 languages, applied immediately), **Timezone** and **First day of week**. The timezone matters a lot: "today", reminder times and due dates without a time are all computed in it. If you see a task "due yesterday" at midnight, this is the first place to check. The Android app reads these settings from the server.

### Appearance

Profile › Interface › Appearance:

- **Theme**: light, dark (with the **Pure black in dark mode** option) or the system one.
- **Accent colour**: eight shades (Violet, Indigo, Blue, Teal, Green, Amber, Coral, Pink) or a free colour in hexadecimal.
- **Interface**: **Minimal** (default) or **Dense**. Minimal hides the superfluous for a calm list; Dense shows every control. Nothing is removed when switching from one to the other. Almost the whole wiki describes the Minimal version.
- **Task row details**: in Minimal, you choose the chips shown on the right of a task row (recurrence, comments, tags, project, priority flag, due date) and their order.

The font is Inter, the same palette as the Android app. Contrasts meet the AA level, touch targets are 44 px and text never goes below 12 px.

## The vocabulary in ten words

| Word | What it is |
|---|---|
| **Task** | Something to do. It only needs a name; everything else (due date, project, priority) is optional. See [Tasks](Tasks). |
| **Subtask** | A step of a task, one level deep only. |
| **Project** | A set of tasks with a goal, which can contain subprojects. See [Projects and Areas](Projects-and-Areas). |
| **Area** (Android: **domaine**) | A large sector of life, such as Home, Work or Health. It groups projects, goals and tasks. |
| **Goal** | A targeted outcome, with key results measured by the tasks done. See [Goals](Goals). |
| **Habit** | A routine tracked day after day, with a streak and values. See [Habits](Habits). |
| **Note** | A Markdown text, editable like an outline. See [Notes and Outliner](Notes-and-Outliner). |
| **Tag** | A keyword, possibly nested (`perso/sport`). See [Tags, Views and Navigation](Tags-Views-and-Navigation). |
| **Idea** | An inbox item, not yet sorted. See [Inbox and Capture](Inbox-and-Capture). |
| **Plan** ("Plan") | The page that spreads tasks over days and horizons. See [Today and Daily Plan](Today-and-Daily-Plan). |

Three ideas structure everything else.

1. **The due date is not the planned day.** The due date means "to finish by". The planned day is the day you intend to work on it. Moving a task in Today or Plan changes the planned day, never the due date (unless you turn on the "Planning sets the due date" option in Profile › Organization › Planning).
2. **No guilt.** Cadence never announces that a task is "overdue" through a notification and shows no counter of days late. Overdue tasks are rescheduled in one gesture. See [Notifications and Reminders](Notifications-and-Reminders).
3. **Offline first.** Every client keeps working without the server and resynchronizes afterwards; in case of a simultaneous edit, fields are merged one by one. See [Offline and Sync](Offline-and-Sync).

## Your first fifteen minutes

1. **Capture** without thinking: press `c` (or the "Capture" button in the top bar), type `Call the plumber tomorrow 2pm #home !2` and confirm. See [Inbox and Capture](Inbox-and-Capture).
2. **Open Today**: the task appears there on the given day, with its time on the calendar on the right.
3. **Look at Plan**: the left column lists what has no day yet; drag a card onto a day.
4. **Try the palette**: `Ctrl+K` (or `Cmd+K` on Mac) finds a page, a task, a project, or runs a command.
5. **Connect your phone**: create a key in Profile › Access › API Keys and scan the QR code with the Android app.
6. **Set the timezone and language** in Profile › Account › General.

### The welcome page

On an account's very first visit, a welcome page (a short video and a button to get started) is shown before everything else, even for an already old account: it appears only once, then the button opens Today. Empty pages also offer one-click starters: for areas, "Home", "Work", "Health" and "Family"; for habits, a morning walk, twenty minutes of reading and a weekly review (the new habit opens so you can set its rhythm).

## Special cases

| Situation | What happens |
|---|---|
| You do not have a reachable server yet | The installed web client and the Android app still open with the data already loaded; your changes wait for reconnection |
| You change language | The change is immediate; a key not translated in a language is shown in English |
| You forget your password | Use the reset link on the sign-in page if it is enabled on your server, otherwise ask the administrator |
| You are on a shared instance | Each person has their own tags, views and settings; only projects are shared (see [Projects and Areas](Projects-and-Areas)) |
| You want a richer interface | Profile › Interface › Appearance › Interface › **Dense** |

## Going further

- [User management, sign-in and profile](https://github.com/PreciselyWrong/cadence/blob/main/docs/08-user-management.md)
- [Two-factor authentication](https://github.com/PreciselyWrong/cadence/blob/main/docs/29-two-factor-sign-in.md)
- [Installable app (PWA)](https://github.com/PreciselyWrong/cadence/blob/main/docs/15-pwa.md)
- [First launch](https://github.com/PreciselyWrong/cadence/blob/main/docs/24-onboarding.md)
- [Fork overview](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/FORK.md)

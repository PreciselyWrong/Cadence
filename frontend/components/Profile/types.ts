import type { KeyboardShortcutsConfig } from '../../utils/keyboardShortcutsService';

export interface ProfileSettingsProps {
    currentUser: { uid: string; email: string; is_admin?: boolean };
    isDarkMode?: boolean;
    toggleDarkMode?: () => void;
    setAppearance?: (theme: 'light' | 'dark' | 'system') => void;
}

export interface Features {
    ai_assistant_enabled: boolean;
    pomodoro_enabled: boolean;
    eisenhower_enabled: boolean;
    kanban_enabled: boolean;
    habits_enabled: boolean;
    calendar_enabled: boolean;
    templates_enabled: boolean;
}

import type { TaskRowField } from '../../constants/taskRowFields';

export interface UiSettingsAppearance {
    theme?: 'light' | 'dark' | 'system';
    contentBackground?: string | null;
    density?: 'minimal' | 'dense';
    rowFields?: TaskRowField[];
}

export interface UiSettings {
    appearance?: UiSettingsAppearance;
    project?: {
        details?: {
            showMetrics?: boolean;
        };
    };
    focus?: {
        area_uid?: string | null;
        project_uid?: string | null;
        tags?: string[];
    } | null;
    [key: string]: unknown;
}

export interface SidebarVisibleSections {
    inbox?: boolean;
    links?: boolean;
    today?: boolean;
    allTasks?: boolean;
    upcomingTasks?: boolean;
    assignedToMe?: boolean;
    everyone?: boolean;
    favorites?: boolean;
    projects?: boolean;
    areas?: boolean;
    goals?: boolean;
    notes?: boolean;
    tags?: boolean;
    people?: boolean;
    habits?: boolean;
    views?: boolean;
    boards?: boolean;
    insights?: boolean;
    calendar?: boolean;
    templates?: boolean;
    access?: boolean;
}

export interface SidebarSettings {
    pinnedViewsOrder?: string[];
    visibleSections?: SidebarVisibleSections;
    widthPercent?: number;
    linkOrder?: string[];
    sectionOrder?: string[];
    // Minimal sidebar (see utils/minimalSidebar.ts)
    smartLists?: { key: string; visible: boolean; showCount: boolean }[];
    rail?: { key: string; place: 'rail' | 'more' | 'hidden' }[];
    sectionBadges?: Record<string, boolean>;
}

export interface NotificationChannels {
    inApp: boolean;
    email: boolean;
    push: boolean;
    telegram: boolean;
    apprise: boolean;
    desktop: boolean;
}

export interface QuietHours {
    enabled: boolean;
    /** HH:mm in the profile timezone. */
    start: string;
    end: string;
}

export interface NotificationPreferences {
    dueTasks: NotificationChannels;
    overdueTasks: NotificationChannels;
    dueProjects: NotificationChannels;
    overdueProjects: NotificationChannels;
    deferUntil: NotificationChannels;
    taskAssigned: NotificationChannels;
    taskReminders: NotificationChannels;
    habitReminders: NotificationChannels;
    comments: NotificationChannels;
}

export interface Profile {
    uid: string;
    email: string;
    name?: string;
    surname?: string;
    appearance: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
    first_day_of_week: number;
    avatar_image: string | null;
    has_password: boolean;
    // The server never returns the token itself.
    telegram_bot_token_set?: boolean;
    telegram_bot_token_last4?: string | null;
    telegram_chat_id: string | null;
    telegram_allowed_users: string | null;
    task_summary_enabled: boolean;
    task_summary_frequency: string;
    features: Features;
    ui_settings?: UiSettings | null;
    sidebar_settings?: SidebarSettings | null;
    notification_preferences?: NotificationPreferences | null;
    quiet_hours?: QuietHours | null;
    keyboard_shortcuts?: KeyboardShortcutsConfig | null;
    ai_profile?: string | null;
    ai_base_url?: string | null;
    ai_model?: string | null;
    ai_api_key_set?: boolean;
    ai_api_key_last4?: string | null;
}

export interface TelegramBotInfo {
    username: string;
    first_name?: string;
    polling_status: any;
    chat_url: string;
}

export type ProfileFormData = Partial<
    Profile & {
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
        // Write-only: a new key to set on save. Never populated from a GET
        // response (the server never returns the plaintext key).
        ai_api_key: string;
        // Write-only as well: undefined keeps the saved token, '' clears it.
        telegram_bot_token: string;
    }
>;

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import '../../../styles/mobile-native.css';

interface TabConfig {
    id: string;
    name: string;
    icon: React.ReactNode;
    featureFlag?: string; // Optional feature flag to conditionally show tab
    group?: string; // Section the entry is listed under
    badge?: string; // Small note next to the name, e.g. "Optional"
}

interface TabGroup {
    id: string;
    label: string;
    tabs: TabConfig[];
}

interface TabsNavProps {
    tabs: TabConfig[];
    activeTab: string;
    onChange: (id: string) => void;
}

// Keeps the order the tabs are given in, grouped by their `group`.
export const groupTabs = (
    tabs: TabConfig[],
    labelFor: (groupId: string) => string
): TabGroup[] => {
    const groups: TabGroup[] = [];
    for (const tab of tabs) {
        const id = tab.group ?? 'other';
        let group = groups.find((g) => g.id === id);
        if (!group) {
            group = { id, label: labelFor(id), tabs: [] };
            groups.push(group);
        }
        group.tabs.push(tab);
    }
    return groups;
};

const Badge: React.FC<{ text?: string }> = ({ text }) =>
    text ? (
        <span className="ml-2 rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium text-surface-on-variant">
            {text}
        </span>
    ) : null;

const TabsNav: React.FC<TabsNavProps> = ({ tabs, activeTab, onChange }) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const groups = groupTabs(tabs, (id) =>
        t(`profile.groups.${id}`, id.charAt(0).toUpperCase() + id.slice(1))
    );
    const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

    const select = (id: string) => {
        setMenuOpen(false);
        onChange(id);
    };

    return (
        <nav aria-label={t('profile.title', 'Settings')}>
            {/* Phones: the current section as a row that opens the grouped
                menu, like a pushed settings screen on Android. */}
            <div className="lg:hidden">
                <button
                    type="button"
                    className="cdm-row rounded-[20px]"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                    data-testid="settings-menu-toggle"
                >
                    <span className="cdm-row-icon">{current?.icon}</span>
                    <span className="flex-1 min-w-0 text-base">
                        {current?.name}
                    </span>
                    <ChevronDownIcon
                        className={`h-5 w-5 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                    />
                </button>
                {menuOpen && (
                    <div className="mt-4 space-y-5">
                        {groups.map((group) => (
                            <section key={group.id}>
                                <h3 className="cdm-section-label">
                                    {group.label}
                                </h3>
                                <div className="cdm-group">
                                    {group.tabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            className="cdm-row"
                                            aria-current={
                                                activeTab === tab.id
                                                    ? 'page'
                                                    : undefined
                                            }
                                            onClick={() => select(tab.id)}
                                        >
                                            <span className="cdm-row-icon">
                                                {tab.icon}
                                            </span>
                                            <span className="flex-1 min-w-0 text-base">
                                                {tab.name}
                                                <Badge text={tab.badge} />
                                            </span>
                                            <ChevronRightIcon className="h-5 w-5 shrink-0 opacity-60" />
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>

            <div className="hidden lg:block space-y-4">
                {groups.map((group) => (
                    <section key={group.id}>
                        <h3 className="px-3 pb-1 text-xs font-medium text-surface-on-variant">
                            {group.label}
                        </h3>
                        <div className="flex flex-col gap-0.5">
                            {group.tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => select(tab.id)}
                                    aria-current={
                                        activeTab === tab.id
                                            ? 'page'
                                            : undefined
                                    }
                                    className={`flex h-9 w-full items-center whitespace-nowrap rounded-lg px-3 text-body-m font-medium transition-colors ${
                                        activeTab === tab.id
                                            ? 'bg-surface-highest text-surface-on'
                                            : 'text-surface-on-variant hover:bg-surface-high hover:text-surface-on'
                                    }`}
                                >
                                    <span className="mr-3 flex-shrink-0">
                                        {tab.icon}
                                    </span>
                                    <span className="text-left">
                                        {tab.name}
                                    </span>
                                    <Badge text={tab.badge} />
                                </button>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </nav>
    );
};

export type { TabConfig };
export default TabsNav;

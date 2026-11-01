import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface SettingsErrorBoundaryProps {
    // The active section: picking another one clears the error.
    resetKey: string;
    children: React.ReactNode;
}

interface SettingsErrorBoundaryState {
    failed: boolean;
}

const SectionFailed: React.FC = () => {
    const { t } = useTranslation();
    return (
        <p
            role="alert"
            className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400"
        >
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            {t(
                'profile.sectionFailed',
                'This section could not be displayed. Pick another section or reload the page.'
            )}
        </p>
    );
};

// Without it, an exception in one settings section unmounts the whole app
// and leaves an empty page.
class SettingsErrorBoundary extends React.Component<
    SettingsErrorBoundaryProps,
    SettingsErrorBoundaryState
> {
    state: SettingsErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): SettingsErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Settings section failed', {
            section: this.props.resetKey,
            error,
            componentStack: info.componentStack,
        });
    }

    componentDidUpdate(prevProps: SettingsErrorBoundaryProps) {
        if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ failed: false });
        }
    }

    render() {
        return this.state.failed ? <SectionFailed /> : this.props.children;
    }
}

export default SettingsErrorBoundary;

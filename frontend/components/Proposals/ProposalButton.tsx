import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDaysIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import Button from '../Shared/ui/Button';
import { ProposalKind } from '../../utils/proposalsService';
import { setProposalParam } from './proposalLinks';
import { useProposal } from './useProposal';
import { useProposalChanged } from './useProposalChanged';

interface ProposalButtonProps {
    kind: ProposalKind;
    // A ready proposal opens here; by default its sheet opens over the page.
    onReady?: (uid: string) => void;
}

// The header button that asks for a proposal and waits for it. Nothing names
// the agent: the button says what it prepares, and the sheet opens on tap.
const ProposalButton: React.FC<ProposalButtonProps> = ({ kind, onReady }) => {
    const { t } = useTranslation();
    const { showErrorToast, showUndoToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { uid, status, request, refresh } = useProposal(kind);
    useProposalChanged(() => void refresh());
    const previous = useRef(status);

    const label =
        kind === 'week'
            ? t('proposals.week.button', 'Planifier ma semaine')
            : t('proposals.review.button', 'Préparer ma revue');
    const readyLabel =
        kind === 'week'
            ? t('proposals.week.ready', 'Ta semaine est prête')
            : t('proposals.review.ready', 'Ta revue est prête');

    const start = () =>
        request().catch(() =>
            showErrorToast(
                t('proposals.startError', 'Impossible de lancer la demande.')
            )
        );

    // Only a failure seen on this page is announced, with a retry.
    useEffect(() => {
        if (previous.current === 'pending' && status === 'failed') {
            showUndoToast(
                t('proposals.failed', 'La préparation a échoué.'),
                () => void start(),
                t('proposals.retry', 'Réessayer')
            );
        }
        previous.current = status;
        // `start` is recreated on each render; only the status matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    if (status === 'pending') {
        return (
            <Button
                variant="secondary"
                disabled
                aria-live="polite"
                icon={
                    <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
                    />
                }
            >
                {t('proposals.week.preparing', 'En préparation…')}
            </Button>
        );
    }

    if (status === 'ready' && uid) {
        return (
            <Button
                variant="primary"
                icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />}
                onClick={() =>
                    onReady
                        ? onReady(uid)
                        : setProposalParam(navigate, location, uid)
                }
            >
                {readyLabel}
            </Button>
        );
    }

    return (
        <Button
            variant="secondary"
            icon={<CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => void start()}
        >
            {label}
        </Button>
    );
};

export default ProposalButton;

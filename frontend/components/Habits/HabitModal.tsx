import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HabitEditor from './HabitEditor';
import {
    CadenceGroup,
    fetchCadenceGroups,
} from '../../utils/cadenceHabitsService';
import { localToday } from '../../utils/cadenceHabitUtils';

interface HabitModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// "New habit" from anywhere in the app (sidebar, command palette): the habit
// editor, then the page of the habit that was created.
const HabitModal: React.FC<HabitModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<CadenceGroup[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        fetchCadenceGroups()
            .then(setGroups)
            .catch((error) =>
                console.error('Failed to prepare the habit editor:', error)
            );
    }, [isOpen]);

    return (
        <HabitEditor
            isOpen={isOpen && groups.length > 0}
            onClose={onClose}
            groups={groups}
            today={localToday()}
            onSaved={(uid) => {
                onClose();
                navigate(`/habit/${uid}`);
            }}
        />
    );
};

export default HabitModal;

import React, { useEffect, useRef } from 'react';
import DatePopover from '../../Shared/DatePopover';

interface DatePickerAtProps {
    x: number;
    y: number;
    label: string;
    value: { date: string | null; time: string | null };
    onPick: (date: string | null, time: string | null) => void;
    onClose: () => void;
}

// The shared date popover, opened at once at the menu's point.
const DatePickerAt: React.FC<DatePickerAtProps> = ({
    x,
    y,
    label,
    value,
    onPick,
    onClose,
}) => {
    const anchor = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        anchor.current?.querySelector('button')?.click();
    }, []);
    return (
        <span
            ref={anchor}
            className="fixed h-0 w-0 overflow-hidden"
            style={{ left: x, top: y }}
        >
            <DatePopover
                value={value}
                label={label}
                onChange={(next) => onPick(next.date, next.time)}
                onClose={onClose}
                renderTrigger={(props) => (
                    <button
                        ref={props.ref}
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        onClick={props.onClick}
                    />
                )}
            />
        </span>
    );
};

export default DatePickerAt;

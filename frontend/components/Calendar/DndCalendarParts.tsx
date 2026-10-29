import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

// The day calendar on the Today page drags with dnd-kit, like the rest of
// that page. These wrappers render the dnd-kit pieces only when the grid runs
// in that mode; elsewhere the plain element is used, so no dnd-kit context is
// needed.

interface DropTargetProps {
    dndKit: boolean;
    id: string;
    testId?: string;
    className?: string;
    children?: React.ReactNode;
}

export const DropTarget: React.FC<DropTargetProps> = ({
    dndKit,
    id,
    testId,
    className = '',
    children,
}) => {
    if (!dndKit) {
        return <div className={className}>{children}</div>;
    }
    return (
        <DroppableArea id={id} testId={testId} className={className}>
            {children}
        </DroppableArea>
    );
};

const DroppableArea: React.FC<{
    id: string;
    testId?: string;
    className: string;
    children?: React.ReactNode;
}> = ({ id, testId, className, children }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            data-testid={testId}
            className={`${className} ${isOver ? 'bg-blue-100/70 dark:bg-blue-900/30' : ''}`}
        >
            {children}
        </div>
    );
};

interface DragBlockProps {
    id: string;
    data: Record<string, unknown>;
    disabled: boolean;
    className: string;
    style: React.CSSProperties;
    title?: string;
    onClick?: (e: React.MouseEvent) => void;
    children?: React.ReactNode;
}

// A block dragged with dnd-kit: it follows the pointer while held and is
// dropped on a slot or the all-day row.
export const DragBlock: React.FC<DragBlockProps> = ({
    id,
    data,
    disabled,
    className,
    style,
    title,
    onClick,
    children,
}) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({ id, data, disabled });
    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            title={title}
            onClick={onClick}
            className={`${className} ${isDragging ? 'opacity-40' : ''}`}
            style={{
                ...style,
                transform: transform
                    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
                    : undefined,
                zIndex: isDragging ? 30 : undefined,
            }}
        >
            {children}
        </div>
    );
};

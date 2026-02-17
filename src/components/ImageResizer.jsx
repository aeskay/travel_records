import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

const ImageResizer = ({ image, onRemove, onDeselect }) => {
    const [rect, setRect] = useState(null);
    const [isResizing, setIsResizing] = useState(false);

    const updateRect = useCallback(() => {
        if (image) {
            const r = image.getBoundingClientRect();
            // We need to account for scrolling if the overlay is fixed/absolute relative to viewport
            // But if we render it inside the editor container which has relative positioning, that's easier.
            // Let's assume we render it as a direct child of the editor container or body.
            // For simplicity in a scrolling editor, using absolute position relative to the closest positioned ancestor (HistoryItem or Editor) is best.
            // However, the image is inside contentEditable.

            // Let's use offsetLeft/Top if possible, or just rect relative to the offsetParent.

            setRect({
                top: image.offsetTop,
                left: image.offsetLeft,
                width: image.offsetWidth,
                height: image.offsetHeight
            });
        }
    }, [image]);

    useEffect(() => {
        updateRect();
        window.addEventListener('resize', updateRect);
        return () => window.removeEventListener('resize', updateRect);
    }, [image, updateRect]);

    useEffect(() => {
        // Update selection overlay if content changes or layout shifts
        const interval = setInterval(updateRect, 500);
        return () => clearInterval(interval);
    }, [updateRect]);

    const handleMouseDown = (e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = image.offsetWidth;
        const startHeight = image.offsetHeight;
        const aspectRatio = startWidth / startHeight;

        const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            let newWidth = startWidth;

            if (direction.includes('e')) newWidth = startWidth + dx;
            if (direction.includes('w')) newWidth = startWidth - dx;

            if (newWidth < 50) newWidth = 50; // Min width

            image.style.width = `${newWidth}px`;
            image.style.height = 'auto'; // Maintain aspect ratio
            updateRect();
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    if (!image || !rect) return null;

    return (
        <div
            className="image-resizer-overlay"
            style={{
                position: 'absolute',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                pointerEvents: 'none', // Allow clicks to pass through to handles, but not block the image itself generally? 
                // Actually we want to block interaction with the image while resizing so we don't drag it.
                // But we need pointer-events auto for the border/handles.
                border: '2px solid var(--color-primary)',
                zIndex: 10
            }}
        >
            {/* Delete Button */}
            <button
                onMouseDown={(e) => { e.stopPropagation(); onRemove(); }}
                style={{
                    position: 'absolute',
                    top: -15,
                    right: -15,
                    background: 'var(--color-danger)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    pointerEvents: 'auto'
                }}
            >
                <Trash2 size={14} />
            </button>

            {/* Handles */}
            {['se', 'sw', 'ne', 'nw'].map(dir => (
                <div
                    key={dir}
                    onMouseDown={(e) => handleMouseDown(e, dir)}
                    style={{
                        position: 'absolute',
                        width: 10,
                        height: 10,
                        background: 'white',
                        border: '1px solid var(--color-primary)',
                        cursor: `${dir}-resize`,
                        pointerEvents: 'auto',
                        ...((dir === 'se') ? { bottom: -5, right: -5 } : {}),
                        ...((dir === 'sw') ? { bottom: -5, left: -5 } : {}),
                        ...((dir === 'ne') ? { top: -5, right: -5 } : {}),
                        ...((dir === 'nw') ? { top: -5, left: -5 } : {}),
                    }}
                />
            ))}
        </div>
    );
};

export default ImageResizer;

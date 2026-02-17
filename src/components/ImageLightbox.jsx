import { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

const ImageLightbox = ({ src, onClose }) => {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
            }}
            onClick={onClose}
        >
            <img
                src={src}
                alt="Full view"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    transform: `scale(${scale})`,
                    transition: 'transform 0.2s ease',
                    cursor: 'default',
                }}
            />
            {/* Controls */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute', bottom: '2rem',
                    display: 'flex', gap: '0.5rem',
                    background: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '0.5rem',
                }}
            >
                <button
                    onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                    style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                    <ZoomOut size={20} />
                </button>
                <button
                    onClick={() => setScale(1)}
                    style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '0.8rem' }}
                >
                    {Math.round(scale * 100)}%
                </button>
                <button
                    onClick={() => setScale(s => Math.min(3, s + 0.25))}
                    style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                    <ZoomIn size={20} />
                </button>
                <button
                    onClick={onClose}
                    style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginLeft: '8px' }}
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};

export default ImageLightbox;

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, CheckCircle, Circle, Edit2, Trash2, Tag, MapPinned } from 'lucide-react';

const SectionActionMenu = ({ section, allTypes = [], onChangeStatus, onChangeType, onDelete, onEdit, onViewOnMap, isAdmin }) => {
    const [open, setOpen] = useState(false);
    const [showTypeSubmenu, setShowTypeSubmenu] = useState(false);
    const [newType, setNewType] = useState('');
    const [isAddingNewType, setIsAddingNewType] = useState(false);
    const menuRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setOpen(false);
                setShowTypeSubmenu(false);
                setIsAddingNewType(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleStatusChange = (status) => {
        onChangeStatus(section, status);
        setOpen(false);
    };

    const handleTypeChange = (type) => {
        onChangeType(section, type);
        setOpen(false);
        setShowTypeSubmenu(false);
    };

    const handleAddNewType = () => {
        if (newType.trim()) {
            onChangeType(section, newType.trim());
            setNewType('');
            setIsAddingNewType(false);
            setOpen(false);
            setShowTypeSubmenu(false);
        }
    };

    const handleDelete = () => {
        if (confirm(`Are you sure you want to delete section "${section.id}"? This cannot be undone.`)) {
            onDelete(section);
            setOpen(false);
        }
    };

    const uniqueTypes = [...new Set(allTypes.filter(Boolean))].sort();

    return (
        <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); setShowTypeSubmenu(false); setIsAddingNewType(false); }}
                style={{
                    padding: '4px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'hsl(var(--muted-foreground))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                title="Actions"
            >
                <MoreVertical size={22} />
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '4px',
                        minWidth: '200px',
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 999,
                        overflow: 'visible'
                    }}
                >
                    {/* Status Options - Admin Only */}
                    {isAdmin && (
                        <>
                            <div style={{ padding: '4px 8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                                Status
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleStatusChange('Evaluated'); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 12px', border: 'none',
                                    background: section.status === 'Evaluated' ? 'hsl(var(--accent))' : 'transparent',
                                    color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.875rem',
                                    textAlign: 'left'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = section.status === 'Evaluated' ? 'hsl(var(--accent))' : 'transparent'}
                            >
                                <CheckCircle size={14} style={{ color: '#22c55e' }} /> Evaluated
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleStatusChange('Pending'); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 12px', border: 'none',
                                    background: section.status !== 'Evaluated' ? 'hsl(var(--accent))' : 'transparent',
                                    color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.875rem',
                                    textAlign: 'left'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = section.status !== 'Evaluated' ? 'hsl(var(--accent))' : 'transparent'}
                            >
                                <Circle size={14} style={{ color: '#eab308' }} /> Pending
                            </button>

                            {/* Divider */}
                            <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '4px 0' }} />

                            {/* Type Options */}
                            <div style={{ padding: '4px 8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>
                                Type
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowTypeSubmenu(!showTypeSubmenu); setIsAddingNewType(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    width: '100%', padding: '8px 12px', border: 'none',
                                    background: 'transparent', color: 'hsl(var(--foreground))',
                                    cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Tag size={14} /> {section.type || 'Set Type'}
                                </span>
                                <span style={{ fontSize: '0.7rem' }}>▸</span>
                            </button>

                            {showTypeSubmenu && (
                                <div style={{
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    borderTop: '1px solid hsl(var(--border))',
                                    backgroundColor: 'hsl(var(--accent) / 0.3)'
                                }}>
                                    {uniqueTypes.map(type => (
                                        <button
                                            key={type}
                                            onClick={(e) => { e.stopPropagation(); handleTypeChange(type); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                width: '100%', padding: '6px 12px 6px 24px', border: 'none',
                                                background: section.type === type ? 'hsl(var(--accent))' : 'transparent',
                                                color: 'hsl(var(--foreground))', cursor: 'pointer',
                                                fontSize: '0.8rem', textAlign: 'left'
                                            }}
                                            onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                            onMouseLeave={(e) => e.target.style.backgroundColor = section.type === type ? 'hsl(var(--accent))' : 'transparent'}
                                        >
                                            {section.type === type ? '✓ ' : ''}{type}
                                        </button>
                                    ))}

                                    <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '2px 0' }} />

                                    {!isAddingNewType ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsAddingNewType(true); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                width: '100%', padding: '6px 12px 6px 24px', border: 'none',
                                                background: 'transparent', color: 'hsl(var(--primary))',
                                                cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
                                                fontWeight: 500
                                            }}
                                            onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                                        >
                                            + New Type
                                        </button>
                                    ) : (
                                        <div style={{ padding: '6px 12px 6px 24px', display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                className="input"
                                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }}
                                                placeholder="Type name"
                                                value={newType}
                                                onChange={(e) => setNewType(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewType(); }}
                                                autoFocus
                                            />
                                            <button onClick={handleAddNewType} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                                Add
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Edit */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(section); setOpen(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '8px 12px', border: 'none',
                                    background: 'transparent', color: 'hsl(var(--foreground))',
                                    cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            >
                                <Edit2 size={14} /> Edit Section
                            </button>
                        </>
                    )}

                    {/* View on Trip Map */}
                    {onViewOnMap && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewOnMap(section); setOpen(false); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                width: '100%', padding: '8px 12px', border: 'none',
                                background: 'transparent', color: 'hsl(var(--foreground))',
                                cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--accent))'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                            <MapPinned size={14} /> View on Trip Map
                        </button>
                    )}

                    {/* Divider */}
                    <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '4px 0' }} />

                    {/* Delete */}
                    {isAdmin && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                width: '100%', padding: '8px 12px', border: 'none',
                                background: 'transparent', color: 'hsl(var(--destructive))',
                                cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'hsl(var(--destructive) / 0.1)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                            <Trash2 size={14} /> Delete Section
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SectionActionMenu;

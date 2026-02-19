import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const EditSectionModal = ({ section, onSave, onClose }) => {
    const [form, setForm] = useState({});

    useEffect(() => {
        if (section) {
            setForm({ ...section });
        }
    }, [section]);

    if (!section) return null;

    const handleChange = (key, value) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    // Define the editable fields
    const fields = [
        { key: 'id', label: 'Section ID', disabled: true },
        { key: 'test_sequence', label: 'Test Sequence', type: 'number', placeholder: 'Leave blank to exclude from Trip Map' },
        { key: 'highway', label: 'Highway' },
        { key: 'type', label: 'Type' },
        { key: 'city', label: 'City' },
        { key: 'county', label: 'County' },
        { key: 'district', label: 'District' },
        { key: 'coordinates', label: 'GPS Coordinates', placeholder: 'e.g. 29.7604,-95.3698' },
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }} onClick={onClose}>
            <div
                style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    width: '100%',
                    maxWidth: '500px',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    padding: '1.5rem',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Edit Section</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {fields.map(f => (
                        <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
                                {f.label}
                            </label>
                            <input
                                type={f.type || 'text'}
                                className="input"
                                value={form[f.key] || ''}
                                onChange={(e) => handleChange(f.key, e.target.value)}
                                disabled={f.disabled}
                                placeholder={f.placeholder || ''}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    fontSize: '0.875rem',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: 'var(--radius)',
                                    background: f.disabled ? 'hsl(var(--muted)/0.3)' : 'hsl(var(--background))',
                                    color: 'hsl(var(--foreground))',
                                    opacity: f.disabled ? 0.6 : 1,
                                }}
                            />
                        </div>
                    ))}

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onClose} className="btn btn-outline" style={{ padding: '0.5rem 1rem' }}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Save size={16} /> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditSectionModal;

import { useState, useEffect } from 'react';
import { getProjects, getSections } from '../db';
import { useUser } from '../context/UserContext';
import { X } from 'lucide-react';

const TransferSectionModal = ({ mode, section, currentProjectId, onClose, onTransfer }) => {
    const { user } = useUser();
    const [projects, setProjects] = useState([]);
    const [targetProjectId, setTargetProjectId] = useState('');
    const [availableTypes, setAvailableTypes] = useState([]);
    const [selectedType, setSelectedType] = useState('');
    const [isNewType, setIsNewType] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetchingProjects, setFetchingProjects] = useState(true);

    useEffect(() => {
        const loadProjects = async () => {
            if (!user) return;
            const projs = await getProjects(user.username);
            // Exclude current project
            setProjects(projs.filter(p => p.id !== currentProjectId));
            setFetchingProjects(false);
        };
        loadProjects();
    }, [user, currentProjectId]);

    useEffect(() => {
        const loadTypes = async () => {
            if (!targetProjectId) {
                setAvailableTypes([]);
                return;
            }
            const secs = await getSections(user.username, targetProjectId);
            const types = [...new Set(secs.map(s => s.type).filter(Boolean))].sort();
            setAvailableTypes(types);
            if (types.length > 0) {
                setSelectedType(types[0]);
                setIsNewType(false);
            } else {
                setSelectedType('');
                setIsNewType(true);
            }
        };
        loadTypes();
    }, [targetProjectId, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetProjectId || !selectedType.trim()) return;
        
        setLoading(true);
        try {
            await onTransfer(targetProjectId, selectedType.trim());
        } catch (error) {
            console.error('Transfer failed:', error);
            alert('Failed to transfer section: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h2>{mode === 'clone' ? 'Clone' : 'Move'} Section</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="modal-body">
                    <p style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))' }}>
                        {mode === 'clone' ? 'Copying' : 'Moving'} <strong>{section.id}</strong> to another trip project.
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        
                        <div>
                            <label className="block text-sm font-medium mb-1">Destination Project</label>
                            {fetchingProjects ? (
                                <div style={{ padding: '8px', fontSize: '0.875rem' }}>Loading projects...</div>
                            ) : (
                                <select 
                                    className="input" 
                                    value={targetProjectId} 
                                    onChange={(e) => setTargetProjectId(e.target.value)}
                                    required
                                >
                                    <option value="">-- Select a Project --</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {targetProjectId && (
                            <div>
                                <label className="block text-sm font-medium mb-1">Category (Type)</label>
                                
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    {availableTypes.length > 0 && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                                            <input 
                                                type="radio" 
                                                checked={!isNewType} 
                                                onChange={() => { setIsNewType(false); setSelectedType(availableTypes[0] || ''); }} 
                                            />
                                            Existing Type
                                        </label>
                                    )}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                                        <input 
                                            type="radio" 
                                            checked={isNewType || availableTypes.length === 0} 
                                            onChange={() => { setIsNewType(true); setSelectedType(''); }} 
                                        />
                                        New Type
                                    </label>
                                </div>

                                {!isNewType && availableTypes.length > 0 ? (
                                    <select 
                                        className="input" 
                                        value={selectedType} 
                                        onChange={(e) => setSelectedType(e.target.value)}
                                        required
                                    >
                                        {availableTypes.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input 
                                        type="text"
                                        className="input"
                                        value={selectedType}
                                        onChange={(e) => setSelectedType(e.target.value)}
                                        placeholder="Enter new category name..."
                                        required
                                    />
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loading || !targetProjectId || !selectedType.trim()}>
                                {loading ? 'Processing...' : (mode === 'clone' ? 'Clone' : 'Move')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TransferSectionModal;

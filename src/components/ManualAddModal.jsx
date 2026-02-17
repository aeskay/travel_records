import { useState, useMemo } from 'react';
import { X, Save, Plus, List } from 'lucide-react';
import { addSection } from '../db';

const ManualAddModal = ({ onClose, onComplete, existingTypes = [] }) => {
    const [formData, setFormData] = useState({
        id: '',
        type: '',
        highway: '',
        district: '',
        county: '',
        city: '',
        coordinates: ''
    });
    const [isNewType, setIsNewType] = useState(false);

    const uniqueTypes = useMemo(() => {
        return [...new Set(existingTypes)].filter(Boolean).sort();
    }, [existingTypes]);

    // Initialize type if not set and types exist
    useMemo(() => {
        if (!formData.type && uniqueTypes.length > 0) {
            setFormData(prev => ({ ...prev, type: uniqueTypes[0] }));
        }
    }, [uniqueTypes]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.id) return alert('Section ID is required');

        const newSection = {
            ...formData,
            id: String(formData.id),
            status: 'pending' // Default status
        };

        try {
            await addSection(newSection);
            onComplete();
        } catch (error) {
            console.error('Failed to add section:', error);
            alert('Failed to save section. ID might already exist.');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content fade-in" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2>Add New Section</h2>
                    <button className="btn btn-glass" onClick={onClose}><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="info-label">Section ID *</label>
                            <input
                                type="text"
                                name="id"
                                value={formData.id}
                                onChange={handleChange}
                                className="input-field"
                                required
                                placeholder="e.g. 101"
                            />
                        </div>

                        <div className="form-group">
                            <label className="info-label">Type</label>
                            <div className="flex gap-2">
                                {isNewType ? (
                                    <input
                                        type="text"
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="input-field header-input"
                                        placeholder="Enter new type..."
                                        autoFocus
                                        style={{ flex: 1 }}
                                    />
                                ) : (
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="input-field" // Reuse input styles
                                        style={{ flex: 1, appearance: 'auto' }}
                                    >
                                        <option value="" disabled>Select Type...</option>
                                        {uniqueTypes.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-glass"
                                    onClick={() => {
                                        setIsNewType(!isNewType);
                                        setFormData(prev => ({ ...prev, type: '' }));
                                    }}
                                    title={isNewType ? "Select Existing" : "Add New Type"}
                                >
                                    {isNewType ? <List size={18} /> : <Plus size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="info-label">Highway</label>
                            <input
                                type="text"
                                name="highway"
                                value={formData.highway}
                                onChange={handleChange}
                                className="input-field"
                                placeholder="e.g. IH 35"
                            />
                        </div>

                        <div className="grid-2">
                            <div className="form-group">
                                <label className="info-label">District</label>
                                <input
                                    type="text"
                                    name="district"
                                    value={formData.district}
                                    onChange={handleChange}
                                    className="input-field"
                                />
                            </div>
                            <div className="form-group">
                                <label className="info-label">County</label>
                                <input
                                    type="text"
                                    name="county"
                                    value={formData.county}
                                    onChange={handleChange}
                                    className="input-field"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="info-label">City</label>
                            <input
                                type="text"
                                name="city"
                                value={formData.city}
                                onChange={handleChange}
                                className="input-field"
                            />
                        </div>

                        <div className="form-group">
                            <label className="info-label">GPS Coordinates</label>
                            <input
                                type="text"
                                name="coordinates"
                                value={formData.coordinates}
                                onChange={handleChange}
                                className="input-field"
                                placeholder="Lat, Lon"
                            />
                        </div>
                    </div>

                    <div className="modal-footer" style={{ marginTop: '2rem' }}>
                        <button type="button" onClick={onClose} className="btn btn-glass">Cancel</button>
                        <button type="submit" className="btn btn-primary">
                            <Save size={18} /> Save Section
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ManualAddModal;

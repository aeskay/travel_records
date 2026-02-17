import { useState } from 'react';
import { X } from 'lucide-react';

const ManualAddModal = ({ onClose, onComplete, existingTypes = [] }) => {
    const [formData, setFormData] = useState({
        id: '',
        highway: '',
        type: '',
        district: '',
        city: '',
        county: '',
        coordinates: '',
        testing_sn: ''
    });

    const [isNewType, setIsNewType] = useState(false);
    const [newType, setNewType] = useState('');
    const [errors, setErrors] = useState({});

    // Filter out duplicates and empty types
    const uniqueTypes = [...new Set(existingTypes)].filter(t => t && t.trim() !== '');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const handleTypeChange = (e) => {
        const value = e.target.value;
        if (value === '__new__') {
            setIsNewType(true);
            setFormData(prev => ({ ...prev, type: '' }));
        } else {
            setIsNewType(false);
            setFormData(prev => ({ ...prev, type: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const newErrors = {};

        if (!formData.id.trim()) newErrors.id = 'ID is required';
        if (!formData.highway.trim()) newErrors.highway = 'Highway is required';

        const finalType = isNewType ? newType.trim() : formData.type;
        if (!finalType) newErrors.type = 'Type is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const sectionData = {
            ...formData,
            type: finalType,
            status: 'Not Evaluated', // Default status
            details: {} // Init empty details
        };

        onComplete(sectionData);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Add New Section</h2>
                    <button className="btn-icon" onClick={onClose}><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="grid-2">
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">Section ID <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                name="id"
                                className="input"
                                value={formData.id}
                                onChange={handleChange}
                                placeholder="e.g., IH0035-A"
                                autoFocus
                            />
                            {errors.id && <span className="text-xs text-red-500 mt-1 block">{errors.id}</span>}
                        </div>
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">Testing S/N</label>
                            <input
                                type="text"
                                name="testing_sn"
                                className="input"
                                value={formData.testing_sn}
                                onChange={handleChange}
                                placeholder="Serial Number"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-[hsl(var(--border))] w-full my-4"></div>

                    <div className="grid-2">
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">Highway <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                name="highway"
                                className="input"
                                value={formData.highway}
                                onChange={handleChange}
                                placeholder="e.g., IH-35"
                            />
                            {errors.highway && <span className="text-xs text-red-500 mt-1 block">{errors.highway}</span>}
                        </div>

                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">Type <span className="text-red-500">*</span></label>
                            {!isNewType ? (
                                <select
                                    className="input"
                                    value={formData.type || ''}
                                    onChange={handleTypeChange}
                                >
                                    <option value="">Select Type...</option>
                                    {uniqueTypes.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                    <option value="__new__">+ Add New Type</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="input"
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value)}
                                        placeholder="Enter new type"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => setIsNewType(false)}
                                    >Cancel</button>
                                </div>
                            )}
                            {errors.type && <span className="text-xs text-red-500 mt-1 block">{errors.type}</span>}
                        </div>
                    </div>

                    <div className="grid-2 mt-4">
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">District</label>
                            <input
                                type="text"
                                name="district"
                                className="input"
                                value={formData.district}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">GPS Coordinates</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    name="coordinates"
                                    className="input font-mono"
                                    value={formData.coordinates}
                                    onChange={handleChange}
                                    placeholder="Lat, Long"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid-2 mt-4">
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">City</label>
                            <input
                                type="text"
                                name="city"
                                className="input"
                                value={formData.city}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label className="text-sm font-semibold text-muted mb-1 block uppercase tracking-wider">County</label>
                            <input
                                type="text"
                                name="county"
                                className="input"
                                value={formData.county}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                </form>

                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit}>Add Section</button>
                </div>
            </div>
        </div>
    );
};

export default ManualAddModal;

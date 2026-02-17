import { useState } from 'react';
import { Map, CheckCircle, Circle, MapPin } from 'lucide-react';
import { addSection } from '../db';
import DetailEditor from './DetailEditor';
import ErrorBoundary from './ErrorBoundary';

const SectionDetail = ({ section, onUpdate }) => {
    const [isUpdating, setIsUpdating] = useState(false);

    const toggleStatus = async () => {
        setIsUpdating(true);
        const newStatus = section.status === 'complete' ? 'pending' : 'complete';
        const updatedSection = { ...section, status: newStatus };
        await addSection(updatedSection);
        if (onUpdate) onUpdate();
        setIsUpdating(false);
    };

    if (!section || !section.id) return (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
            <p>No section selected or data is invalid.</p>
        </div>
    );

    return (
        <div className="fade-in" style={{ paddingBottom: '4rem' }}>
            <div className="section-header-card">
                <div className="section-title-row">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <h2 className="section-id">Section {section.id}</h2>
                            <span className="tag-type">{section.type || 'Uncategorized'}</span>
                        </div>
                        <div className="location-row">
                            <MapPin size={16} />
                            <span>{section.city || 'Unknown City'}, {section.county || 'Unknown County'} County</span>
                        </div>
                    </div>

                    <div className="action-buttons">
                        <button
                            onClick={toggleStatus}
                            disabled={isUpdating}
                            className="btn btn-glass"
                            style={{ color: section.status === 'complete' ? '#166534' : 'inherit' }}
                        >
                            {section.status === 'complete' ? <CheckCircle size={18} /> : <Circle size={18} />}
                            {section.status === 'complete' ? 'Evaluated' : 'Mark Complete'}
                        </button>

                        {section.coordinates && (
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(section.coordinates)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-primary"
                            >
                                <Map size={18} /> Map
                            </a>
                        )}
                    </div>
                </div>

                <div className="grid-info">
                    {[
                        { label: 'Highway', value: section.highway },
                        { label: 'District', value: section.district },
                        { label: 'GPS', value: section.coordinates },
                        { label: 'Status', value: section.status, isStatus: true }
                    ].map((item, idx) => (
                        <div key={idx} className="info-card">
                            <div className="info-label">{item.label}</div>
                            <div className={`info-value ${item.isStatus ? 'status status-' + item.value : ''}`}>
                                {item.value || 'N/A'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <DetailEditor sectionId={section.id} />
        </div>
    );
};

export default function SectionDetailWithBoundary(props) {
    return (
        <ErrorBoundary>
            <SectionDetail {...props} />
        </ErrorBoundary>
    );
};

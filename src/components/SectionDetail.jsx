import { useState } from 'react';
import { Map, CheckCircle, Circle, MapPin, Printer } from 'lucide-react';
import { addSection } from '../db';
import DetailEditor from './DetailEditor';
import ErrorBoundary from './ErrorBoundary';
import { useUser } from '../context/UserContext';
import SectionActionMenu from './SectionActionMenu';
import { printSections } from '../utils/printUtils';

const SectionDetail = ({ section, onUpdate, allTypes, onChangeStatus, onChangeType, onDeleteSection, onEdit }) => {
    const { user } = useUser();
    const [isUpdating, setIsUpdating] = useState(false);

    const toggleStatus = async () => {
        if (!user) return;
        setIsUpdating(true);
        const newStatus = section.status === 'Evaluated' ? 'Pending' : 'Evaluated';
        const updatedSection = { ...section, status: newStatus };
        await addSection(updatedSection, user.username);
        if (onUpdate) onUpdate();
        setIsUpdating(false);
    };

    if (!section || !section.id) return (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
            <p>No section selected or data is invalid.</p>
        </div>
    );

    return (
        <div className="page-container">
            <div className="dashboard-grid">

                {/* Header Card (Title + Actions + Horizontal Metadata) */}
                <div className="card dashboard-header-card flex-col items-start gap-4">
                    <div className="w-full flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-6">
                                <h1 className="text-lg md:text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">{section.id}</h1>
                                {/* Badge next to title — desktop only */}
                                <span className="hidden md:inline-block badge bg-sky-500/10 text-sky-600 border border-sky-200/20 text-xs font-medium px-2 py-0.5 rounded">
                                    {section.type || 'Uncategorized'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted mt-1 text-sm">
                                <MapPin size={16} />
                                <span>{section.city || 'Unknown'}, {section.county || 'Unknown'}</span>
                            </div>
                        </div>

                        <div className="flex gap-2 items-center">
                            {/* Badge in actions row — mobile only */}
                            <span className="md:hidden badge bg-sky-500/10 text-sky-600 border border-sky-200/20 text-xs font-medium px-2 py-0.5 rounded">
                                {section.type || 'Uncategorized'}
                            </span>
                            {section.coordinates && (
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(section.coordinates)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-outline"
                                >
                                    <Map size={18} /> Map
                                </a>
                            )}
                            <button
                                onClick={() => printSections(section, user?.username)}
                                className="btn btn-outline"
                                title="Print to PDF"
                            >
                                <Printer size={18} /> Print
                            </button>
                            <SectionActionMenu
                                section={section}
                                allTypes={allTypes}
                                onChangeStatus={onChangeStatus}
                                onChangeType={onChangeType}
                                onDelete={onDeleteSection}
                                onEdit={onEdit}
                            />
                        </div>
                    </div>

                    {/* Horizontal Metadata - Now inside Header */}
                    <div className="w-full flex flex-wrap gap-6 pt-4 border-t border-[hsl(var(--border))] mt-2">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Highway</span>
                            <span className="font-medium">{section.highway || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">District</span>
                            <span className="font-medium">{section.district || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">GPS Coordinates</span>
                            <span className="font-mono text-sm">{section.coordinates || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Status</span>
                            <span className={`font-medium ${section.status === 'Evaluated' ? 'text-green-500' : 'text-yellow-500'}`}>
                                {section.status}
                            </span>
                        </div>
                        {section.maintenance_section && (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Maint. Section</span>
                                <span className="font-medium">{section.maintenance_section}</span>
                            </div>
                        )}
                        {section.limits && (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Limits</span>
                                <span className="text-sm">{section.limits}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content (Editor) - Full Width */}
                <div className="card dashboard-main-card">
                    <DetailEditor section={section} />
                </div>

            </div>
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

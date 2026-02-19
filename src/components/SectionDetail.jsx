import { useState, useEffect } from 'react';
import { Map, CheckCircle, Circle, MapPin, Printer, BookLock, X, Save } from 'lucide-react';
import { addSection, getPrivateNote, savePrivateNote } from '../db';
import DetailEditor from './DetailEditor';
import ErrorBoundary from './ErrorBoundary';
import { useUser } from '../context/UserContext';
import SectionActionMenu from './SectionActionMenu';
import { printSections } from '../utils/printUtils';

const SectionDetail = ({ section, onUpdate, allTypes, onChangeStatus, onChangeType, onDeleteSection, onEdit, onViewOnMap, isAdmin }) => {
    const { user } = useUser();
    const [isUpdating, setIsUpdating] = useState(false);
    const [showPrivateNote, setShowPrivateNote] = useState(false);
    const [privateNoteContent, setPrivateNoteContent] = useState('');
    const [loadingNote, setLoadingNote] = useState(false);

    useEffect(() => {
        if (section?.id && user) {
            setLoadingNote(true);
            getPrivateNote(section.id, user.username).then(note => {
                setPrivateNoteContent(note?.content || '');
                setLoadingNote(false);
            });
        }
    }, [section?.id, user]);

    const handleSavePrivateNote = async () => {
        if (!user || !section) return;
        setLoadingNote(true);
        await savePrivateNote(section.id, user.username, privateNoteContent);
        setLoadingNote(false);
        setShowPrivateNote(false);
    };

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
                                <span className="badge bg-sky-500/10 text-sky-600 border border-sky-200/20 text-xs font-medium px-2 py-0.5 rounded">
                                    {section.type || 'Uncategorized'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted mt-1 text-sm">
                                <MapPin size={16} />
                                <span>{section.city || 'Unknown'}, {section.county || 'Unknown'}</span>
                            </div>

                        </div>

                        <div className="flex gap-2 items-center map-print">
                            {/* Badge removed from here for mobile */}
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
                                onViewOnMap={onViewOnMap}
                                isAdmin={isAdmin}
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
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Sequence</span>
                            <span className="font-medium">{section.test_sequence || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">GPS Coordinates</span>
                            <span className="font-mono text-sm">{section.coordinates || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-muted uppercase tracking-wider">Status</span>
                            <div className="flex flex-col">
                                <span className={`font-medium ${section.status === 'Evaluated' ? 'text-green-500' : 'text-yellow-500'}`}>
                                    {section.status}
                                </span>
                                {section.status === 'Evaluated' && section.evaluatedAt && (
                                    <span className="text-xs text-muted">
                                        {new Date(section.evaluatedAt).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content (Editor) - Full Width */}
            <div className="card dashboard-main-card">
                <DetailEditor section={section} onUpdate={onUpdate} />
            </div>

        </div>

            {/* Private Note Floating Action Button */ }
    <button
        onClick={() => setShowPrivateNote(true)}
        className="fixed bottom-6 right-6 btn btn-circle btn-primary shadow-lg z-50 w-14 h-14"
        title="Private Note" style={{ marginTop: '10px' }}
    >
        <BookLock size={24} />
    </button>

    {/* Private Note Modal */ }
    {
        showPrivateNote && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center p-4 border-b border-[hsl(var(--border))]">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <BookLock className="text-[hsl(var(--primary))]" size={20} />
                            Private Note
                        </h3>
                        <button onClick={() => setShowPrivateNote(false)} className="btn btn-ghost btn-sm btn-circle">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-2">
                        <p className="text-sm text-muted">
                            This note is only visible to you ({user?.username}).
                        </p>
                        <textarea
                            className="w-full flex-1 min-h-[200px] p-3 rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--input))] resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                            placeholder="Write your private thoughts here..."
                            value={privateNoteContent}
                            onChange={(e) => setPrivateNoteContent(e.target.value)}
                        />
                    </div>
                    <div className="p-4 border-t border-[hsl(var(--border))] flex justify-end gap-2">
                        <button onClick={() => setShowPrivateNote(false)} className="btn btn-ghost">Cancel</button>
                        <button onClick={handleSavePrivateNote} className="btn btn-primary" disabled={loadingNote}>
                            <Save size={16} />
                            {loadingNote ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }
        </div >
    );
};

export default function SectionDetailWithBoundary(props) {
    return (
        <ErrorBoundary>
            <SectionDetail {...props} />
        </ErrorBoundary>
    );
};

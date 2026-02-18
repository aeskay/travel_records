import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Upload, Plus, Search, ChevronDown, ChevronUp, CheckCircle, Settings as SettingsIcon, Printer, MapPinned } from 'lucide-react';
import SectionActionMenu from './SectionActionMenu';
import { printSections } from '../utils/printUtils';

const Sidebar = ({
    sections,
    onSelectSection,
    selectedSectionId,
    onOpenImport,
    onOpenManual,
    filterType,
    setFilterType,
    isCollapsed,
    toggleSidebar,
    counts,
    onOpenSettings,
    onOpenMap,
    allTypes,
    onChangeStatus,
    onChangeType,
    onDeleteSection,
    onEdit,
    allSections,
    username,
    onViewOnMap,
    isAdmin,
    projectName,
    onSwitchProject
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({});
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const toggleGroup = (type) => {
        setExpandedGroups(prev => ({ ...prev, [type]: !prev[type] }));
    };

    const groupedSections = useMemo(() => {
        if (!sections) return {};
        const filtered = sections.filter(s =>
            s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.city && s.city.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        const groups = {};
        filtered.forEach(s => {
            const type = s.type || 'Uncategorized';
            if (!groups[type]) groups[type] = [];
            groups[type].push(s);
        });
        return groups;
    }, [sections, searchTerm]);

    return (
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : 'open'}`}>
            {/* Header */}
            <div className="sidebar-header flex justify-between items-center relative">
                <div style={{ position: 'absolute', top: '8px', right: '40px', background: 'hsl(var(--card))', padding: '2px 6px', borderRadius: '12px', border: '1px solid hsl(var(--border))', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10 }}>
                    {isOnline ? (
                        <>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                            <span style={{ color: '#22c55e' }}>Online</span>
                        </>
                    ) : (
                        <>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
                            <span style={{ color: '#ef4444' }}>Offline</span>
                        </>
                    )}
                </div>
                <div className="flex-1 overflow-hidden mr-8">
                    <h2
                        className="text-lg font-bold cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onSelectSection(null)}
                        title="Go to Dashboard"
                    >
                        0-7147: Travel Records
                    </h2>
                    {projectName && (
                        <div
                            className="text-xs text-muted-foreground mt-1 flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                            onClick={onSwitchProject}
                            title="Switch Trip"
                        >
                            <span className="truncate font-medium">{projectName}</span>
                            <ChevronDown size={12} />
                        </div>
                    )}
                </div>
                <button onClick={toggleSidebar} className="btn-icon shrink-0">
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            {!isCollapsed && (
                <>
                    <div className="p-4 flex flex-col gap-4 border-b border-[hsl(var(--border))]">
                        {/* Actions */}
                        {isAdmin && (
                            <div className="flex gap-2">
                                <button className="btn btn-primary w-full" onClick={onOpenImport}>
                                    <Upload size={16} /> Import
                                </button>
                                <button className="btn btn-outline w-full" onClick={onOpenManual}>
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        )}

                        {/* Search */}
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" style={{ top: '50%', transform: 'translateY(-50%)', marginLeft: '10px' }} />
                            <input
                                type="text"
                                className="input pl-9"
                                style={{ paddingLeft: '2.25rem' }}
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filter Tabs */}
                        <div className="sidebar-tabs">
                            {['all', 'evaluated', 'pending', 'excluded'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(type)}
                                    className={`tab-btn ${filterType === type ? 'active' : ''}`}
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)} ({counts[type]})
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="sidebar-scroll">
                        {Object.keys(groupedSections).sort().map(type => (
                            <div key={type} className="section-group">
                                <div
                                    className="group-header"
                                    onClick={() => toggleGroup(type)}
                                >
                                    <span className="group-title">{type}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="badge">{groupedSections[type].length}</span>
                                        {expandedGroups[type] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>

                                {expandedGroups[type] && (
                                    <div className="mt-1 flex flex-col gap-1 pl-2">
                                        {groupedSections[type].map(section => (
                                            <div
                                                key={section.id}
                                                className={`section-item ${selectedSectionId === section.id ? 'active' : ''}`}
                                                onClick={() => onSelectSection(section)}
                                                style={{ flexDirection: 'row', alignItems: 'center' }}
                                            >
                                                <div className="section-info" style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="section-title-row">
                                                        <span className="section-id">{section.id}</span>
                                                        {section.status === 'Evaluated' && <CheckCircle size={14} color="hsl(var(--primary))" />}
                                                    </div>
                                                    <span className="section-subtitle">
                                                        {section.city || 'No City'} • {section.county || 'No County'}
                                                    </span>
                                                </div>
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
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="sidebar-footer" style={{ display: 'flex', justifyContent: 'space-around', padding: '0.75rem 0.5rem', position: 'relative' }}>
                        {/* Network Status */}


                        <button
                            onClick={onOpenMap}
                            className="btn btn-ghost"
                            style={{ flexDirection: 'column', gap: '4px', padding: '0.5rem', fontSize: '0.7rem', minWidth: '60px' }}
                            title="View trip on map"
                        >
                            <MapPinned size={20} />
                            <span>Trip Map</span>
                        </button>
                        <button
                            onClick={() => printSections(allSections || [], username)}
                            className="btn btn-ghost"
                            style={{ flexDirection: 'column', gap: '4px', padding: '0.5rem', fontSize: '0.7rem', minWidth: '60px' }}
                            title="Print all sections to PDF"
                        >
                            <Printer size={20} />
                            <span>Print All</span>
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="btn btn-ghost"
                            style={{ flexDirection: 'column', gap: '4px', padding: '0.5rem', fontSize: '0.7rem', minWidth: '60px' }}
                        >
                            <SettingsIcon size={20} />
                            <span>Settings</span>
                        </button>
                    </div>
                </>
            )}
        </aside>
    );
};

export default Sidebar;

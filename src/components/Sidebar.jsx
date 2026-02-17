import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Upload, Plus, Filter, Search, ChevronDown, ChevronUp, CheckCircle, Circle, Settings as SettingsIcon } from 'lucide-react';

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
    onOpenSettings
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({}); // Track expanded groups

    const toggleGroup = (type) => {
        setExpandedGroups(prev => ({
            ...prev,
            [type]: !prev[type]
        }));
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
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Header */}
            <div className="sidebar-header">
                <div className="sidebar-title">
                    <h2>Section Info</h2>
                    <button onClick={toggleSidebar} className="btn-icon">
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                {!isCollapsed && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onOpenImport}>
                            <Upload size={16} /> Import
                        </button>
                        <button className="btn btn-glass" style={{ justifyContent: 'center' }} onClick={onOpenManual} title="Add Manually">
                            <Plus size={16} />
                        </button>
                    </div>
                )}
            </div>

            {!isCollapsed && (
                <>
                    {/* Search */}
                    <div className="sidebar-search">
                        <Search size={16} color="var(--color-text-secondary)" />
                        <input
                            type="text"
                            placeholder="Search ID, Type, City..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Tabs / Filters */}
                    <div className="sidebar-tabs">
                        <button
                            className={`tab-btn ${filterType === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            All <span className="badge">{counts.all}</span>
                        </button>
                        <button
                            className={`tab-btn ${filterType === 'evaluated' ? 'active' : ''}`}
                            onClick={() => setFilterType('evaluated')}
                        >
                            Evaluated <span className="badge">{counts.evaluated}</span>
                        </button>
                        <button
                            className={`tab-btn ${filterType === 'remaining' ? 'active' : ''}`} // Keep class name for styling
                            onClick={() => setFilterType('remaining')}
                        >
                            Not Evaluated <span className="badge">{counts.remaining}</span>
                        </button>
                    </div>

                    <div className="sidebar-divider"></div>

                    {/* List */}
                    <div className="sidebar-content">
                        {Object.keys(groupedSections).sort().map(type => (
                            <div key={type} className="section-group">
                                <div
                                    className="group-header"
                                    onClick={() => toggleGroup(type)}
                                >
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{type}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span className="badge" style={{ background: 'var(--color-background-elevated)' }}>{groupedSections[type].length}</span>
                                        {expandedGroups[type] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>
                                {expandedGroups[type] && (
                                    <div className="group-content">
                                        {groupedSections[type].map(section => (
                                            <div
                                                key={section.id}
                                                className={`section-item ${selectedSectionId === section.id ? 'active' : ''}`}
                                                onClick={() => onSelectSection(section)}
                                            >
                                                <div className="section-info">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                        <span className="section-id">{section.id}</span>
                                                        {section.status === 'Evaluated' && <CheckCircle size={14} color="var(--color-success)" />}
                                                    </div>
                                                    <span className="section-subtitle">{section.city || 'No City'} • {section.county || 'No County'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Footer / Settings */}
                    <div className="sidebar-footer" style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                        <button
                            onClick={onOpenSettings}
                            className="btn btn-glass"
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            <SettingsIcon size={18} /> Settings
                        </button>
                    </div>
                </>
            )}
        </aside>
    );
};

export default Sidebar;

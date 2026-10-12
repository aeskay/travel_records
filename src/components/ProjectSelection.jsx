
import React, { useState, useEffect, useMemo } from 'react';
import { getProjects, createProject, deleteProject, updateProject, duplicateProject, getSectionCountsForProject } from '../db';
import { useUser } from '../context/UserContext';
import { Plus, FolderOpen, Loader, Trash2, Edit2, Map, Calendar, X, Check, Wrench, User, Mail, Moon, Sun, Sunset, LogOut, Copy, CheckCheck, Activity, RotateCcw, Filter, ArrowUpDown, Search, Clock } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import GlobalSearch from './GlobalSearch';
import './ProjectSelection.css';

const ProjectSelection = ({ user, onSelectProject, onNavigateToSection }) => {
    const { showAlert, showConfirm, showPrompt } = useNotification();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newProjectName, setNewProjectName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editEndDate, setEditEndDate] = useState('');

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        // Add time to avoid timezone shifts on date-only strings
        const date = new Date(dateStr + 'T12:00:00');
        if (isNaN(date.getTime())) return '';
        const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    };

    const formatIsoDate = (isoStr) => {
        if (!isoStr) return 'Unknown date';
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return 'Unknown date';
        const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    };

    const formatDateRange = (start, end) => {
        if (!start) return 'No dates set';
        if (!end || start === end) return formatDate(start);
        return `${formatDate(start)} — ${formatDate(end)}`;
    };

    const isCreatedByCurrentUser = (project) => {
        if (!project?.createdBy || !user) return false;
        const creator = project.createdBy.trim().toLowerCase();
        const uname = (user.username || '').trim().toLowerCase();
        const email = (user.email || '').trim().toLowerCase();
        const emailPrefix = email.split('@')[0];
        return (uname && creator === uname) ||
            (email && creator === email) ||
            (emailPrefix && creator === emailPrefix);
    };

    const formatCreatorLabel = (creatorStr) => {
        if (!creatorStr) return 'Unknown';
        return creatorStr.includes('@') ? creatorStr.split('@')[0] : creatorStr;
    };

    // Admin email check (case-insensitive)
    const isAdmin = user?.email?.toLowerCase() === 'samuel.alalade@ttu.edu';

    const { logout, updateUserProfile } = useUser();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('inprogress'); // 'inprogress', 'completed', 'recent', 'all', 'settings'
    const [sectionCounts, setSectionCounts] = useState({}); // { [projectId]: { total, evaluated } }

    // Filter & Sort states
    const [creatorFilter, setCreatorFilter] = useState('all'); // 'all', '__me__', '__unknown__', or specific creator string
    const [dateFilter, setDateFilter] = useState('all'); // 'all', '7d', '30d', '90d', 'this_year', 'custom', or 'year:YYYY'
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
    const [progressFilter, setProgressFilter] = useState('all'); // 'all', 'complete', 'partial', 'not_started', 'empty'
    const [sortBy, setSortBy] = useState('created_desc'); // 'created_desc', 'created_asc', 'completed_desc', 'modified_desc', 'schedule_desc', 'schedule_asc', 'progress_desc', 'progress_asc', 'name_asc', 'name_desc'

    const fetchSectionCounts = async (projectList) => {
        if (!projectList || projectList.length === 0) return;
        try {
            const results = await Promise.all(
                projectList.map(async (p) => ({ id: p.id, counts: await getSectionCountsForProject(p.id) }))
            );
            const map = {};
            results.forEach(r => { map[r.id] = r.counts; });
            setSectionCounts(map);
        } catch (e) {
            console.error('Error fetching section counts:', e);
        }
    };

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const data = await getProjects(user.username);
            setProjects(data || []);
            fetchSectionCounts(data || []); // Load counts in background
        } catch (err) {
            console.error("Error loading trips:", err);
            setError("Failed to load trips.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [user]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        setIsCreating(true);
        try {
            // FIX: Use email as fallback for username
            const creatorName = user.username || user.email || 'admin';
            console.log("Creating trip with:", creatorName);

            const newProject = await createProject(newProjectName, creatorName);
            await fetchProjects();
            setNewProjectName('');
        } catch (err) {
            console.error("Error creating trip:", err);
            setError(`Failed to create trip: ${err.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (e, projectId) => {
        e.stopPropagation();
        if (await showConfirm("Are you sure you want to delete this trip? This will delete all sections associated with it.")) {
            try {
                await deleteProject(projectId, user.username);
                await fetchProjects();
            } catch (err) {
                console.error("Error deleting trip:", err);
                setError("Failed to delete trip.");
            }
        }
    };



    const handleDuplicate = async (e, projectId, projectName) => {
        e.stopPropagation();
        const newName = await showPrompt(`Enter name for copy of "${projectName}":`, `${projectName} (Copy)`);
        if (!newName) return;

        setLoading(true);
        try {
            await duplicateProject(projectId, newName, user.username);
            showAlert("Trip duplicated successfully!");
            await fetchProjects();
        } catch (err) {
            console.error("Error duplicating trip:", err);
            showAlert(`Duplicate failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkComplete = async (e, projectId, isCurrentlyComplete) => {
        e.stopPropagation();
        try {
            await updateProject(projectId, {
                status: isCurrentlyComplete ? 'active' : 'completed',
                completedAt: isCurrentlyComplete ? null : new Date().toISOString()
            }, user.username);
            await fetchProjects();
        } catch (err) {
            showAlert('Failed to update trip status: ' + err.message);
        }
    };



    const startEditing = (e, project) => {
        e.stopPropagation();
        setEditingId(project.id);
        setEditName(project.name);
        setEditStartDate(project.startDate || '');
        setEditEndDate(project.endDate || '');
    };

    const saveEdit = async (e) => {
        e.stopPropagation(); // prevent select
        try {
            await updateProject(editingId, {
                name: editName,
                startDate: editStartDate,
                endDate: editEndDate
            }, user.username);
            setEditingId(null);
            fetchProjects();
        } catch (err) {
            console.error("Error updating trip:", err);
        }
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const [editDisplayName, setEditDisplayName] = useState(user.displayName || '');

    // 1. Projects the user has permission to view
    const accessibleProjects = useMemo(() => {
        const isGlobalAdmin = user.email?.toLowerCase() === 'samuel.alalade@ttu.edu';
        return projects.filter(p =>
            isGlobalAdmin ||
            isCreatedByCurrentUser(p) ||
            (p.users && p.users.some(u => u.email?.toLowerCase() === user.email?.toLowerCase())) ||
            (!p.users && !p.createdBy)
        );
    }, [projects, user]);

    // 2. Counts per tab (before toolbar filters)
    const tabCounts = useMemo(() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
            inprogress: accessibleProjects.filter(p => p.status !== 'completed').length,
            completed: accessibleProjects.filter(p => p.status === 'completed').length,
            recent: accessibleProjects.filter(p => p.createdAt && new Date(p.createdAt) > thirtyDaysAgo).length,
            all: accessibleProjects.length
        };
    }, [accessibleProjects]);

    // 3. Projects matching the active sidebar tab
    const tabProjects = useMemo(() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return accessibleProjects.filter(p => {
            const isCompleted = p.status === 'completed';
            if (activeTab === 'inprogress') return !isCompleted;
            if (activeTab === 'completed') return isCompleted;
            if (activeTab === 'recent') return p.createdAt && new Date(p.createdAt) > thirtyDaysAgo;
            return true; // 'all'
        });
    }, [accessibleProjects, activeTab]);

    // 4. Unique creators & years for filter dropdowns
    const creatorOptions = useMemo(() => {
        const otherMap = new globalThis.Map(); // lowerKey -> display label
        let myCount = 0;
        let unknownCount = 0;

        tabProjects.forEach(p => {
            if (isCreatedByCurrentUser(p)) {
                myCount++;
            } else if (!p.createdBy || !p.createdBy.trim()) {
                unknownCount++;
            } else {
                const key = p.createdBy.trim().toLowerCase();
                const existing = otherMap.get(key);
                if (existing) {
                    existing.count++;
                } else {
                    otherMap.set(key, {
                        value: key,
                        label: formatCreatorLabel(p.createdBy.trim()),
                        raw: p.createdBy.trim(),
                        count: 1
                    });
                }
            }
        });

        const others = Array.from(otherMap.values()).sort((a, b) => a.label.localeCompare(b.label));
        return { myCount, unknownCount, others };
    }, [tabProjects, user]);

    const availableYears = useMemo(() => {
        const years = new Set();
        accessibleProjects.forEach(p => {
            if (p.createdAt) {
                const y = new Date(p.createdAt).getFullYear();
                if (!isNaN(y)) years.add(y);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [accessibleProjects]);

    const hasActiveFilters = searchQuery.trim() !== '' ||
        creatorFilter !== 'all' ||
        dateFilter !== 'all' ||
        progressFilter !== 'all';

    const resetFilters = () => {
        setSearchQuery('');
        setCreatorFilter('all');
        setDateFilter('all');
        setCustomDateFrom('');
        setCustomDateTo('');
        setProgressFilter('all');
    };

    // 5. Apply toolbar filters and sorting
    const filteredProjects = useMemo(() => {
        const now = Date.now();
        const q = searchQuery.trim().toLowerCase();

        const filtered = tabProjects.filter(p => {
            // Search query (name or creator)
            if (q) {
                const nameMatch = (p.name || '').toLowerCase().includes(q);
                const creatorMatch = (p.createdBy || '').toLowerCase().includes(q);
                if (!nameMatch && !creatorMatch) return false;
            }

            // Creator filter
            if (creatorFilter === '__me__') {
                if (!isCreatedByCurrentUser(p)) return false;
            } else if (creatorFilter === '__unknown__') {
                if (p.createdBy && p.createdBy.trim()) return false;
            } else if (creatorFilter !== 'all') {
                if ((p.createdBy || '').trim().toLowerCase() !== creatorFilter) return false;
            }

            // Creation Date filter
            if (dateFilter !== 'all') {
                const createdTime = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
                if (isNaN(createdTime)) return false;

                if (dateFilter === '7d') {
                    if (createdTime < now - 7 * 24 * 60 * 60 * 1000) return false;
                } else if (dateFilter === '30d') {
                    if (createdTime < now - 30 * 24 * 60 * 60 * 1000) return false;
                } else if (dateFilter === '90d') {
                    if (createdTime < now - 90 * 24 * 60 * 60 * 1000) return false;
                } else if (dateFilter === 'this_year') {
                    if (new Date(createdTime).getFullYear() !== new Date().getFullYear()) return false;
                } else if (dateFilter.startsWith('year:')) {
                    const targetYear = parseInt(dateFilter.split(':')[1], 10);
                    if (new Date(createdTime).getFullYear() !== targetYear) return false;
                } else if (dateFilter === 'custom') {
                    if (customDateFrom) {
                        const fromMs = new Date(customDateFrom + 'T00:00:00').getTime();
                        if (!isNaN(fromMs) && createdTime < fromMs) return false;
                    }
                    if (customDateTo) {
                        const toMs = new Date(customDateTo + 'T23:59:59').getTime();
                        if (!isNaN(toMs) && createdTime > toMs) return false;
                    }
                }
            }

            // Evaluation Progress filter
            if (progressFilter !== 'all') {
                const counts = sectionCounts[p.id];
                const total = counts?.total ?? 0;
                const evaluated = counts?.evaluated ?? 0;
                const pct = total > 0 ? Math.round((evaluated / total) * 100) : 0;

                if (progressFilter === 'complete' && (total === 0 || pct < 100)) return false;
                if (progressFilter === 'partial' && (total === 0 || pct === 0 || pct === 100)) return false;
                if (progressFilter === 'not_started' && (total === 0 || pct > 0)) return false;
                if (progressFilter === 'empty' && total > 0) return false;
            }

            return true;
        });

        // Sort
        const getPct = (p) => {
            const c = sectionCounts[p.id];
            if (!c || c.total === 0) return -1;
            return (c.evaluated / c.total) * 100;
        };

        return [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'created_asc':
                    return (new Date(a.createdAt || 0).getTime() || 0) - (new Date(b.createdAt || 0).getTime() || 0);
                case 'completed_desc':
                    return (new Date(b.completedAt || b.lastModified || b.createdAt || 0).getTime() || 0) -
                        (new Date(a.completedAt || a.lastModified || a.createdAt || 0).getTime() || 0);
                case 'modified_desc':
                    return (new Date(b.lastModified || b.createdAt || 0).getTime() || 0) -
                        (new Date(a.lastModified || a.createdAt || 0).getTime() || 0);
                case 'schedule_desc': {
                    if (!a.startDate && !b.startDate) return 0;
                    if (!a.startDate) return 1;
                    if (!b.startDate) return -1;
                    return b.startDate.localeCompare(a.startDate);
                }
                case 'schedule_asc': {
                    if (!a.startDate && !b.startDate) return 0;
                    if (!a.startDate) return 1;
                    if (!b.startDate) return -1;
                    return a.startDate.localeCompare(b.startDate);
                }
                case 'progress_desc':
                    return getPct(b) - getPct(a);
                case 'progress_asc':
                    return getPct(a) - getPct(b);
                case 'name_asc':
                    return (a.name || '').localeCompare(b.name || '');
                case 'name_desc':
                    return (b.name || '').localeCompare(a.name || '');
                case 'created_desc':
                default:
                    return (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
            }
        });
    }, [tabProjects, searchQuery, creatorFilter, dateFilter, customDateFrom, customDateTo, progressFilter, sortBy, sectionCounts]);



    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            await updateUserProfile(editDisplayName);
            showAlert("Profile updated successfully!");
        } catch (error) {
            console.error("Failed to update profile:", error);
            showAlert("Failed to update profile");
        }
    };

    // calculate if user has ANY assigned trips (ignoring search)
    const hasAssignedTrips = projects.some(p => {
        const isGlobalAdmin = user.email === 'samuel.alalade@ttu.edu';
        return isGlobalAdmin ||
            p.createdBy === user.username ||
            (p.users && p.users.some(u => u.email === user.email)) ||
            (!p.users && !p.createdBy);
    });

    // Theme state
    // 'dark' (default), 'light', 'medium'
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light');

    // Ensure initial sync
    useEffect(() => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current);
    }, []);

    const toggleTheme = () => {
        let newTheme = 'dark';
        if (theme === 'dark') newTheme = 'light';
        else if (theme === 'light') newTheme = 'medium';
        else if (theme === 'medium') newTheme = 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
        setTheme(newTheme);
    };

    if (loading) {
        return (
            <div className="project-selection-page">
                <Loader className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="project-selection-page">
            <div className="dashboard-box">
                {/* Left Sidebar */}
                <div className="dashboard-sidebar">
                    <div className="user-greeting">
                        <div className="flex items-center gap-3 mb-2">
                            <img src="/ttu-logo.svg" style={{ width: '28px', height: '28px' }} alt="TTU Logo" />
                            <h1 style={{ margin: 0 }}>TechMRT Trips</h1>
                        </div>
                        <p>Welcome back, {(user.username || 'Traveler').split('@')[0]}</p>
                    </div>

                    <div className="sidebar-menu">
                        <div className="menu-label">Menu</div>
                        <button
                            onClick={() => setActiveTab('inprogress')}
                            className={`sidebar-btn ${activeTab === 'inprogress' ? 'active' : ''}`}
                        >
                            <Activity size={18} />
                            <span>In Progress</span>
                            <span className="sidebar-count-badge">{tabCounts.inprogress}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('completed')}
                            className={`sidebar-btn ${activeTab === 'completed' ? 'active' : ''}`}
                        >
                            <CheckCheck size={18} />
                            <span>Completed</span>
                            <span className="sidebar-count-badge">{tabCounts.completed}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('recent')}
                            className={`sidebar-btn ${activeTab === 'recent' ? 'active' : ''}`}
                        >
                            <Calendar size={18} />
                            <span>Recent</span>
                            <span className="sidebar-count-badge">{tabCounts.recent}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`sidebar-btn ${activeTab === 'all' ? 'active' : ''}`}
                        >
                            <FolderOpen size={18} />
                            <span>All Trips</span>
                            <span className="sidebar-count-badge">{tabCounts.all}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        >
                            <Wrench size={18} />
                            <span>Settings</span>
                        </button>
                    </div>


                </div>

                {/* Main Content Area */}
                <div className="dashboard-content">
                    {/* Header */}
                    <div className="content-header">
                        <div className="header-title-group">
                            <h2 className="section-title">
                                {activeTab === 'inprogress' && 'In Progress'}
                                {activeTab === 'completed' && 'Completed Trips'}
                                {activeTab === 'all' && 'All Trips'}
                                {activeTab === 'recent' && 'Recent Trips'}
                                {activeTab === 'settings' && 'Settings & Profile'}
                            </h2>
                            {activeTab !== 'settings' && (
                                <span className="results-counter">
                                    {hasActiveFilters
                                        ? `${filteredProjects.length} of ${tabProjects.length} trips`
                                        : `${tabProjects.length} ${tabProjects.length === 1 ? 'trip' : 'trips'}`}
                                </span>
                            )}
                        </div>

                        {activeTab !== 'settings' && (
                            <GlobalSearch
                                projects={projects}
                                onNavigate={(project, section) => {
                                    onSelectProject(project);
                                    if (section && onNavigateToSection) onNavigateToSection(section);
                                }}
                            />
                        )}
                    </div>

                    {/* Filter & Sort Toolbar */}
                    {activeTab !== 'settings' && hasAssignedTrips && (
                        <div className="filters-toolbar">
                            <div className="filters-row">
                                {/* Quick "Created by Me" Toggle Pill */}
                                <button
                                    type="button"
                                    onClick={() => setCreatorFilter(prev => prev === '__me__' ? 'all' : '__me__')}
                                    className={`filter-pill-btn ${creatorFilter === '__me__' ? 'active' : ''}`}
                                    title="Show only trips created by you"
                                >
                                    <User size={14} />
                                    <span>My Trips</span>
                                    <span className="pill-count">{creatorOptions.myCount}</span>
                                </button>

                                {/* Creator Dropdown */}
                                <div className="filter-select-group" title="Filter by trip creator">
                                    <User size={13} className="filter-select-icon" />
                                    <select
                                        value={creatorFilter}
                                        onChange={(e) => setCreatorFilter(e.target.value)}
                                        className={`filter-select ${creatorFilter !== 'all' ? 'active' : ''}`}
                                    >
                                        <option value="all">Created By: Anyone ({tabProjects.length})</option>
                                        <option value="__me__">Created By: Me ({creatorOptions.myCount})</option>
                                        {creatorOptions.others.map(c => (
                                            <option key={c.value} value={c.value}>
                                                Created By: {c.label} ({c.count})
                                            </option>
                                        ))}
                                        {creatorOptions.unknownCount > 0 && (
                                            <option value="__unknown__">Created By: Unknown ({creatorOptions.unknownCount})</option>
                                        )}
                                    </select>
                                </div>

                                {/* Creation Date Filter */}
                                <div className="filter-select-group" title="Filter by creation date">
                                    <Clock size={13} className="filter-select-icon" />
                                    <select
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                        className={`filter-select ${dateFilter !== 'all' ? 'active' : ''}`}
                                    >
                                        <option value="all">Created: Any Time</option>
                                        <option value="7d">Created: Last 7 Days</option>
                                        <option value="30d">Created: Last 30 Days</option>
                                        <option value="90d">Created: Last 90 Days</option>
                                        <option value="this_year">Created: This Year ({new Date().getFullYear()})</option>
                                        {availableYears
                                            .filter(y => y !== new Date().getFullYear())
                                            .map(y => (
                                                <option key={y} value={`year:${y}`}>Created in {y}</option>
                                            ))}
                                        <option value="custom">Created: Custom Range...</option>
                                    </select>
                                </div>

                                {/* Evaluation Progress Filter */}
                                <div className="filter-select-group" title="Filter by evaluation progress">
                                    <Filter size={13} className="filter-select-icon" />
                                    <select
                                        value={progressFilter}
                                        onChange={(e) => setProgressFilter(e.target.value)}
                                        className={`filter-select ${progressFilter !== 'all' ? 'active' : ''}`}
                                    >
                                        <option value="all">Progress: All</option>
                                        <option value="complete">100% Evaluated</option>
                                        <option value="partial">In Progress (1–99%)</option>
                                        <option value="not_started">Not Started (0%)</option>
                                        <option value="empty">No Sections Yet</option>
                                    </select>
                                </div>

                                {/* Sort By Dropdown */}
                                <div className="filter-select-group" title="Sort trips">
                                    <ArrowUpDown size={13} className="filter-select-icon" />
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="filter-select"
                                    >
                                        <option value="created_desc">Sort: Created (Newest)</option>
                                        <option value="created_asc">Sort: Created (Oldest)</option>
                                        {activeTab === 'completed' && (
                                            <option value="completed_desc">Sort: Recently Completed</option>
                                        )}
                                        <option value="modified_desc">Sort: Last Modified</option>
                                        <option value="schedule_desc">Sort: Trip Date (Latest)</option>
                                        <option value="schedule_asc">Sort: Trip Date (Earliest)</option>
                                        <option value="progress_desc">Sort: Progress (High → Low)</option>
                                        <option value="progress_asc">Sort: Progress (Low → High)</option>
                                        <option value="name_asc">Sort: Name (A → Z)</option>
                                        <option value="name_desc">Sort: Name (Z → A)</option>
                                    </select>
                                </div>

                                {/* Quick inline text filter */}
                                <div className="inline-filter-search">
                                    <Search size={13} className="inline-filter-icon" />
                                    <input
                                        type="text"
                                         value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Filter list..."
                                        className="inline-filter-input"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="inline-filter-clear"
                                            title="Clear text filter"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Reset Filters button */}
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="filter-reset-btn"
                                        title="Clear all active filters"
                                    >
                                        <X size={13} />
                                        <span>Reset</span>
                                    </button>
                                )}
                            </div>

                            {/* Custom Creation Date Range inputs */}
                            {dateFilter === 'custom' && (
                                <div className="custom-date-filter-row">
                                    <span className="custom-date-label">Created between:</span>
                                    <input
                                        type="date"
                                        value={customDateFrom}
                                        onChange={(e) => setCustomDateFrom(e.target.value)}
                                        className="custom-date-input"
                                    />
                                    <span className="custom-date-sep">to</span>
                                    <input
                                        type="date"
                                        value={customDateTo}
                                        onChange={(e) => setCustomDateTo(e.target.value)}
                                        className="custom-date-input"
                                    />
                                    {(customDateFrom || customDateTo) && (
                                        <button
                                            type="button"
                                            onClick={() => { setCustomDateFrom(''); setCustomDateTo(''); }}
                                            className="filter-reset-btn"
                                        >
                                            Clear Dates
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settings Tab Content */}
                    {activeTab === 'settings' && (
                        <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="card">
                                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                                    <User size={20} className="text-primary" /> Profile
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Email Address</label>
                                        <input
                                            type="text"
                                            className="input w-full opacity-50 cursor-not-allowed"
                                            value={user.email}
                                            disabled
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Display Name</label>
                                        <input
                                            type="text"
                                            className="input w-full"
                                            value={editDisplayName}
                                            onChange={(e) => setEditDisplayName(e.target.value)}
                                            placeholder="Enter your name"
                                        />
                                    </div>
                                    <button onClick={handleUpdateProfile} className="btn btn-primary w-full mt-2">
                                        Save Changes
                                    </button>
                                </div>
                                <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                                    <button onClick={logout} className="btn btn-outline w-full text-destructive hover:bg-destructive/10 gap-2">
                                        <LogOut size={16} /> Logout
                                    </button>
                                </div>
                            </div>

                            <div className="card">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-medium">Appearance</h3>
                                    <div className="flex items-center gap-4">
                                        <span className="text-muted">Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
                                        <button onClick={toggleTheme} className="btn btn-outline p-2 h-10 w-10" title="Toggle Theme">
                                            {theme === 'dark' && <Moon size={20} />}
                                            {theme === 'light' && <Sun size={20} />}
                                            {theme === 'medium' && <Sunset size={20} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Projects Grid (Only show if NOT settings) */}
                    {activeTab !== 'settings' && (
                        <div className="projects-grid">

                            {/* Create New Trip - Dotted Card (Desktop Only, hide on Completed tab) */}
                            {hasAssignedTrips && activeTab !== 'completed' && (
                                <div className="create-card create-card-grid" onClick={() => document.getElementById('new-trip-input')?.focus()}>
                                    <div className="plus-circle">
                                        <Plus size={24} />
                                    </div>
                                    <div style={{ width: '80%', textAlign: 'center' }}>
                                        <div style={{ marginBottom: '20px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'hsl(var(--muted-foreground))' }}>Create New Trip</span>
                                        </div>
                                        <form onSubmit={handleCreate} style={{ marginTop: '8px', display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                            <input
                                                id="new-trip-input"
                                                type="text"
                                                placeholder="Trip Name"
                                                className="create-input"
                                                value={newProjectName}
                                                onChange={e => setNewProjectName(e.target.value)}
                                            />
                                            <button
                                                type="submit"
                                                className="btn-create"
                                                disabled={!newProjectName.trim() || isCreating}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '6px',
                                                    background: 'hsl(var(--primary))',
                                                    color: 'hsl(var(--primary-foreground))',
                                                    fontSize: '12px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {isCreating ? <Loader size={12} className="animate-spin" /> : "Add"}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* Project Cards */}
                            {filteredProjects.map(project => {
                                // Check privileges for this specific project
                                const isGlobalAdmin = user.email?.toLowerCase() === 'samuel.alalade@ttu.edu';
                                const isMine = isCreatedByCurrentUser(project);
                                const isProjectAdmin = isGlobalAdmin ||
                                    isMine ||
                                    (project.users?.find(u => u.email?.toLowerCase() === user.email?.toLowerCase())?.role === 'admin');

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => editingId !== project.id && onSelectProject(project)}
                                        className="project-card"
                                    >
                                        <div className="card-actions">
                                            {isProjectAdmin && (
                                                <>
                                                    <button
                                                        onClick={(e) => handleMarkComplete(e, project.id, project.status === 'completed')}
                                                        className={`action-btn complete-btn ${project.status === 'completed' ? 'is-complete' : ''}`}
                                                        title={project.status === 'completed' ? 'Reopen Trip' : 'Mark as Complete'}
                                                    >
                                                        {project.status === 'completed' ? <RotateCcw size={14} /> : <CheckCheck size={14} />}
                                                    </button>
                                                    <button onClick={(e) => startEditing(e, project)} className="action-btn">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button onClick={(e) => handleDelete(e, project.id)} className="action-btn delete" title="Delete Trip">
                                                        <Trash2 size={14} />
                                                    </button>
                                                    <button onClick={(e) => handleDuplicate(e, project.id, project.name)} className="action-btn" title="Duplicate Trip">
                                                        <Copy size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        <div>
                                            <div className="card-icon">
                                                <Map size={20} />
                                            </div>

                                            {editingId === project.id ? (
                                                <div onClick={e => e.stopPropagation()} className="edit-mode-container">
                                                    <div className="edit-field-group">
                                                        <label className="edit-label">Trip Name</label>
                                                        <input
                                                            type="text"
                                                            value={editName}
                                                            onChange={(e) => setEditName(e.target.value)}
                                                            className="edit-input-field"
                                                            placeholder="Trip Name"
                                                            autoFocus
                                                        />
                                                    </div>

                                                    <div className="edit-field-group">
                                                        <label className="edit-label">Trip Schedule</label>
                                                        <div className="edit-date-range">
                                                            <div className="date-input-wrapper">
                                                                <input
                                                                    type="date"
                                                                    value={editStartDate}
                                                                    onChange={(e) => setEditStartDate(e.target.value)}
                                                                    className="edit-date-input"
                                                                />
                                                            </div>
                                                            <span className="date-separator">—</span>
                                                            <div className="date-input-wrapper">
                                                                <input
                                                                    type="date"
                                                                    value={editEndDate}
                                                                    onChange={(e) => setEditEndDate(e.target.value)}
                                                                    className="edit-date-input"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="edit-actions">
                                                        <button onClick={cancelEdit} className="btn-edit-cancel" title="Cancel changes">
                                                            <X size={14} /> Cancel
                                                        </button>
                                                        <button onClick={saveEdit} className="btn-edit-save" title="Save changes">
                                                            <Check size={14} /> Save
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <h3 className="card-title">
                                                        {project.name.replace(' (Legacy)', '')}
                                                    </h3>
                                                    <div className="card-meta-row" title={`Created by ${project.createdBy || 'Unknown'} on ${formatIsoDate(project.createdAt)}`}>
                                                        <span className={`creator-chip ${isMine ? 'is-me' : ''}`}>
                                                            <User size={11} />
                                                            {isMine ? 'You' : formatCreatorLabel(project.createdBy)}
                                                        </span>
                                                        <span className="meta-dot">·</span>
                                                        <span className="created-date-text">
                                                            Created {formatIsoDate(project.createdAt)}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="card-footer">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={14} className="calendar-icon" />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Trip Day(s): {formatDateRange(project.startDate, project.endDate)}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {project.status === 'completed' && (
                                                    <span className="complete-badge">DONE</span>
                                                )}
                                                {project.role === 'viewer' && (
                                                    <span className="legacy-badge" style={{ background: '#3b82f6' }}>VIEWER</span>
                                                )}
                                                {project.name.includes('(Legacy)') && (
                                                    <span className="legacy-badge">LEGACY</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        {(() => {
                                            const counts = sectionCounts[project.id];
                                            if (!counts) return (
                                                <div className="trip-progress">
                                                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: '0%' }} /></div>
                                                    <span className="progress-label">Loading...</span>
                                                </div>
                                            );
                                            const { total, evaluated } = counts;
                                            const pct = total > 0 ? Math.round((evaluated / total) * 100) : 0;
                                            return (
                                                <div className="trip-progress">
                                                    <div className="progress-bar-track">
                                                        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="progress-label">
                                                        {total === 0 ? 'No sections yet' : `${evaluated}/${total} evaluated · ${pct}%`}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })}

                            {/* Empty States */}
                            {!hasAssignedTrips && (
                                <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--card)/0.5)]">
                                    <Mail size={48} className="text-[hsl(var(--muted-foreground))] mb-4" />
                                    <h3 className="text-xl font-bold mb-2" style={{ marginTop: "10px" }}>Welcome to Trip Planner!</h3>
                                    <p className="text-[hsl(var(--muted-foreground))] max-w-md mx-auto" style={{ textAlign: "center", marginTop: "10px" }}>
                                        You haven't been assigned to any trips yet. Please contact your administrator to be added to a trip.
                                    </p>
                                </div>
                            )}

                            {hasAssignedTrips && filteredProjects.length === 0 && (
                                <div className="col-span-full flex flex-col items-center justify-center p-12 text-center">
                                    {hasActiveFilters ? (
                                        <>
                                            <Filter size={44} className="text-[hsl(var(--muted-foreground))] mb-3 opacity-50" />
                                            <p className="text-[hsl(var(--muted-foreground))] mb-3">No trips match your current filters.</p>
                                            <button onClick={resetFilters} className="filter-reset-btn" style={{ padding: '8px 16px', fontSize: '13px' }}>
                                                <X size={14} /> Reset Filters
                                            </button>
                                        </>
                                    ) : activeTab === 'completed' ? (
                                        <>
                                            <CheckCheck size={48} className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50" />
                                            <p className="text-[hsl(var(--muted-foreground))]">No completed trips yet. Mark a trip as complete using the ✓✓ button on the card.</p>
                                        </>
                                    ) : (
                                        <>
                                            <FolderOpen size={48} className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50" />
                                            <p className="text-[hsl(var(--muted-foreground))]">No trips found in this section.</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Create FAB */}
            {hasAssignedTrips && activeTab !== 'settings' && (
                <button
                    className="fab-create-btn"
                    onClick={() => {
                        const name = prompt("Enter Trip Name:");
                        if (name) {
                            setNewProjectName(name);
                            // Trigger create immediately or reuse handleCreate logic?
                            // For simplicity, let's just reuse logic by simulating event or refactor handleCreate
                            const fakeEvent = { preventDefault: () => { } };
                            // Use username fallback here for mobile too
                            const creatorName = user.username || user.email || 'admin';
                            createProject(name, creatorName).then(() => fetchProjects()).catch(err => console.error(err));
                        }
                    }}
                >
                    <Plus size={24} />
                </button>
            )}
        </div>
    );
};

export default ProjectSelection;

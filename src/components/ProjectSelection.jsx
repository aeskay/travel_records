
import React, { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, updateProject, consolidateLegacyProjects, duplicateProject } from '../db';
import { useUser } from '../context/UserContext';
import { Plus, FolderOpen, Loader, Trash2, Edit2, Map, Calendar, X, Check, Wrench, User, Mail, Moon, Sun, Sunset, LogOut, Copy } from 'lucide-react';
import './ProjectSelection.css';

const ProjectSelection = ({ user, onSelectProject }) => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newProjectName, setNewProjectName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    // Admin email check (case-insensitive)
    const isAdmin = user?.email?.toLowerCase() === 'samuel.alalade@ttu.edu';

    const { logout, updateUserProfile } = useUser();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'recent'

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const data = await getProjects(user.username);
            setProjects(data || []);
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
        if (window.confirm("Are you sure you want to delete this trip? This will delete all sections associated with it.")) {
            try {
                await deleteProject(projectId, user.username);
                await fetchProjects();
            } catch (err) {
                console.error("Error deleting trip:", err);
                setError("Failed to delete trip.");
            }
        }
    };

    const handleConsolidate = async () => {
        setLoading(true);
        try {
            const result = await consolidateLegacyProjects(user.username);
            alert(`Fixed ${result.deletedProjects} duplicate trips and restored ${result.totalSections} sections.`);
            await fetchProjects();
        } catch (err) {
            console.error("Error consolidating:", err);
            setError("Failed to fix data issues.");
        } finally {
            setLoading(false);
        }
    };

    const handleDuplicate = async (e, projectId, projectName) => {
        e.stopPropagation();
        const newName = prompt(`Enter name for copy of "${projectName}":`, `${projectName} (Copy)`);
        if (!newName) return;

        setLoading(true);
        try {
            await duplicateProject(projectId, newName, user.username);
            alert("Trip duplicated successfully!");
            await fetchProjects();
        } catch (err) {
            console.error("Error duplicating trip:", err);
            alert(`Duplicate failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };



    const startEditing = (e, project) => {
        e.stopPropagation();
        setEditingId(project.id);
        setEditName(project.name);
    };

    const saveEdit = async (e) => {
        e.stopPropagation(); // prevent select
        try {
            await updateProject(editingId, { name: editName }, user.username);
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

    // Filter projects based on search and tab
    const filteredProjects = projects.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTab = activeTab === 'all' || (activeTab === 'recent' && new Date(p.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

        // Check if user has access (is creator, is in users list, or is global admin)
        // Also show legacy projects if they don't have users array (backwards compat)
        const isGlobalAdmin = user.email === 'samuel.alalade@ttu.edu';
        const hasAccess = isGlobalAdmin ||
            p.createdBy === user.username ||
            (p.users && p.users.some(u => u.email === user.email)) ||
            (!p.users && !p.createdBy); // Show old legacy if no owner? Optional.

        return matchesSearch && matchesTab && hasAccess;
    });



    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            await updateUserProfile(editDisplayName);
            alert("Profile updated successfully!");
        } catch (error) {
            console.error("Failed to update profile:", error);
            alert("Failed to update profile");
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
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

    // Ensure initial sync
    useEffect(() => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(current);
    }, []);

    const toggleTheme = () => {
        let newTheme = 'dark';
        if (theme === 'dark') newTheme = 'light';
        else if (theme === 'light') newTheme = 'medium';
        else if (theme === 'medium') newTheme = 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
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
                            onClick={() => setActiveTab('all')}
                            className={`sidebar-btn ${activeTab === 'all' ? 'active' : ''}`}
                        >
                            <FolderOpen size={18} />
                            All Trips
                        </button>
                        <button
                            onClick={() => setActiveTab('recent')}
                            className={`sidebar-btn ${activeTab === 'recent' ? 'active' : ''}`}
                        >
                            <Calendar size={18} />
                            Recent
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        >
                            <Wrench size={18} />
                            Settings
                        </button>
                    </div>

                    {isAdmin && (
                        <div className="mt-auto">
                            {projects.some(p => p.name.includes("Legacy")) && (
                                <div className="maintenance-box">
                                    <Wrench size={16} className="text-amber-500" />
                                    <div>
                                        <div className="text-xs font-bold text-amber-500 uppercase">Maintenance</div>
                                        <button onClick={handleConsolidate} className="maintenance-btn">
                                            Fix Duplicate Trips
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="dashboard-content">
                    {/* Header */}
                    <div className="content-header">
                        <h2 className="section-title">
                            {activeTab === 'all' && 'All Trips'}
                            {activeTab === 'recent' && 'Recent Trips'}
                            {activeTab === 'settings' && 'Settings & Profile'}
                        </h2>

                        {activeTab !== 'settings' && (
                            <div className="search-wrapper">
                                <FolderOpen size={16} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search trips..."
                                    className="search-input"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

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

                            {/* Create New Trip - Dotted Card (Desktop Only) */}
                            {/* EVERYONE can create a trip now, so remove isAdmin check for creation */}
                            {/* Create New Trip - Only show if user has access to at least one trip (or just show it? User said "only show them the trips...").
                                Actually, if they are new, maybe they SHOULD be able to create?
                                But user said "If they have not been added... contact admin". This implies they are passive users.
                                Let's hide it if !hasAssignedTrips.
                            */}
                            {hasAssignedTrips && (
                                <div className="create-card create-card-grid" onClick={() => document.getElementById('new-trip-input')?.focus()}>
                                    <div className="plus-circle">
                                        <Plus size={24} />
                                    </div>
                                    <div style={{ width: '80%', textAlign: 'center' }}>
                                        <div style={{ marginBottom: '20px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#a1a1aa' }}>Create New Trip</span>
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
                                                    background: '#3b82f6',
                                                    color: 'white',
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
                                const isGlobalAdmin = user.email === 'samuel.alalade@ttu.edu';
                                const isProjectAdmin = isGlobalAdmin ||
                                    project.createdBy === user.username ||
                                    (project.users?.find(u => u.email === user.email)?.role === 'admin');

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => editingId !== project.id && onSelectProject(project)}
                                        className="project-card"
                                    >
                                        <div className="card-actions">
                                            {isProjectAdmin && (
                                                <>
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
                                                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #3b82f6', color: '#fff', fontSize: '16px', width: '100%', outline: 'none' }}
                                                        autoFocus
                                                    />
                                                    <button onClick={saveEdit} style={{ color: '#10b981', border: 'none', background: 'none', cursor: 'pointer' }}><Check size={18} /></button>
                                                </div>
                                            ) : (
                                                <h3 className="card-title">
                                                    {project.name.replace(' (Legacy)', '')}
                                                </h3>
                                            )}
                                        </div>

                                        <div className="card-footer">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Calendar size={12} />
                                                <span>{new Date(project.createdAt).getFullYear()}</span>
                                            </div>
                                            {project.role === 'viewer' && (
                                                <span className="legacy-badge" style={{ background: '#3b82f6' }}>VIEWER</span>
                                            )}
                                            {project.name.includes('(Legacy)') && (
                                                <span className="legacy-badge">LEGACY</span>
                                            )}
                                        </div>
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
                                    <FolderOpen size={48} className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50" />
                                    <p className="text-[hsl(var(--muted-foreground))]">
                                        No trips match your search.
                                    </p>
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

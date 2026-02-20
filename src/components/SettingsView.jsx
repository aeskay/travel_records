import { useState, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { getAllData, restoreData, manageProjectUsers, getProjectData, restoreProjectData, repairOrphanedNotes } from '../db';
import { Moon, Sun, Sunset, Download, Upload, LogOut, User, Edit2, Save, Trash2, X, Plus, Wrench, RefreshCw, Loader } from 'lucide-react';

const SettingsView = ({ onClose, isAdmin, currentProject, onProjectUpdate }) => {
    const { user, logout, updateUserProfile, deleteUserAccount } = useUser();
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');
    const [isRepairing, setIsRepairing] = useState(false);
    const fileInputRef = useRef(null);

    // Profile editing state
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [profileData, setProfileData] = useState({
        username: user.username || '',
        firstName: '',
        lastName: ''
    });

    const toggleTheme = () => {
        let newTheme = 'dark';
        if (theme === 'dark') newTheme = 'light';
        else if (theme === 'light') newTheme = 'medium';
        else if (theme === 'medium') newTheme = 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        setTheme(newTheme);
    };

    const handleBackup = async () => {
        try {
            if (!currentProject?.id) {
                alert("No active trip to backup.");
                return;
            }
            const data = await getProjectData(currentProject.id);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-${currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Backup failed", err);
            alert("Backup failed: " + err.message);
        }
    };

    const handleRestore = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!currentProject?.id) {
            alert("No active trip to restore to.");
            return;
        }

        if (confirm(`WARNING: This will overwrite data for the trip "${currentProject.name}". Are you sure?`)) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    const result = await restoreProjectData(data, currentProject.id, user.username);
                    alert(`Restored ${result.count} sections successfully. Reloading...`);
                    window.location.reload();
                } catch (err) {
                    console.error("Restore failed", err);
                    alert("Restore failed: " + err.message);
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

    const handleSaveProfile = async () => {
        if (!profileData.username.trim()) {
            alert("Username cannot be empty");
            return;
        }
        try {
            await updateUserProfile(profileData.username);
            setIsEditingProfile(false);
            alert("Profile updated successfully");
        } catch (err) {
            console.error("Profile update failed", err);
            alert("Failed to update profile: " + err.message);
        }
    };

    const handleCancelEdit = () => {
        setProfileData({
            username: user.username || '',
            firstName: '',
            lastName: ''
        });
        setIsEditingProfile(false);
    };

    const handleDeleteAccount = async () => {
        if (confirm("WARNING: This will permanently delete your account and all associated data. This action cannot be undone. Are you absolutely sure?")) {
            if (confirm("FINAL WARNING: Type your username to confirm: " + user.username)) {
                try {
                    await deleteUserAccount();
                    alert("Account deleted successfully");
                } catch (err) {
                    console.error("Account deletion failed", err);
                    alert("Failed to delete account: " + err.message);
                }
            }
        }
    };

    const handleManageUser = async (action, payload) => {
        try {
            await manageProjectUsers(currentProject.id, action, payload, user.username);
            // Optimistic update or callback?
            if (onProjectUpdate) onProjectUpdate();
            if (action === 'add') setInviteEmail('');
        } catch (err) {
            console.error("User management error:", err);
            alert("Failed: " + err.message);
        }
    };

    const handleRepair = async () => {
        if (!currentProject?.id) return;
        if (!confirm("This will attempt to restore notes that were orphaned due to the duplication bug. It will safely re-link them to your current sections. Continue?")) return;

        setIsRepairing(true);
        try {
            const result = await repairOrphanedNotes(currentProject.id);
            alert(`Repair complete! Successfully restored ${result.count} notes. These should now be visible in your section histories.`);
            if (onProjectUpdate) onProjectUpdate();
        } catch (err) {
            console.error("Repair failed:", err);
            alert("Repair failed: " + err.message);
        } finally {
            setIsRepairing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold border-b border-[hsl(var(--border))] pb-4 mb-6">Settings</h2>

            <div className="card">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="flex items-center gap-2 text-lg font-medium">
                        <User size={20} className="text-[hsl(var(--primary))]" /> Profile
                    </h3>
                    {!isEditingProfile && (
                        <button onClick={() => setIsEditingProfile(true)} className="btn btn-outline">
                            <Edit2 size={16} /> Edit
                        </button>
                    )}
                </div>

                {isEditingProfile ? (
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Username</label>
                            <input
                                type="text"
                                className="input w-full"
                                value={profileData.username}
                                onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
                            />
                        </div>
                        <div className="grid-2">
                            <div>
                                <label className="text-sm font-medium mb-1 block">First Name</label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    value={profileData.firstName}
                                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1 block">Last Name</label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    value={profileData.lastName}
                                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2" style={{ marginTop: '10px' }}>
                            <button onClick={handleSaveProfile} className="btn btn-primary">
                                <Save size={16} /> Save Changes
                            </button>
                            <button onClick={handleCancelEdit} className="btn btn-outline">
                                <X size={16} /> Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-[hsl(var(--background))] p-4 rounded-md border border-[hsl(var(--border))]">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-bold text-lg">{user.username}</p>
                                <p className="text-muted text-sm">{user.email}</p>
                            </div>
                            <button onClick={logout} className="btn btn-outline text-destructive hover:bg-destructive/10">
                                <LogOut size={18} /> Logout
                            </button>
                        </div>
                    </div>
                )}
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

            {isAdmin && (
                <>
                    <div className="card">
                        <h3 className="mb-4 text-lg font-medium flex items-center gap-2">
                            <User size={20} /> User Management
                        </h3>
                        <div className="space-y-4">
                            <div className="bg-[hsl(var(--background))] p-4 rounded-md border border-[hsl(var(--border))]">
                                <h4 className="font-bold mb-2 text-sm uppercase text-muted">Current Users</h4>
                                <div className="space-y-2">
                                    {(currentProject?.users || []).map(u => (
                                        <div key={u.email} className="flex justify-between items-center p-2 hover:bg-[hsl(var(--muted))]/10 rounded">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {u.email.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">{u.email}</div>
                                                    <div className="text-xs text-muted capitalize">{u.role}</div>
                                                </div>
                                            </div>

                                            {u.email !== currentProject.createdBy && (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="input text-xs py-1 px-2 h-auto"
                                                        value={u.role}
                                                        onChange={(e) => handleManageUser('updateRole', { email: u.email, role: e.target.value })}
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                    <button
                                                        onClick={() => handleManageUser('remove', { email: u.email })}
                                                        className="btn btn-outline p-1 text-destructive hover:bg-destructive/10 h-auto"
                                                        title="Remove User"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                            {u.email === currentProject.createdBy && (
                                                <span className="text-xs badge bg-primary/10 text-primary px-2 py-1 rounded">Owner</span>
                                            )}
                                        </div>
                                    ))}
                                    {(!currentProject?.users || currentProject.users.length === 0) && (
                                        <p className="text-sm text-muted italic">No other users in this trip.</p>
                                    )}
                                </div>

                                <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                                    <h4 className="font-bold mb-2 text-sm uppercase text-muted">Invite User</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            placeholder="Enter email address"
                                            className="input flex-1"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                        />
                                        <button
                                            onClick={() => handleManageUser('add', { email: inviteEmail, role: 'viewer' })}
                                            className="btn btn-primary whitespace-nowrap"
                                            disabled={!inviteEmail.trim()}
                                        >
                                            <Plus size={16} /> Invite
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h3 className="mb-4 text-lg font-medium flex items-center gap-2">
                            <Wrench size={20} /> Maintenance
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-[hsl(var(--background))] p-4 rounded-md border border-[hsl(var(--border))]">
                                <div>
                                    <strong className="block">Repair Orphaned Notes</strong>
                                    <span className="text-sm text-muted">Restore history lost during duplication issues</span>
                                </div>
                                <button
                                    onClick={handleRepair}
                                    className="btn btn-outline flex gap-2 items-center"
                                    disabled={isRepairing}
                                >
                                    {isRepairing ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    {isRepairing ? 'Repairing...' : 'Repair Now'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h3 className="mb-4 text-lg font-medium">Data Management</h3>

                        <div className="space-y-4 divide-y divide-[hsl(var(--border))]">
                            <div className="flex justify-between items-center py-2">
                                <div>
                                    <strong className="block">Backup Data</strong>
                                    <span className="text-sm text-muted">Download a copy of your data</span>
                                </div>
                                <button onClick={handleBackup} className="btn btn-primary">
                                    <Download size={16} /> Download
                                </button>
                            </div>

                            <div className="flex justify-between items-center pt-4">
                                <div>
                                    <strong className="block">Restore Data</strong>
                                    <span className="text-sm text-muted">Import data from a backup file</span>
                                </div>
                                <div>
                                    <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleRestore} />
                                    <button onClick={() => fileInputRef.current.click()} className="btn btn-outline">
                                        <Upload size={16} /> Upload
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="card">
                <h3 className="mb-4 text-lg font-medium text-destructive">Danger Zone</h3>
                <div className="bg-[hsl(var(--background))] p-4 rounded-md border border-destructive/50">
                    <div className="flex justify-between items-center">
                        <div>
                            <strong className="block text-destructive">Delete Account</strong>
                            <span className="text-sm text-muted">Permanently delete your account and all data</span>
                        </div>
                        <button onClick={handleDeleteAccount} className="btn btn-outline text-destructive border-destructive/50 hover:bg-destructive/10">
                            <Trash2 size={16} /> Delete Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;


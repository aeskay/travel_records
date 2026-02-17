import { useState, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { getAllData, restoreData } from '../db';
import { Moon, Sun, Download, Upload, LogOut, User, Edit2, Save, Trash2, X } from 'lucide-react';

const SettingsView = ({ onClose, isAdmin }) => {
    const { user, logout, updateUserProfile, deleteUserAccount } = useUser();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute('data-theme') !== 'light');
    const fileInputRef = useRef(null);

    // Profile editing state
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileData, setProfileData] = useState({
        username: user.username || '',
        firstName: '',
        lastName: ''
    });

    const toggleTheme = () => {
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        setIsDark(!isDark);
    };

    const handleBackup = async () => {
        try {
            const data = await getAllData(user.username);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Backup failed", err);
            alert("Backup failed");
        }
    };

    const handleRestore = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (confirm("WARNING: This will overwrite all current data for this user. Are you sure?")) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    await restoreData(data, user.username);
                    alert("Data restored successfully. Reloading...");
                    window.location.reload();
                } catch (err) {
                    console.error("Restore failed", err);
                    alert("Invalid backup file.");
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
                        <span className="text-muted">Theme</span>
                        <button onClick={toggleTheme} className="btn btn-outline p-2 h-10 w-10">
                            {isDark ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            {isAdmin && (
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


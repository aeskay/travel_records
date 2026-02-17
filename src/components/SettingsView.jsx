import { useState, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { getAllData, restoreData, clearSections } from '../db';
import { Moon, Sun, Download, Upload, Trash2, LogOut, User } from 'lucide-react';

const SettingsView = ({ onClose }) => {
    const { user, logout } = useUser();
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute('data-theme') !== 'light');
    const fileInputRef = useRef(null);

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

    const handleReset = async () => {
        if (confirm("DANGER: This will permanently delete ALL data for this user. This cannot be undone. Are you sure?")) {
            await clearSections(user.username);
            alert("Data cleared.");
            window.location.reload();
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '2rem' }}>Settings</h2>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <User size={20} /> Profile
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>{user.username}</p>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Local Profile</p>
                    </div>
                    <button onClick={logout} className="btn btn-glass" style={{ color: 'var(--color-text-primary)' }}>
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Appearance</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Theme</span>
                    <button onClick={toggleTheme} className="btn btn-glass" style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center' }}>
                        {isDark ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Data Management</h3>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                        <div>
                            <strong>Backup Data</strong>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Download a copy of your data</p>
                        </div>
                        <button onClick={handleBackup} className="btn btn-primary">
                            <Download size={18} /> Download
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                        <div>
                            <strong>Restore Data</strong>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Import data from a backup file</p>
                        </div>
                        <div>
                            <input type="file" ref={fileInputRef} accept=".json" style={{ display: 'none' }} onChange={handleRestore} />
                            <button onClick={() => fileInputRef.current.click()} className="btn btn-glass">
                                <Upload size={18} /> Upload
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--color-danger)', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)' }}>
                        <div>
                            <strong style={{ color: 'var(--color-danger)' }}>Reset Data</strong>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>Permanently delete all data</p>
                        </div>
                        <button onClick={handleReset} className="btn btn-danger">
                            <Trash2 size={18} /> Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;

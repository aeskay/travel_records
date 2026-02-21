import { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const [alert, setAlert] = useState(null);
    const [toast, setToast] = useState(null);

    const showAlert = useCallback((message, type = 'info') => {
        return new Promise((resolve) => {
            setAlert({ message, type, mode: 'alert', resolve });
        });
    }, []);

    const showConfirm = useCallback((message) => {
        return new Promise((resolve) => {
            setAlert({ message, mode: 'confirm', resolve });
        });
    }, []);

    const showPrompt = useCallback((message, defaultValue = '') => {
        return new Promise((resolve) => {
            setAlert({ message, mode: 'prompt', defaultValue, resolve });
        });
    }, []);

    const showToast = useCallback((message, duration = 3000) => {
        setToast({ message });
        setTimeout(() => setToast(null), duration);
    }, []);

    const closeAlert = useCallback((result) => {
        if (alert?.resolve) {
            // If it's a prompt, we need the input value
            if (alert.mode === 'prompt' && result === true) {
                const input = document.getElementById('notification-prompt-input');
                alert.resolve(input ? input.value : null);
            } else {
                alert.resolve(result);
            }
        }
        setAlert(null);
    }, [alert]);

    // Handle Enter key for prompt
    useEffect(() => {
        if (alert?.mode === 'prompt') {
            const handleKeyDown = (e) => {
                if (e.key === 'Enter') {
                    closeAlert(true);
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [alert?.mode, closeAlert]);

    return (
        <NotificationContext.Provider value={{ showAlert, showConfirm, showPrompt, showToast }}>
            {children}
            {alert && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={20} color="hsl(var(--primary))" />
                                TechMRT Trip Manager
                            </h2>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: alert.mode === 'prompt' ? '1rem' : '0' }}>{alert.message}</p>
                            {alert.mode === 'prompt' && (
                                <input
                                    id="notification-prompt-input"
                                    type="text"
                                    className="input"
                                    autoFocus
                                    defaultValue={alert.defaultValue}
                                    style={{ width: '100%' }}
                                />
                            )}
                        </div>
                        <div className="modal-footer" style={{ gap: '12px' }}>
                            {(alert.mode === 'confirm' || alert.mode === 'prompt') && (
                                <button className="btn btn-outline" onClick={() => closeAlert(alert.mode === 'confirm' ? false : null)}>Cancel</button>
                            )}
                            <button className="btn btn-primary" onClick={() => closeAlert(true)}>
                                {alert.mode === 'confirm' ? 'Yes' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {toast && (
                <div
                    className="fade-in"
                    style={{
                        position: 'fixed',
                        bottom: '40px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: '24px',
                        zIndex: 10000,
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        pointerEvents: 'none'
                    }}
                >
                    {toast.message}
                </div>
            )}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => useContext(NotificationContext);

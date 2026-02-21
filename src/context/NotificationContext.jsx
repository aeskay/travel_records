import { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
    const [alert, setAlert] = useState(null);
    const [toast, setToast] = useState(null);

    const showAlert = useCallback((message, type = 'info') => {
        return new Promise((resolve) => {
            setAlert({ message, type, resolve });
        });
    }, []);

    const closeAlert = useCallback(() => {
        if (alert?.resolve) alert.resolve();
        setAlert(null);
    }, [alert]);

    const showToast = useCallback((message, duration = 3000) => {
        setToast({ message });
        setTimeout(() => setToast(null), duration);
    }, []);

    return (
        <NotificationContext.Provider value={{ showAlert, showToast }}>
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
                            <p style={{ fontSize: '1rem', lineHeight: '1.5' }}>{alert.message}</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={closeAlert}>OK</button>
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

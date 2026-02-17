import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { User, ArrowRight } from 'lucide-react';

const LoginScreen = () => {
    const [username, setUsername] = useState('');
    const { login } = useUser();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (username.trim()) {
            login(username.trim());
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)'
        }}>
            <div className="card" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                <div style={{
                    width: '80px', height: '80px',
                    borderRadius: '50%', background: 'var(--color-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem'
                }}>
                    <User size={40} color="white" />
                </div>

                <h2 style={{ marginBottom: '1rem' }}>Welcome Back</h2>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
                    Enter your profile name to access your data.
                </p>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Username</label>
                        <input
                            type="text"
                            className="input-field"
                            style={{ width: '100%' }}
                            placeholder="e.g. JohnDoe"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}>
                        Continue <ArrowRight size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;

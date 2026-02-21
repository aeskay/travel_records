import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { User, ArrowRight, Lock, Mail } from 'lucide-react';

const LoginScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login, signup } = useUser();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await signup(email, password);
            }
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
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
            background: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            padding: '2rem'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '2.5rem',
                textAlign: 'center'
            }}>
                <img
                    src="/ttu-logo.svg"
                    style={{ width: '64px', height: '64px', filter: 'drop-shadow(0 0 12px hsl(var(--primary) / 0.3))' }}
                    alt="TTU Logo"
                />
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    background: 'linear-gradient(to bottom, #fff, #a1a1aa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    TechMRT Trips Manager
                </h1>
            </div>

            <div className="card" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                <div style={{
                    width: '80px', height: '80px',
                    borderRadius: '50%', background: 'hsl(var(--primary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 2rem'
                }}>
                    <User size={40} color="white" />
                </div>

                <h2 style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.5rem' }}>
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '2rem' }}>
                    {isLogin ? 'Enter your credentials to access.' : 'Sign up to start tracking.'}
                </p>

                {error && (
                    <div style={{
                        padding: '0.75rem', marginBottom: '1.5rem',
                        backgroundColor: 'hsl(var(--destructive) / 0.15)',
                        color: 'hsl(var(--destructive))', borderRadius: '0.5rem', fontSize: '0.9rem'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                        <label className="text-sm font-medium mb-1 block">Email</label>
                        <div style={{ position: 'relative' }}>
                            <Mail
                                size={18}
                                style={{
                                    position: 'absolute',
                                    left: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'hsl(var(--muted-foreground))',
                                    pointerEvents: 'none'
                                }}
                            />
                            <input
                                type="email"
                                className="input w-full"
                                style={{ paddingLeft: '2.5rem' }}
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                        <label className="text-sm font-medium mb-1 block">Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock
                                size={18}
                                style={{
                                    position: 'absolute',
                                    left: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'hsl(var(--muted-foreground))',
                                    pointerEvents: 'none'
                                }}
                            />
                            <input
                                type="password"
                                className="input w-full"
                                style={{ paddingLeft: '2.5rem' }}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary w-full justify-center py-2" disabled={loading}>
                        {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
                        {!loading && <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        style={{
                            color: 'hsl(var(--primary))',
                            fontWeight: 500,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;


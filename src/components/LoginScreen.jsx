import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { User, ArrowRight, Lock, Mail } from 'lucide-react';
import './LoginScreen.css';

const LoginScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { login, signup, resetPassword } = useUser();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        try {
            if (isForgotPassword) {
                await resetPassword(email);
                setMessage('Check your inbox for further instructions.');
            } else if (isLogin) {
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

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setIsForgotPassword(false);
        setError('');
        setMessage('');
    };

    const toggleForgotPassword = (val) => {
        setIsForgotPassword(val);
        setError('');
        setMessage('');
    };

    return (
        <div className="login-container">
            <div className="login-header">
                <img
                    src="/ttu-logo.svg"
                    style={{ width: '64px', height: '64px', filter: 'drop-shadow(0 0 12px hsl(var(--primary) / 0.3))' }}
                    alt="TTU Logo"
                />
                <h1 className="login-title">
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
                    {isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back' : 'Create Account')}
                </h2>
                <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '2rem' }}>
                    {isForgotPassword ? 'Enter your email to receive a reset link.' : (isLogin ? 'Enter your credentials to access.' : 'Sign up to start tracking.')}
                </p>

                {error && (
                    <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
                        {message}
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

                    {!isForgotPassword && (
                        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                <label className="text-sm font-medium block">Password</label>
                                {isLogin && (
                                    <button
                                        type="button"
                                        onClick={() => toggleForgotPassword(true)}
                                        className="forgot-password-link"
                                    >
                                        Forgot Password?
                                    </button>
                                )}
                            </div>
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
                    )}

                    <button type="submit" className="btn btn-primary w-full justify-center py-2" disabled={loading}>
                        {loading ? 'Processing...' : (isForgotPassword ? 'Reset Password' : (isLogin ? 'Sign In' : 'Sign Up'))}
                        {!loading && <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
                    {isForgotPassword ? (
                        <button
                            onClick={() => toggleForgotPassword(false)}
                            className="mode-toggle-link"
                        >
                            Back to Login
                        </button>
                    ) : (
                        <>
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button
                                onClick={toggleMode}
                                className="mode-toggle-link"
                            >
                                {isLogin ? 'Sign Up' : 'Log In'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Usuario o contraseña incorrectos');
    } else {
      navigate('/eerr');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🐄</div>
        <h1 style={styles.title}>Ganados Don Luis S.A.</h1>
        <p style={styles.subtitle}>Sistema de gestión</p>
        <form onSubmit={handleLogin} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit">
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1C1008',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: '#F2EDD8',
    borderRadius: '12px',
    padding: '48px 40px',
    width: '360px',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  logo: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1C1008',
    marginBottom: '4px',
    fontFamily: 'Georgia, serif',
  },
  subtitle: {
    fontSize: '13px',
    color: '#5E4E36',
    marginBottom: '28px',
    fontFamily: 'Arial, sans-serif',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #D6D0C4',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif',
    background: '#FFFFFF',
    color: '#1C1008',
    outline: 'none',
  },
  button: {
    padding: '11px',
    borderRadius: '6px',
    border: 'none',
    background: '#3E6E34',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '700',
    fontFamily: 'Arial, sans-serif',
    cursor: 'pointer',
    marginTop: '4px',
  },
  error: {
    color: '#7A1A1A',
    fontSize: '13px',
    fontFamily: 'Arial, sans-serif',
  },
};

export default Login;
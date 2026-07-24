import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { APP_NOMBRE, APP_VERSION } from '../version';

const COLOR = {
  fondo:      '#EDE4D2',
  papel:      '#FFFFFF',
  borde:      '#D8CDB6',
  oscuro:     '#241D17',
  bronce:     '#B8873B',
  bronceClaro:'#E4C071',
  texto:      '#2E2519',
  textoSuave: '#8A7B62',
  textoTenue: '#A2947B',
  terracota:  '#A9542F',
  errorFondo: '#FAF0EC',
  errorTexto: '#7A3A1F',
};

const AZULEJOS = ['#7C8460', '#A9542F', '#4A5A5C', '#C08A23'];

const FUENTE = {
  titulo: "'Cormorant Garamond', Georgia, serif",
  ui:     "'Inter', -apple-system, sans-serif",
};

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [focoEmail, setFocoEmail] = useState(false);
  const [focoPass, setFocoPass] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setCargando(false);
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Usuario o contraseña incorrectos'
          : 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.'
      );
    } else {
      navigate('/inicio');
    }
  };

  const campo = (activo) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: `1px solid ${activo ? COLOR.bronce : COLOR.borde}`,
    padding: '0 2px 9px',
    marginBottom: '20px',
    transition: 'border-color 0.2s',
  });

  return (
    <div style={styles.container}>
      <div style={styles.wrap}>

        <div style={styles.azulejos}>
          {AZULEJOS.map(c => (
            <div key={c} style={{ height: '30px', background: c }} />
          ))}
        </div>

        <div style={styles.card}>
          <h1 style={styles.title}>Ganados Don Luis S.A.</h1>
          <div style={styles.regla} />
          <p style={styles.subtitle}>SISTEMA DE GESTIÓN</p>

          <form onSubmit={handleLogin}>
            <label style={styles.label} htmlFor="email">USUARIO</label>
            <div style={campo(focoEmail)}>
              <input
                id="email"
                style={styles.input}
                type="email"
                autoComplete="username"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocoEmail(true)}
                onBlur={() => setFocoEmail(false)}
                required
              />
            </div>

            <label style={styles.label} htmlFor="password">CONTRASEÑA</label>
            <div style={campo(focoPass)}>
              <input
                id="password"
                style={styles.input}
                type={verPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocoPass(true)}
                onBlur={() => setFocoPass(false)}
                required
              />
              <button
                type="button"
                style={styles.verBtn}
                onClick={() => setVerPass(v => !v)}
                aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}>
                {verPass ? 'ocultar' : 'ver'}
              </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              style={{ ...styles.button, opacity: cargando ? 0.6 : 1 }}
              type="submit"
              disabled={cargando}>
              {cargando ? 'INGRESANDO…' : 'INGRESAR'}
            </button>
          </form>

          <p style={styles.ayuda}>¿Olvidaste la contraseña? Consultá con administración</p>
        </div>

        <p style={styles.pie}>{APP_NOMBRE} v{APP_VERSION} · ACCESO RESTRINGIDO</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: COLOR.fondo,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  wrap: { width: '100%', maxWidth: '350px' },
  azulejos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '2px',
    marginBottom: '24px',
  },
  card: {
    background: COLOR.papel,
    border: `1px solid ${COLOR.borde}`,
    borderRadius: '3px',
    padding: '30px 28px',
  },
  title: {
    fontSize: '27px',
    fontWeight: '500',
    color: COLOR.oscuro,
    fontFamily: FUENTE.titulo,
    textAlign: 'center',
    letterSpacing: '0.01em',
    lineHeight: '1.15',
    margin: 0,
  },
  regla: { width: '40px', height: '1px', background: COLOR.bronce, margin: '12px auto 10px' },
  subtitle: {
    fontSize: '9.5px',
    color: COLOR.textoSuave,
    fontFamily: FUENTE.ui,
    textAlign: 'center',
    letterSpacing: '0.22em',
    margin: '0 0 26px',
  },
  label: {
    display: 'block',
    fontSize: '9.5px',
    fontWeight: '500',
    color: COLOR.textoSuave,
    fontFamily: FUENTE.ui,
    letterSpacing: '0.16em',
    marginBottom: '6px',
  },
  input: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '13px',
    fontFamily: FUENTE.ui,
    color: COLOR.texto,
    outline: 'none',
    padding: 0,
  },
  verBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: '10px',
    fontFamily: FUENTE.ui,
    color: COLOR.textoTenue,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    padding: 0,
  },
  error: {
    borderLeft: `2px solid ${COLOR.terracota}`,
    background: COLOR.errorFondo,
    padding: '8px 11px',
    marginBottom: '20px',
    fontSize: '11.5px',
    fontFamily: FUENTE.ui,
    color: COLOR.errorTexto,
  },
  button: {
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: '2px',
    background: COLOR.oscuro,
    color: COLOR.bronceClaro,
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: FUENTE.ui,
    letterSpacing: '0.18em',
    cursor: 'pointer',
  },
  ayuda: {
    fontSize: '10.5px',
    fontWeight: '300',
    color: COLOR.textoTenue,
    fontFamily: FUENTE.ui,
    textAlign: 'center',
    margin: '18px 0 0',
  },
  pie: {
    fontSize: '9px',
    color: COLOR.textoTenue,
    fontFamily: FUENTE.ui,
    textAlign: 'center',
    letterSpacing: '0.2em',
    margin: '18px 0 0',
  },
};

export default Login;
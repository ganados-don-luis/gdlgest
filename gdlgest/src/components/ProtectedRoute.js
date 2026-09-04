import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabase';

const COLOR = {
  fondo: '#EDE4D2',
  oscuro: '#241D17',
  bronce: '#B8873B',
  textoSuave: '#8A7B62',
};

const FUENTE = {
  titulo: "'Cormorant Garamond', Georgia, serif",
  ui: "'Inter', -apple-system, sans-serif",
};

// 30 minutos de inactividad máxima para confidencialidad de datos financieros
const TIEMPO_INACTIVIDAD_MS = 30 * 60 * 1000;

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerInactividad = useRef(null);

  const cerrarSesionInactividad = useCallback(async () => {
    alert('Por razones de confidencialidad y seguridad, tu sesión se cerró tras 30 minutos de inactividad.');
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const reiniciarTimer = useCallback(() => {
    if (timerInactividad.current) clearTimeout(timerInactividad.current);
    timerInactividad.current = setTimeout(cerrarSesionInactividad, TIEMPO_INACTIVIDAD_MS);
  }, [cerrarSesionInactividad]);

  useEffect(() => {
    // Limpieza de seguridad: eliminar cualquier token viejo residual guardado en localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });

    // 1. Obtener la sesión inicial desde sessionStorage
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoading(false);
      if (currentSession) reiniciarTimer();
    });

    // 2. Escuchar cambios de autenticación en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setLoading(false);
      if (currentSession) reiniciarTimer();
    });

    // 3. Registrar eventos de interacción para reiniciar el temporizador de inactividad
    const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActividad = () => reiniciarTimer();

    eventos.forEach(ev => window.addEventListener(ev, handleActividad));

    return () => {
      subscription.unsubscribe();
      if (timerInactividad.current) clearTimeout(timerInactividad.current);
      eventos.forEach(ev => window.removeEventListener(ev, handleActividad));
    };
  }, [reiniciarTimer]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <div style={styles.loadingTitle}>Ganados Don Luis</div>
          <div style={styles.loadingSubtitle}>Verificando credenciales seguras…</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return children;
}

const styles = {
  loadingContainer: {
    minHeight: '100vh',
    background: COLOR.fondo,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FUENTE.ui,
    padding: '20px',
  },
  loadingCard: {
    textAlign: 'center',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: `3px solid ${COLOR.fondo}`,
    borderTop: `3px solid ${COLOR.bronce}`,
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 0.8s linear infinite',
  },
  loadingTitle: {
    fontSize: '22px',
    fontFamily: FUENTE.titulo,
    color: COLOR.oscuro,
    fontWeight: '500',
    marginBottom: '4px',
  },
  loadingSubtitle: {
    fontSize: '11px',
    color: COLOR.textoSuave,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
};

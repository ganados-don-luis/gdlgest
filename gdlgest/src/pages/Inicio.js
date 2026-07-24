import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { APP_NOMBRE, APP_VERSION } from '../version';

const COLOR = {
  fondo: '#EDE4D2', papel: '#FFFFFF', borde: '#D8CDB6', oscuro: '#241D17',
  bronce: '#B8873B', bronceClaro: '#D9A441', texto: '#2E2519',
  textoSuave: '#8A7B62', textoTenue: '#A2947B',
};

const FUENTE = {
  titulo: "'Cormorant Garamond', Georgia, serif",
  ui: "'Inter', -apple-system, sans-serif",
};

const MODULOS = [
  {
    key: 'eerr',
    ruta: '/eerr',
    color: '#7C8460',
    titulo: 'Estado de resultados',
    desc: 'Importación del Balance por Sector y resultado por unidad de negocio, en U$S y AR$.',
    activo: true,
  },
  {
    key: 'flujo',
    ruta: null,
    color: '#A9542F',
    titulo: 'Flujo de fondos',
    desc: 'Ingresos y egresos por banco, conciliación diaria y proyección.',
    activo: false,
  },
  {
    key: 'margen',
    ruta: null,
    color: '#4A5A5C',
    titulo: 'Margen bruto',
    desc: 'Margen por campo y por cultivo, con rinde de indiferencia.',
    activo: false,
  },
  {
    key: 'indicadores',
    ruta: null,
    color: '#C08A23',
    titulo: 'Indicadores',
    desc: 'Tablero de seguimiento con la evolución de cada unidad de negocio.',
    activo: false,
  },
];

export default function Inicio() {
  const navigate = useNavigate();

  const cerrarSesion = async () => {
    if (!window.confirm('¿Cerrar sesión?')) return;
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div style={s.container}>
      <div style={s.wrap}>

        <div style={s.azulejos}>
          {MODULOS.map(m => (
            <div key={m.key} style={{ height: '34px', background: m.color }} />
          ))}
        </div>

        <div style={s.head}>
          <div>
            <h1 style={s.titulo}>Ganados Don Luis</h1>
            <p style={s.sub}>SISTEMA DE GESTIÓN · CAMPAÑA 2025-2026</p>
          </div>
          <button style={s.salir} onClick={cerrarSesion}>Cerrar sesión</button>
        </div>

        <div style={s.grid}>
          {MODULOS.map(m => (
            <div key={m.key}
              style={m.activo ? s.card : s.cardOff}
              onClick={m.activo ? () => navigate(m.ruta) : undefined}>
              <div style={{ ...s.barra, background: m.activo ? m.color : '#D8CDB6' }} />
              <div style={s.cardBody}>
                <div style={s.cardTitulo}>{m.titulo}</div>
                <div style={s.cardDesc}>{m.desc}</div>
                {m.activo
                  ? <div style={{ ...s.entrar, color: m.color }}>Entrar →</div>
                  : <div style={s.proximo}>En desarrollo</div>}
              </div>
            </div>
          ))}
        </div>

        <p style={s.pie}>{APP_NOMBRE} v{APP_VERSION}</p>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: COLOR.fondo, padding: '36px 24px', fontFamily: FUENTE.ui },
  wrap: { maxWidth: '720px', margin: '0 auto' },
  azulejos: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', marginBottom: '26px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '16px', marginBottom: '22px', borderBottom: '1px solid ' + COLOR.borde, gap: '16px', flexWrap: 'wrap' },
  titulo: { fontSize: '32px', fontWeight: '500', color: COLOR.oscuro, fontFamily: FUENTE.titulo, margin: 0, lineHeight: 1.1 },
  sub: { fontSize: '9.5px', color: COLOR.textoSuave, letterSpacing: '0.2em', margin: '7px 0 0' },
  salir: { padding: '6px 14px', fontSize: '10px', fontWeight: '500', fontFamily: FUENTE.ui, background: 'transparent', color: COLOR.bronce, border: '1px solid ' + COLOR.bronce, borderRadius: '2px', cursor: 'pointer', letterSpacing: '0.1em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' },
  card: { background: COLOR.papel, border: '1px solid ' + COLOR.borde, borderRadius: '3px', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' },
  cardOff: { background: '#F7F1E4', border: '1px solid ' + COLOR.borde, borderRadius: '3px', overflow: 'hidden', cursor: 'default', display: 'flex', flexDirection: 'column' },
  barra: { height: '4px' },
  cardBody: { padding: '18px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column' },
  cardTitulo: { fontSize: '17px', fontWeight: '500', color: COLOR.oscuro, fontFamily: FUENTE.titulo, marginBottom: '6px' },
  cardDesc: { fontSize: '12px', color: COLOR.textoSuave, lineHeight: '1.6', flex: 1 },
  entrar: { fontSize: '11px', fontWeight: '500', letterSpacing: '0.08em', marginTop: '14px' },
  proximo: { fontSize: '10px', color: COLOR.textoTenue, letterSpacing: '0.1em', marginTop: '14px' },
  pie: { fontSize: '9px', color: COLOR.textoTenue, textAlign: 'center', letterSpacing: '0.2em', marginTop: '30px' },
};
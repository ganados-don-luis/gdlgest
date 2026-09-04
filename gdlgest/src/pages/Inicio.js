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
    icono: '📊',
    titulo: 'Estado de resultados',
    desc: 'Importación del Balance por Sector y análisis de resultado por unidad de negocio en U$S y AR$.',
    activo: true,
  },
  {
    key: 'flujo',
    ruta: '/flujo',
    color: '#A9542F',
    icono: '🏦',
    titulo: 'Flujo de fondos',
    desc: 'Ingresos y egresos proyectados 2026, cheques en cartera, préstamos, cash flow e impuestos.',
    activo: true,
  },
  {
    key: 'margen',
    ruta: '/margen',
    color: '#4A5A5C',
    icono: '🌾',
    titulo: 'Margen bruto agrícola',
    desc: 'Margen por campo y por lote por cultivo, insumos aplicados y rindes de indiferencia.',
    activo: true,
  },
  {
    key: 'indicadores',
    ruta: '/indicadores',
    color: '#C08A23',
    icono: '📈',
    titulo: 'Indicadores de gestión',
    desc: 'Tablero ejecutivo con indicadores cruzados de MacroGest y planillas internas de campo.',
    activo: true,
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
            <div key={m.key} style={{ height: '5px', background: m.color, borderRadius: '2px' }} />
          ))}
        </div>

        <div style={s.head}>
          <div>
            <div style={s.tagline}>SISTEMA DE GESTIÓN Y CONTROL DIRECTIVO</div>
            <h1 style={s.titulo}>Ganados Don Luis S.A.</h1>
            <p style={s.sub}>PLANIFICACIÓN, GESTIÓN & RESULTADOS</p>
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
                <div style={s.cardHeader}>
                  <span style={s.cardIcono}>{m.icono}</span>
                  <div style={s.cardTitulo}>{m.titulo}</div>
                </div>
                <div style={s.cardDesc}>{m.desc}</div>
                <div style={s.cardFooter}>
                  {m.activo ? (
                    <span style={{ ...s.entrar, color: m.color }}>
                      Acceder al módulo <span style={{ marginLeft: '4px' }}>→</span>
                    </span>
                  ) : (
                    <span style={s.proximo}>Próximamente</span>
                  )}
                </div>
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
  container: {
    minHeight: '100vh',
    background: COLOR.fondo,
    padding: '36px 20px',
    fontFamily: FUENTE.ui,
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  wrap: {
    maxWidth: '1050px',
    margin: '0 auto',
    width: '100%',
  },
  azulejos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px',
    marginBottom: '26px',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: '20px',
    marginBottom: '28px',
    borderBottom: '1px solid ' + COLOR.borde,
    gap: '16px',
    flexWrap: 'wrap',
  },
  tagline: {
    fontSize: '9.5px',
    fontWeight: '700',
    color: COLOR.bronce,
    letterSpacing: '0.18em',
    marginBottom: '4px',
  },
  titulo: {
    fontSize: '34px',
    fontWeight: '500',
    color: COLOR.oscuro,
    fontFamily: FUENTE.titulo,
    margin: 0,
    lineHeight: 1.15,
  },
  sub: {
    fontSize: '10px',
    color: COLOR.textoSuave,
    letterSpacing: '0.14em',
    margin: '6px 0 0',
  },
  salir: {
    padding: '9px 16px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: FUENTE.ui,
    background: 'transparent',
    color: COLOR.bronce,
    border: '1px solid ' + COLOR.bronce,
    borderRadius: '4px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
    touchAction: 'manipulation',
    transition: 'all 0.15s ease',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    background: COLOR.papel,
    border: '1px solid ' + COLOR.borde,
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 14px rgba(36,29,23,0.06)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
  },
  cardOff: {
    background: '#F8F4EC',
    border: '1px dashed ' + COLOR.borde,
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'default',
    display: 'flex',
    flexDirection: 'column',
    opacity: 0.85,
  },
  barra: {
    height: '6px',
  },
  cardBody: {
    padding: '22px 22px 18px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  cardIcono: {
    fontSize: '22px',
  },
  cardTitulo: {
    fontSize: '20px',
    fontWeight: '500',
    color: COLOR.oscuro,
    fontFamily: FUENTE.titulo,
  },
  cardDesc: {
    fontSize: '12.5px',
    color: COLOR.textoSuave,
    lineHeight: '1.6',
    flex: 1,
  },
  cardFooter: {
    marginTop: '20px',
    paddingTop: '12px',
    borderTop: '1px solid #F3EDE2',
  },
  entrar: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    display: 'inline-flex',
    alignItems: 'center',
  },
  proximo: {
    fontSize: '11px',
    color: COLOR.textoTenue,
    letterSpacing: '0.05em',
    fontWeight: '500',
  },
  pie: {
    fontSize: '10px',
    color: COLOR.textoTenue,
    textAlign: 'center',
    letterSpacing: '0.15em',
    marginTop: '36px',
  },
};
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { APP_VERSION } from '../version';
import {
  CAMPANAS_DISPONIBLES,
  CAMPANA_DEFAULT,
  FUENTES_INFORMACION,
  getTcContador
} from '../campanas';

const COLOR = {
  fondo: '#EDE4D2', papel: '#FFFFFF', fila: '#F7F1E4', linea: '#E9E0CE',
  borde: '#D8CDB6', oscuro: '#241D17', medio: '#33291F', bronce: '#B8873B',
  bronceClaro: '#D9A441', texto: '#2E2519', textoSuave: '#7D6E56',
  textoTenue: '#A2947B', ok: '#4C5735', okFondo: '#E4EAD6',
  alerta: '#A9542F', alertaFondo: '#F9E7E2',
};

const FUENTE = {
  titulo: "'Cormorant Garamond', Georgia, serif",
  ui: "'Inter', -apple-system, sans-serif",
};

export default function Indicadores() {
  const navigate = useNavigate();
  const [campana, setCampana] = useState(() => localStorage.getItem('gdl_campana_activa') || CAMPANA_DEFAULT);
  const [modoPrivacidad, setModoPrivacidad] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Estados de datos combinados
  const [siembra, setSiembra] = useState([]);
  const [cosecha, setCosecha] = useState([]);
  const [costos, setCostos] = useState([]);
  const [balances, setBalances] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [tab, setTab] = useState('kpis'); // 'kpis' | 'fuentes' | 'comparativa'

  const cambiarCampana = (nueva) => {
    setCampana(nueva);
    localStorage.setItem('gdl_campana_activa', nueva);
  };

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [s, c, k, b, p] = await Promise.all([
        supabase.from('mb_siembra').select('*').eq('campana', campana),
        supabase.from('mb_cosecha').select('*').eq('campana', campana),
        supabase.from('mb_costo_lote').select('*').eq('campana', campana),
        supabase.from('balance_mensual').select('*').eq('campana', campana).eq('moneda', 'USD'),
        supabase.from('mb_parametros').select('*').eq('campana', campana),
      ]);
      setSiembra(s.data || []);
      setCosecha(c.data || []);
      setCostos(k.data || []);
      setBalances(b.data || []);
      setParametros(p.data || []);
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }, [campana]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Formateadores con modo privacidad
  const fmt = (v, dec = 0) => {
    if (modoPrivacidad) return '••••••';
    if (!v || !isFinite(v) || Math.abs(v) < 0.001) return '—';
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    }).format(v);
  };

  // 1. CÁLCULOS MACROGEST + EXCELS
  const totalHaSembrada = siembra.reduce((acc, s) => acc + (s.ha_sembrada || 0), 0);
  const totalKgNeto = cosecha.reduce((acc, c) => acc + (c.kg_neto || 0), 0);
  const totalKgCampo = cosecha.reduce((acc, c) => acc + (c.kg_campo || 0), 0);
  const mermaVolumen = totalKgCampo > 0 ? ((totalKgCampo - totalKgNeto) / totalKgCampo) * 100 : 0;
  const rindeMedioNetoQq = totalHaSembrada > 0 ? (totalKgNeto / totalHaSembrada / 100) : 0;

  // Costos directos (Macrogest / Siembra)
  const totalCostosDirectosUsd = costos.reduce((acc, c) => acc + (c.usd || 0), 0);
  const costoDirectoPorHa = totalHaSembrada > 0 ? totalCostosDirectosUsd / totalHaSembrada : 0;

  // Ingresos contables (Balance MacroGest / EERR)
  const ingresosContablesUsd = balances
    .filter(b => b.tipo === 'INGRESO')
    .reduce((acc, b) => acc + Math.abs(b.total || 0), 0);

  // Gastos contables (Balance MacroGest / EERR)
  const gastosContablesUsd = balances
    .filter(b => b.tipo === 'GASTO')
    .reduce((acc, b) => acc + Math.abs(b.total || 0), 0);

  const ebitdaEstimadoUsd = ingresosContablesUsd - gastosContablesUsd;

  // Cultivos desglose
  const cultivosUnicos = Array.from(new Set(siembra.map(s => s.cultivo || 'SIN CULTIVO'))).sort();

  return (
    <div style={s.container}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.headerTag}>GANADOS DON LUIS S.A.</div>
            <div style={s.headerTitle}>Tablero de Indicadores de Gestión</div>
            <div style={s.headerSub}>Integración MacroGest & Excels Internos · Campaña {campana}</div>
          </div>
          <div style={s.headerDer}>
            {/* SELECTOR DE CAMPAÑA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#A79883', fontWeight: '600' }}>Campaña:</span>
              <select
                value={campana}
                onChange={(e) => cambiarCampana(e.target.value)}
                style={{
                  background: '#1A140E',
                  color: '#D9A441',
                  border: '1px solid #7E5A12',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {CAMPANAS_DISPONIBLES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* MODO PRIVACIDAD */}
            <button
              onClick={() => setModoPrivacidad(!modoPrivacidad)}
              style={{
                ...s.navBtn,
                background: modoPrivacidad ? '#7A3A1F' : 'rgba(255,255,255,0.06)',
                borderColor: modoPrivacidad ? '#E8A882' : '#4A3E32',
                color: modoPrivacidad ? '#FFF' : '#DDD2BC',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title={modoPrivacidad ? 'Modo Privacidad activo (cifras ocultas)' : 'Ocultar cifras para reuniones/pantalla'}
            >
              {modoPrivacidad ? '🔒 Privacidad ON' : '👁️ Privacidad'}
            </button>

            <button style={s.navBtn} onClick={() => navigate('/inicio')}>← Inicio</button>
            <span style={s.versionBtn}>v{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* TABS NAVEGACIÓN */}
      <div style={s.tabsWrap}>
        <div style={s.tabsContainer} className="touch-scroll">
          <div style={s.tabsTrack}>
            {[
              { key: 'kpis', label: '📊 Ratios & KPIs Ejecutivos' },
              { key: 'comparativa', label: '🌾 MacroGest vs Excels por Cultivo' },
              { key: 'fuentes', label: '📑 Gobernanza de Fuentes' },
            ].map(t => (
              <button
                key={t.key}
                style={tab === t.key ? s.tabActive : s.tab}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={s.content}>
        {cargando ? (
          <div style={s.loading}>Cargando indicadores de la campaña...</div>
        ) : (
          <>
            {tab === 'kpis' && (
              <>
                {/* BANNER INFORMATIVO TC CONTADOR */}
                <div style={s.bannerTc}>
                  <span style={{ fontSize: '18px' }}>💡</span>
                  <div>
                    <strong>Criterio de Homologación Contable:</strong> Para la Campaña {campana}, el tipo de cambio oficial del Contador para la consolidación es de <strong>${fmt(getTcContador(campana), 2)} AR$/USD</strong>. Los módulos cruzan contabilidad de MacroGest con mediciones de lote en campo.
                  </div>
                </div>

                {/* TARJETAS DE KPIS PRINCIPALES */}
                <div style={s.kpisGrid}>
                  <div style={s.kpiCard}>
                    <div style={s.kpiBadge}>MacroGest / Siembra</div>
                    <div style={s.kpiTitulo}>Superficie Operada</div>
                    <div style={s.kpiValor}>{fmt(totalHaSembrada, 1)} ha</div>
                    <div style={s.kpiDesc}>{cultivosUnicos.length} cultivos en producción</div>
                  </div>

                  <div style={s.kpiCard}>
                    <div style={s.kpiBadge}>Excel Rindes / Balanza</div>
                    <div style={s.kpiTitulo}>Rinde Medio Neto</div>
                    <div style={s.kpiValor}>{fmt(rindeMedioNetoQq, 1)} qq/ha</div>
                    <div style={s.kpiDesc}>Merma media en acondicionamiento: {fmt(mermaVolumen, 1)}%</div>
                  </div>

                  <div style={s.kpiCard}>
                    <div style={s.kpiBadge}>MacroGest / Laboreos & Prods</div>
                    <div style={s.kpiTitulo}>Costo Directo Medio</div>
                    <div style={s.kpiValor}>U$S {fmt(costoDirectoPorHa, 0)}/ha</div>
                    <div style={s.kpiDesc}>Total imputado: U$S {fmt(totalCostosDirectosUsd, 0)}</div>
                  </div>

                  <div style={s.kpiCard}>
                    <div style={s.kpiBadge}>Balance Contable MacroGest</div>
                    <div style={s.kpiTitulo}>EBITDA Global</div>
                    <div style={{ ...s.kpiValor, color: ebitdaEstimadoUsd >= 0 ? COLOR.ok : COLOR.alerta }}>
                      U$S {fmt(ebitdaEstimadoUsd, 0)}
                    </div>
                    <div style={s.kpiDesc}>Ingresos: U$S {fmt(ingresosContablesUsd, 0)}</div>
                  </div>
                </div>

                {/* TABLA DE EFICIENCIA POR UNIDAD PRODUCTIVA */}
                <div style={s.card}>
                  <div style={s.cardTitle}>Eficiencia Operativa e Indicadores Agrícolas</div>
                  <div style={s.cardSub}>
                    Cruce de datos agronómicos (maestro de lotes y partes de labor) con imputaciones contables del sistema interno.
                  </div>

                  <div style={s.tableWrap} className="touch-scroll">
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.thL}>Cultivo</th>
                          <th style={s.thR}>Superficie (ha)</th>
                          <th style={s.thR}>Kg Campo</th>
                          <th style={s.thR}>Kg Neto GDL</th>
                          <th style={s.thR}>Rinde (qq/ha)</th>
                          <th style={s.thR}>Costo Directo (U$S)</th>
                          <th style={s.thR}>Costo (U$S/ha)</th>
                          <th style={s.thR}>Precio Base (U$S/tn)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cultivosUnicos.map((cult, idx) => {
                          const haCult = siembra.filter(s => s.cultivo === cult).reduce((a, b) => a + (b.ha_sembrada || 0), 0);
                          const cosCult = cosecha.filter(c => c.cultivo === cult);
                          const kgC = cosCult.reduce((a, b) => a + (b.kg_campo || 0), 0);
                          const kgN = cosCult.reduce((a, b) => a + (b.kg_neto || 0), 0);
                          const rindeQq = haCult > 0 ? kgN / haCult / 100 : 0;
                          const cstCult = costos.filter(k => k.cultivo === cult).reduce((a, b) => a + (b.usd || 0), 0);
                          const cstHa = haCult > 0 ? cstCult / haCult : 0;
                          const param = parametros.find(p => p.cultivo === cult);

                          return (
                            <tr key={cult} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                              <td style={s.tdL}><strong>{cult}</strong></td>
                              <td style={s.tdR}>{fmt(haCult, 1)}</td>
                              <td style={s.tdR}>{fmt(kgC, 0)}</td>
                              <td style={s.tdR}>{fmt(kgN, 0)}</td>
                              <td style={s.tdR}><strong>{fmt(rindeQq, 1)}</strong></td>
                              <td style={s.tdR}>{fmt(cstCult, 0)}</td>
                              <td style={s.tdR}>{fmt(cstHa, 1)}</td>
                              <td style={s.tdR}>{param?.precio_usd_tn ? `U$S ${fmt(param.precio_usd_tn, 1)}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {tab === 'comparativa' && (
              <div style={s.card}>
                <div style={s.cardTitle}>Mapeo de Flujos: MacroGest vs Excels Internos</div>
                <div style={s.cardSub}>
                  Comportamiento y trazabilidad de los flujos físicos y financieros entre el sistema de gestión contable central y las planillas de campo.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div style={s.boxComparativa}>
                    <div style={s.boxHead}>🏢 MacroGest (Sistema Central)</div>
                    <ul style={s.boxList}>
                      <li><strong>Balances mensuales:</strong> Imputación de gastos fijos y facturación real.</li>
                      <li><strong>Laboreos por Lote:</strong> Liquidaciones de contratistas y horas máquina.</li>
                      <li><strong>Remitos de insumos:</strong> Costos valorizados en dólares de agroquímicos y semillas.</li>
                      <li><strong>Estado:</strong> {balances.length > 0 ? `✓ ${balances.length} registros cargados` : '⚠️ Sin balances para esta campaña'}</li>
                    </ul>
                  </div>

                  <div style={s.boxComparativa}>
                    <div style={s.boxHead}>📑 Excels Internos (Gestión Agrícola)</div>
                    <ul style={s.boxList}>
                      <li><strong>Plan de Siembra:</strong> Delimitación de lotes, fecha de siembra y ciclos (invernal/estival).</li>
                      <li><strong>Planilla de Cosecha & Rindes:</strong> Kilos campo vs Kilos neto entregados (GDL).</li>
                      <li><strong>Conciliación de Cuentas:</strong> Tipo de cambio de cierre fijado en ${fmt(getTcContador(campana), 2)}.</li>
                      <li><strong>Estado:</strong> {siembra.length > 0 ? `✓ ${siembra.length} lotes mapeados` : '⚠️ Sin plan de siembra cargado'}</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {tab === 'fuentes' && (
              <div style={s.card}>
                <div style={s.cardTitle}>Gobernanza y Fuentes de Datos Oficiales</div>
                <div style={s.cardSub}>
                  Información clave para conocimiento de todo el equipo de dirección y mandos medios.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  {FUENTES_INFORMACION.map(f => (
                    <div key={f.id} style={{
                      background: '#FDFBF7',
                      border: '1px solid #DDD2BC',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '24px' }}>{f.icono}</span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: f.tipo === 'Sistema Central' ? '#E4EAD6' : f.tipo === 'Planilla Interna' ? '#FBEBCB' : '#EAE5F5',
                          color: f.tipo === 'Sistema Central' ? '#4C5735' : f.tipo === 'Planilla Interna' ? '#7E5A12' : '#5F4B8B'
                        }}>
                          {f.tipo}
                        </span>
                      </div>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: COLOR.texto, fontWeight: '700' }}>{f.nombre}</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: COLOR.textoSuave, lineHeight: 1.4 }}>{f.descripcion}</p>
                      </div>
                      <div style={{ borderTop: '1px solid #EEE6D8', paddingTop: '8px', fontSize: '11px', color: COLOR.textoTenue }}>
                        <div><strong>Frecuencia / Formato:</strong> {f.frecuencia}</div>
                        <div style={{ marginTop: '3px' }}><strong>Módulos impactados:</strong> {f.modulos}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: COLOR.fondo, fontFamily: FUENTE.ui, boxSizing: 'border-box' },
  header: { background: COLOR.oscuro, padding: '14px 20px', borderBottom: '1px solid #382D22' },
  headerInner: { maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' },
  headerTag: { fontSize: '9px', fontWeight: '700', color: COLOR.bronce, letterSpacing: '0.18em', marginBottom: '2px' },
  headerTitle: { fontSize: '24px', fontWeight: '500', color: '#FFF', fontFamily: FUENTE.titulo, lineHeight: 1.1 },
  headerSub: { fontSize: '11px', color: '#A79883', marginTop: '3px', letterSpacing: '0.04em' },
  headerDer: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  navBtn: { padding: '6px 14px', fontSize: '11px', fontWeight: '600', fontFamily: FUENTE.ui, background: 'rgba(255,255,255,0.06)', color: '#FFF', border: '1px solid #4A3E32', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.04em' },
  versionBtn: { padding: '6px 12px', fontSize: '11px', fontWeight: '600', fontFamily: FUENTE.ui, color: '#A79883', border: '1px solid #4A3E32', borderRadius: '4px' },

  tabsWrap: { background: '#24190B', borderBottom: '1px solid #3D2C19', padding: '6px 20px' },
  tabsContainer: { maxWidth: '1440px', margin: '0 auto', display: 'flex' },
  tabsTrack: { display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.25)', padding: '4px', borderRadius: '8px' },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', color: '#A79883', fontSize: '12px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer' },
  tabActive: { padding: '8px 16px', background: '#3D2C19', border: 'none', color: '#D9A441', fontSize: '12px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer' },

  content: { maxWidth: '1440px', margin: '20px auto', padding: '0 20px' },
  loading: { padding: '40px', textAlign: 'center', color: COLOR.textoSuave, fontSize: '14px' },

  bannerTc: {
    background: '#FBF5EB',
    border: '1px solid #E9DDC7',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    fontSize: '13px',
    color: '#4C3B29',
    lineHeight: 1.5,
  },

  kpisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  kpiCard: {
    background: '#FFFFFF',
    border: '1px solid #D8CDB6',
    borderRadius: '10px',
    padding: '18px',
    position: 'relative',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  kpiBadge: {
    display: 'inline-block',
    fontSize: '9.5px',
    fontWeight: '700',
    color: '#7E5A12',
    background: '#FBEBCB',
    padding: '2px 8px',
    borderRadius: '4px',
    marginBottom: '8px',
    textTransform: 'uppercase',
  },
  kpiTitulo: { fontSize: '12px', color: COLOR.textoSuave, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' },
  kpiValor: { fontSize: '26px', fontWeight: '700', color: COLOR.texto, fontFamily: FUENTE.titulo, margin: '6px 0' },
  kpiDesc: { fontSize: '11px', color: COLOR.textoTenue },

  card: { background: '#FFFFFF', border: '1px solid #D8CDB6', borderRadius: '10px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' },
  cardTitle: { fontSize: '17px', fontWeight: '700', color: COLOR.texto, fontFamily: FUENTE.titulo, marginBottom: '4px' },
  cardSub: { fontSize: '12px', color: COLOR.textoSuave, marginBottom: '16px', lineHeight: 1.4 },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  thL: { textAlign: 'left', padding: '9px 12px', background: '#33291F', color: '#FFF', fontWeight: '600', borderBottom: '1px solid #D8CDB6' },
  thR: { textAlign: 'right', padding: '9px 12px', background: '#33291F', color: '#FFF', fontWeight: '600', borderBottom: '1px solid #D8CDB6' },
  tdL: { textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid #E9E0CE', color: COLOR.texto },
  tdR: { textAlign: 'right', padding: '9px 12px', borderBottom: '1px solid #E9E0CE', color: COLOR.texto },

  boxComparativa: { background: '#FDFBF7', border: '1px solid #DDD2BC', borderRadius: '8px', padding: '16px' },
  boxHead: { fontSize: '14px', fontWeight: '700', color: COLOR.texto, marginBottom: '10px' },
  boxList: { margin: 0, paddingLeft: '18px', fontSize: '12px', color: COLOR.textoSuave, lineHeight: 1.8 },
};

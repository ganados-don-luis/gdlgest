import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_VERSION } from '../version';
import flujoData from '../dataFlujoFondos2026.json';

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

// Conversión de fecha Excel
const formatExcelDate = (serial) => {
  if (!serial) return '—';
  if (typeof serial === 'string') {
    return serial.split(' ')[0] || serial;
  }
  if (typeof serial === 'number' && serial > 30000 && serial < 60000) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const d = String(dateInfo.getUTCDate()).padStart(2, '0');
    const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const y = dateInfo.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(serial);
};

export default function FlujoFondos() {
  const navigate = useNavigate();
  const [modoPrivacidad, setModoPrivacidad] = useState(false);
  
  // Tabs principales: 'bancos' | 'ffMes' | 'cheques' | 'prestamos' | 'cashFlow' | 'impuestos'
  const [tab, setTab] = useState('bancos');

  // Sub-estado de Bancos
  const [bancoSeleccionado, setBancoSeleccionado] = useState('bna'); // 'bna' | 'santander' | 'credicoop' | 'galicia'
  const [vistaBanco, setVistaBanco] = useState('diario'); // 'diario' | 'mensual'
  const [filtroMesBanco, setFiltroMesBanco] = useState('todos');

  const fmt = (v, dec = 0) => {
    if (modoPrivacidad) return '••••••';
    if (v === '' || v === null || v === undefined) return '—';
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    if (isNaN(num)) return v;
    if (Math.abs(num) < 0.001) return '—';
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    }).format(num);
  };

  // 1. Datos bancarios
  const saldos = flujoData.saldosActuales || {
    bna: 15769666.17,
    santander: 99796.18,
    credicoop: 131710.40,
    galicia: 102499.53,
    totalBancos: 16103672.28
  };

  const bancosInfo = {
    bna: { nombre: 'Banco Nación (BNA)', cta: '551 0020887', cbu: '0110551320055100208874', saldo: saldos.bna },
    santander: { nombre: 'Banco Santander', cta: '9184-2', cbu: '0720497920000000918422', saldo: saldos.santander },
    credicoop: { nombre: 'Banco Credicoop', cta: 'Cta Cte General', cbu: '0191...', saldo: saldos.credicoop },
    galicia: { nombre: 'Banco Galicia', cta: 'Cta Cte General', cbu: '007...', saldo: saldos.galicia },
  };

  const bancoActual = (flujoData.bancos && flujoData.bancos[bancoSeleccionado]) || {
    nombre: bancoSeleccionado.toUpperCase(),
    saldoActual: saldos[bancoSeleccionado],
    movimientos: [],
    resumenMensual: []
  };

  const mesesDisponiblesBanco = Array.from(new Set(bancoActual.movimientos.map(m => m.mes))).filter(Boolean).sort();

  const movimientosFiltrados = bancoActual.movimientos.filter(m => {
    if (filtroMesBanco !== 'todos' && m.mes !== filtroMesBanco) return false;
    return true;
  });

  // 2. Datos FF Mes AR$
  const mesesHeaders = [
    'Ene 2026', 'Feb 2026', 'Mar 2026', 'Abr 2026', 'May 2026', 'Jun 2026',
    'Jul 2026', 'Ago 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dic 2026'
  ];
  const ffMesFilas = (flujoData.ffMes || []).slice(2, 26).filter(r => r[1] && String(r[1]).trim() !== '');

  // 3. Datos Cheques Cartera
  const cheques = (flujoData.cheques || []).slice(1).filter(r => r[7] && r[7] > 0);
  const totalChequesMonto = cheques.reduce((acc, c) => acc + (parseFloat(c[7]) || 0), 0);

  // 4. Préstamos 2026
  const prestamos = (flujoData.prestamos || []).slice(3).filter(r => r[1] && String(r[1]).trim() !== '');
  const totalPrestamosCuotas = prestamos.reduce((acc, p) => acc + (parseFloat(p[7]) || 0), 0);

  // 5. Impuestos 2026
  const impuestos = (flujoData.impuestos || []).slice(4).filter(r => (r[0] || r[1]) && (r[4] || r[5] || r[6]));

  return (
    <div style={s.container}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.headerTag}>GANADOS DON LUIS S.A.</div>
            <div style={s.headerTitle}>Flujo de Fondos & Tesorería Continua</div>
            <div style={s.headerSub}>Control Bancario Diario/Mensual, Saldos al Día, Cheques y Obligaciones Financieras</div>
          </div>
          <div style={s.headerDer}>
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

      {/* SALDOS EN VIVO AL DÍA DE LA FECHA */}
      <div style={s.saldosBar}>
        <div style={s.saldosInner}>
          <div style={s.saldosBadge}>
            <span style={s.puntoVerde}>●</span> SALDOS AL DÍA DE LA FECHA
          </div>
          <div style={s.saldosGrid}>
            <div
              style={{ ...s.saldoItem, borderColor: bancoSeleccionado === 'bna' ? '#D9A441' : '#E9E0CE' }}
              onClick={() => { setTab('bancos'); setBancoSeleccionado('bna'); }}
            >
              <div style={s.saldoBanco}>BNA Cta 551</div>
              <div style={s.saldoMonto}>${fmt(saldos.bna, 2)}</div>
            </div>
            <div
              style={{ ...s.saldoItem, borderColor: bancoSeleccionado === 'santander' ? '#D9A441' : '#E9E0CE' }}
              onClick={() => { setTab('bancos'); setBancoSeleccionado('santander'); }}
            >
              <div style={s.saldoBanco}>Santander 9184</div>
              <div style={s.saldoMonto}>${fmt(saldos.santander, 2)}</div>
            </div>
            <div
              style={{ ...s.saldoItem, borderColor: bancoSeleccionado === 'credicoop' ? '#D9A441' : '#E9E0CE' }}
              onClick={() => { setTab('bancos'); setBancoSeleccionado('credicoop'); }}
            >
              <div style={s.saldoBanco}>Credicoop</div>
              <div style={s.saldoMonto}>${fmt(saldos.credicoop, 2)}</div>
            </div>
            <div
              style={{ ...s.saldoItem, borderColor: bancoSeleccionado === 'galicia' ? '#D9A441' : '#E9E0CE' }}
              onClick={() => { setTab('bancos'); setBancoSeleccionado('galicia'); }}
            >
              <div style={s.saldoBanco}>Galicia</div>
              <div style={s.saldoMonto}>${fmt(saldos.galicia, 2)}</div>
            </div>
            <div style={s.saldoItemTotal}>
              <div style={s.saldoBancoTotal}>DISPONIBLE TOTAL BANCOS</div>
              <div style={s.saldoMontoTotal}>${fmt(saldos.totalBancos, 2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* TABS DE SECCIONES */}
      <div style={s.tabsWrap}>
        <div style={s.tabsContainer} className="touch-scroll">
          <div style={s.tabsTrack}>
            {[
              { key: 'bancos', label: '🏦 Detalle por Banco (BNA, Santander, Credicoop, Galicia)' },
              { key: 'ffMes', label: '📅 Proyección Mensual AR$' },
              { key: 'cheques', label: '🎫 Cheques en Cartera' },
              { key: 'prestamos', label: '📊 Préstamos & Deuda' },
              { key: 'cashFlow', label: '📈 Cash Flow Consolidado' },
              { key: 'impuestos', label: '🏛️ Impuestos & Servicios' },
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

      {/* CONTENIDO PRINCIPAL */}
      <div style={s.content}>

        {/* ── TAB BANCOS DETALLADOS (DIARIO Y MENSUAL) ── */}
        {tab === 'bancos' && (
          <div>
            {/* SUB-BARRA SELECTORA DE BANCO */}
            <div style={s.subBarra}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Object.keys(bancosInfo).map(k => (
                  <button
                    key={k}
                    style={bancoSeleccionado === k ? s.btnBancoActivo : s.btnBancoInactivo}
                    onClick={() => { setBancoSeleccionado(k); setFiltroMesBanco('todos'); }}
                  >
                    {bancosInfo[k].nombre}
                  </button>
                ))}
              </div>

              {/* SWITCH VISTA: DIARIO VS MENSUAL */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  style={vistaBanco === 'diario' ? s.btnPillActivo : s.btnPillInactivo}
                  onClick={() => setVistaBanco('diario')}
                >
                  📝 Detalle Diario ({movimientosFiltrados.length} movs)
                </button>
                <button
                  style={vistaBanco === 'mensual' ? s.btnPillActivo : s.btnPillInactivo}
                  onClick={() => setVistaBanco('mensual')}
                >
                  📅 Resumen Mensual ({bancoActual.resumenMensual.length} meses)
                </button>
              </div>
            </div>

            {/* FICHA TÉCNICA DEL BANCO SELECCIONADO */}
            <div style={s.cardFichaBanco}>
              <div>
                <span style={s.fichaTag}>CUENTA BANCARIA ACTIVA</span>
                <h2 style={s.fichaTitulo}>{bancosInfo[bancoSeleccionado].nombre}</h2>
                <div style={s.fichaSub}>
                  Cuenta: <strong>{bancosInfo[bancoSeleccionado].cta}</strong> · CBU: <strong>{bancosInfo[bancoSeleccionado].cbu}</strong>
                </div>
              </div>
              <div style={s.fichaSaldoBox}>
                <div style={s.fichaSaldoEtiqueta}>Saldo Conciliado al Día de la Fecha</div>
                <div style={s.fichaSaldoMonto}>${fmt(bancoActual.saldoActual, 2)}</div>
              </div>
            </div>

            {/* VISTA 1: DETALLE DIARIO */}
            {vistaBanco === 'diario' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={s.cardTitle}>Movimientos Diarios - Débitos, Créditos y Saldos</div>
                    <div style={s.cardSub}>Registro cronológico de todas las acreditaciones, cheques y transferencias.</div>
                  </div>

                  {/* FILTRO POR MES */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: COLOR.textoSuave, fontWeight: '600' }}>Filtrar por período:</span>
                    <select
                      value={filtroMesBanco}
                      onChange={(e) => setFiltroMesBanco(e.target.value)}
                      style={s.selectFiltro}
                    >
                      <option value="todos">Todos los períodos ({bancoActual.movimientos.length})</option>
                      {mesesDisponiblesBanco.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={s.tableWrap} className="touch-scroll">
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Fecha</th>
                        <th style={{ ...s.thL, minWidth: '320px' }}>Detalle / Concepto</th>
                        <th style={s.thR}>Débitos ($)</th>
                        <th style={s.thR}>Créditos ($)</th>
                        <th style={s.thR}>Saldo ($)</th>
                        <th style={s.thL}>Conciliación</th>
                        <th style={s.thL}>Clasificación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientosFiltrados.map((m, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                          <td style={s.tdL}><strong>{m.fecha}</strong></td>
                          <td style={s.tdL}>{m.detalle}</td>
                          <td style={{ ...s.tdR, color: m.debitos > 0 ? COLOR.alerta : COLOR.textoSuave }}>
                            {m.debitos > 0 ? `-${fmt(m.debitos, 2)}` : '—'}
                          </td>
                          <td style={{ ...s.tdR, color: m.creditos > 0 ? COLOR.ok : COLOR.textoSuave }}>
                            {m.creditos > 0 ? `+${fmt(m.creditos, 2)}` : '—'}
                          </td>
                          <td style={{ ...s.tdR, fontWeight: '700' }}>
                            ${fmt(m.saldo, 2)}
                          </td>
                          <td style={s.tdL}>
                            <span style={m.conciliacion === 'Ok' ? s.badgeOk : s.badgePend}>
                              {m.conciliacion || 'Ok'}
                            </span>
                          </td>
                          <td style={s.tdL}>{m.clasificacion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VISTA 2: RESUMEN MENSUAL */}
            {vistaBanco === 'mensual' && (
              <div style={s.card}>
                <div style={s.cardTitle}>Evolución Mensual de Débitos y Créditos</div>
                <div style={s.cardSub}>Totales acumulados por mes calendario para {bancosInfo[bancoSeleccionado].nombre}.</div>

                <div style={s.tableWrap} className="touch-scroll">
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Mes / Período</th>
                        <th style={s.thR}>Cantidad de Operaciones</th>
                        <th style={s.thR}>Total Débitos ($)</th>
                        <th style={s.thR}>Total Créditos ($)</th>
                        <th style={s.thR}>Flujo Neto Mes ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bancoActual.resumenMensual.map((rm, idx) => {
                        const flujoNeto = rm.creditos - rm.debitos;
                        return (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                            <td style={s.tdL}><strong>{rm.mes}</strong></td>
                            <td style={s.tdR}>{rm.cant}</td>
                            <td style={{ ...s.tdR, color: COLOR.alerta }}>-${fmt(rm.debitos, 2)}</td>
                            <td style={{ ...s.tdR, color: COLOR.ok }}>+${fmt(rm.creditos, 2)}</td>
                            <td style={{ ...s.tdR, fontWeight: '700', color: flujoNeto >= 0 ? COLOR.ok : COLOR.alerta }}>
                              ${fmt(flujoNeto, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB FF MENSUAL AR$ ── */}
        {tab === 'ffMes' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Flujo de Fondos Mensualizado - Año 2026 (en AR$)</div>
            <div style={s.cardSub}>
              Proyección consolidada de Ingresos y Egresos operativos por rubro presupuestario de la planilla matriz.
            </div>

            <div style={s.tableWrap} className="touch-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.thL, minWidth: '220px' }}>Concepto</th>
                    {mesesHeaders.map((m, i) => (
                      <th key={i} style={s.thR}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ffMesFilas.map((row, idx) => {
                    const concepto = String(row[1] || '').trim();
                    const esHeader = concepto === 'INGRESOS' || concepto === 'EGRESOS' || concepto === 'SALDO';
                    const estiloFila = esHeader ? s.trHeaderSeccion : (idx % 2 === 0 ? s.trPar : s.trImpar);

                    return (
                      <tr key={idx} style={estiloFila}>
                        <td style={esHeader ? s.tdHeaderL : s.tdL}>
                          <strong>{concepto}</strong>
                        </td>
                        {Array.from({ length: 12 }).map((_, cIdx) => {
                          const val = row[4 + cIdx];
                          return (
                            <td key={cIdx} style={esHeader ? s.tdHeaderR : s.tdR}>
                              {fmt(val, 0)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB CHEQUES EN CARTERA ── */}
        {tab === 'cheques' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={s.cardTitle}>Listado de Cheques en Cartera</div>
                <div style={s.cardSub}>Valores diferidos registrados con vencimiento, número de cheque y librador.</div>
              </div>
              <div style={s.badgeTotal}>
                Total en cartera: <strong>${fmt(totalChequesMonto, 2)}</strong>
              </div>
            </div>

            <div style={s.tableWrap} className="touch-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thL}>N° Orden</th>
                    <th style={s.thL}>N° Cheque</th>
                    <th style={s.thL}>Librador / Recibido de</th>
                    <th style={s.thR}>Fecha Vencimiento</th>
                    <th style={s.thR}>Fecha Ingreso</th>
                    <th style={s.thR}>Importe ($)</th>
                    <th style={s.thL}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((ch, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                      <td style={s.tdL}>{ch[0] || '—'}</td>
                      <td style={s.tdL}><strong>{ch[3]}</strong></td>
                      <td style={s.tdL}>{ch[8] || 'FRIGALES SRL'}</td>
                      <td style={s.tdR}><strong>{formatExcelDate(ch[4])}</strong></td>
                      <td style={s.tdR}>{formatExcelDate(ch[5])}</td>
                      <td style={{ ...s.tdR, color: COLOR.texto, fontWeight: '700' }}>${fmt(ch[7], 2)}</td>
                      <td style={s.tdL}>{ch[23] || 'PROPIO'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB PRESTAMOS ── */}
        {tab === 'prestamos' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={s.cardTitle}>Cronograma de Préstamos Bancarios - Año 2026</div>
                <div style={s.cardSub}>Ampliación de Criadero, Acoplado Ombú y compromisos financieros tomados.</div>
              </div>
              <div style={s.badgeTotal}>
                Total cuotas programadas: <strong>${fmt(totalPrestamosCuotas, 2)}</strong>
              </div>
            </div>

            <div style={s.tableWrap} className="touch-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thL}>Entidad</th>
                    <th style={s.thL}>N° Préstamo</th>
                    <th style={s.thL}>Destino / Bien Financiado</th>
                    <th style={s.thL}>Sector</th>
                    <th style={s.thL}>Cuota</th>
                    <th style={s.thR}>Vencimiento</th>
                    <th style={s.thR}>Importe Cuota ($)</th>
                    <th style={s.thL}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamos.map((p, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                      <td style={s.tdL}><strong>{p[1]}</strong></td>
                      <td style={s.tdL}>{p[2]}</td>
                      <td style={s.tdL}>{p[3]}</td>
                      <td style={s.tdL}>{p[4] || 'General'}</td>
                      <td style={s.tdL}>{p[5]}</td>
                      <td style={s.tdR}>{formatExcelDate(p[6])}</td>
                      <td style={{ ...s.tdR, fontWeight: '700' }}>${fmt(p[7], 2)}</td>
                      <td style={s.tdL}>
                        <span style={s.badgeOk}>{p[10] || 'Programado'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB CASH FLOW ── */}
        {tab === 'cashFlow' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Cash Flow Bancario Diario</div>
            <div style={s.cardSub}>
              Composición consolidada de ingresos y egresos diarios proyectados.
            </div>

            <div style={s.tableWrap} className="touch-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.thL, minWidth: '220px' }}>Concepto / Banco</th>
                    {flujoData.cashFlow?.[2]?.slice(1, 13).map((col, idx) => (
                      <th key={idx} style={s.thR}>{formatExcelDate(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(flujoData.cashFlow || []).slice(2, 25).filter(r => r[0] && String(r[0]).trim() !== '').map((r, idx) => {
                    const concepto = String(r[0]).trim();
                    const esDestacado = concepto === 'Saldo Inicial' || concepto === 'Total Ingresos' || concepto === 'Total Egresos' || concepto === 'Saldo Final';
                    return (
                      <tr key={idx} style={esDestacado ? s.trHeaderSeccion : (idx % 2 === 0 ? s.trPar : s.trImpar)}>
                        <td style={esDestacado ? s.tdHeaderL : s.tdL}>
                          <strong>{concepto}</strong>
                        </td>
                        {r.slice(1, 13).map((val, cIdx) => (
                          <td key={cIdx} style={esDestacado ? s.tdHeaderR : s.tdR}>
                            {fmt(val, 0)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB IMPUESTOS Y SERVICIOS ── */}
        {tab === 'impuestos' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Impuestos y Servicios Públicos 2026</div>
            <div style={s.cardSub}>
              Seguimiento mensual de Coevical, Litoral Gas, TGIU y consumos de planta y oficinas.
            </div>

            <div style={s.tableWrap} className="touch-scroll">
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thL}>Impuesto / Servicio</th>
                    <th style={s.thL}>Titular</th>
                    <th style={s.thL}>N° Imp / Cuenta</th>
                    <th style={s.thL}>Dirección</th>
                    <th style={s.thR}>Enero</th>
                    <th style={s.thR}>Febrero</th>
                    <th style={s.thR}>Marzo</th>
                    <th style={s.thR}>Abril</th>
                    <th style={s.thR}>Mayo</th>
                    <th style={s.thR}>Junio</th>
                  </tr>
                </thead>
                <tbody>
                  {impuestos.map((imp, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F7F1E4' }}>
                      <td style={s.tdL}><strong>{imp[0] || 'Coevical'}</strong></td>
                      <td style={s.tdL}>{imp[1]}</td>
                      <td style={s.tdL}>{imp[2]}</td>
                      <td style={s.tdL}>{imp[3]}</td>
                      <td style={s.tdR}>${fmt(imp[4], 2)}</td>
                      <td style={s.tdR}>${fmt(imp[5], 2)}</td>
                      <td style={s.tdR}>${fmt(imp[6], 2)}</td>
                      <td style={s.tdR}>${fmt(imp[7], 2)}</td>
                      <td style={s.tdR}>${fmt(imp[8], 2)}</td>
                      <td style={s.tdR}>${fmt(imp[9], 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

  // BARRA DE SALDOS AL DÍA
  saldosBar: { background: '#2B2117', borderBottom: '1px solid #453627', padding: '12px 20px' },
  saldosInner: { maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  saldosBadge: { fontSize: '10.5px', fontWeight: '700', color: '#D9A441', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '6px' },
  puntoVerde: { color: '#88D969', fontSize: '12px' },
  saldosGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' },
  saldoItem: {
    background: '#1D160F',
    border: '1px solid #3E2F20',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  saldoBanco: { fontSize: '10.5px', color: '#B5A58E', fontWeight: '600', textTransform: 'uppercase' },
  saldoMonto: { fontSize: '17px', fontWeight: '700', color: '#FFFFFF', marginTop: '2px', fontFamily: FUENTE.titulo },

  saldoItemTotal: {
    background: '#3E2F20',
    border: '1px solid #7E5A12',
    borderRadius: '8px',
    padding: '10px 14px',
  },
  saldoBancoTotal: { fontSize: '10.5px', color: '#E4C071', fontWeight: '700', textTransform: 'uppercase' },
  saldoMontoTotal: { fontSize: '18px', fontWeight: '700', color: '#A8CC90', marginTop: '2px', fontFamily: FUENTE.titulo },

  tabsWrap: { background: '#24190B', borderBottom: '1px solid #3D2C19', padding: '6px 20px' },
  tabsContainer: { maxWidth: '1440px', margin: '0 auto', display: 'flex' },
  tabsTrack: { display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.25)', padding: '4px', borderRadius: '8px' },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', color: '#A79883', fontSize: '12px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' },
  tabActive: { padding: '8px 16px', background: '#3D2C19', border: 'none', color: '#D9A441', fontSize: '12px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' },

  content: { maxWidth: '1440px', margin: '20px auto', padding: '0 20px' },

  // BANCOS SUB-BAR
  subBarra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  btnBancoActivo: { padding: '8px 14px', background: '#33291F', color: '#FFF', border: '1px solid #33291F', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  btnBancoInactivo: { padding: '8px 14px', background: '#FFFFFF', color: '#7D6E56', border: '1px solid #D8CDB6', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  
  btnPillActivo: { padding: '6px 12px', background: '#7E5A12', color: '#FFF', border: 'none', borderRadius: '20px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' },
  btnPillInactivo: { padding: '6px 12px', background: '#E6DDC8', color: '#5A4A35', border: 'none', borderRadius: '20px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer' },

  cardFichaBanco: {
    background: '#FFFFFF',
    border: '1px solid #D8CDB6',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  fichaTag: { fontSize: '9px', fontWeight: '700', color: COLOR.bronce, letterSpacing: '0.12em' },
  fichaTitulo: { margin: '2px 0', fontSize: '20px', fontFamily: FUENTE.titulo, color: COLOR.texto },
  fichaSub: { fontSize: '12px', color: COLOR.textoSuave },
  fichaSaldoBox: { textAlign: 'right' },
  fichaSaldoEtiqueta: { fontSize: '11px', fontWeight: '600', color: COLOR.textoSuave },
  fichaSaldoMonto: { fontSize: '26px', fontWeight: '700', color: COLOR.ok, fontFamily: FUENTE.titulo },

  selectFiltro: {
    background: '#FFFFFF',
    border: '1px solid #D8CDB6',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '11.5px',
    color: COLOR.texto,
    outline: 'none',
  },

  card: { background: '#FFFFFF', border: '1px solid #D8CDB6', borderRadius: '10px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' },
  cardTitle: { fontSize: '17px', fontWeight: '700', color: COLOR.texto, fontFamily: FUENTE.titulo, marginBottom: '4px' },
  cardSub: { fontSize: '12px', color: COLOR.textoSuave, marginBottom: '16px', lineHeight: 1.4 },

  badgeTotal: {
    background: '#FBEBCB',
    color: '#7E5A12',
    border: '1px solid #E6C070',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
  },
  badgeOk: {
    background: '#E4EAD6',
    color: '#4C5735',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
  },
  badgePend: {
    background: '#FBEBCB',
    color: '#7E5A12',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
  },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  thL: { textAlign: 'left', padding: '9px 12px', background: '#33291F', color: '#FFF', fontWeight: '600', borderBottom: '1px solid #D8CDB6', whiteSpace: 'nowrap' },
  thR: { textAlign: 'right', padding: '9px 12px', background: '#33291F', color: '#FFF', fontWeight: '600', borderBottom: '1px solid #D8CDB6', whiteSpace: 'nowrap' },
  tdL: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E9E0CE', color: COLOR.texto, whiteSpace: 'nowrap' },
  tdR: { textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid #E9E0CE', color: COLOR.texto, whiteSpace: 'nowrap' },

  trHeaderSeccion: { background: '#ECE4D2', borderTop: '2px solid #D8CDB6', borderBottom: '2px solid #D8CDB6' },
  tdHeaderL: { textAlign: 'left', padding: '9px 12px', color: COLOR.oscuro, fontWeight: '800' },
  tdHeaderR: { textAlign: 'right', padding: '9px 12px', color: COLOR.oscuro, fontWeight: '800' },

  trPar: { background: '#FFFFFF' },
  trImpar: { background: '#FAF6ED' },
};

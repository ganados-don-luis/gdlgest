import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

const CAMPANA = '2025-2026';

const UDN = [
  { key: 'agricultura',     label: 'AGRICULTURA' },
  { key: 'granja_cerdos',   label: 'GRANJA CERDOS' },
  { key: 'serv_transporte', label: 'SERV. TRANSPORTE' },
  { key: 'serv_agricolas',  label: 'SERV. AGRÍCOLAS' },
];

const TODAS_COLUMNAS = [
  { key: 'sin_nombre' },
  { key: 'administracion' },
  { key: 'agricultura' },
  { key: 'ecopar' },
  { key: 'general' },
  { key: 'granja_cerdos' },
  { key: 'imp_servicios' },
  { key: 'serv_transporte' },
  { key: 'serv_agricolas' },
  { key: 'total' },
];

const MESES_CAMPANA = [
  { key: '2025-06', label: 'Jun 2025' },
  { key: '2025-07', label: 'Jul 2025' },
  { key: '2025-08', label: 'Ago 2025' },
  { key: '2025-09', label: 'Sep 2025' },
  { key: '2025-10', label: 'Oct 2025' },
  { key: '2025-11', label: 'Nov 2025' },
  { key: '2025-12', label: 'Dic 2025' },
  { key: '2026-01', label: 'Ene 2026' },
  { key: '2026-02', label: 'Feb 2026' },
  { key: '2026-03', label: 'Mar 2026' },
  { key: '2026-04', label: 'Abr 2026' },
  { key: '2026-05', label: 'May 2026' },
];

const fmt = (v) => {
  if (!v || v === 0) return '—';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(v));
};

const mapColHeaders = (headers) => {
  const map = {};
  const norm = (s) => String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  headers.forEach((h, i) => {
    const n = norm(h);
    if (n === '' && i === 1) map['sin_nombre'] = i;
    else if (n.includes('ADMINISTRACION')) map['administracion'] = i;
    else if (n === 'AGRICULTURA') map['agricultura'] = i;
    else if (n === 'ECOPAR') map['ecopar'] = i;
    else if (n === 'GENERAL') map['general'] = i;
    else if (n.includes('GRANJA')) map['granja_cerdos'] = i;
    else if (n.includes('IMP') && n.includes('SERV')) map['imp_servicios'] = i;
    else if (n.includes('TRANSPORTE')) map['serv_transporte'] = i;
    else if (n.includes('AGRICOLA')) map['serv_agricolas'] = i;
  });
  map['total'] = headers.length - 1;
  return map;
};

// Determinar UdN destino por código de cuenta
const getUdnPorCodigo = (codigo, reglas) => {
  // Primero: cuentas específicas (6 dígitos)
  if (reglas[codigo]) return reglas[codigo];

  // Rango 431xxx especial
  const num = parseInt(codigo);
  if (num >= 431100 && num <= 431115) return { criterio: 'prefijo_directo', udn_destino: 'serv_transporte' };
  if (num >= 431201 && num <= 431210) return { criterio: 'prefijo_directo', udn_destino: 'serv_agricolas' };

  // Prefijos de 3 dígitos
  const prefijos = ['516', '520', '480', '471', '461', '451', '441',
    '515', '514', '513', '512', '511', '423', '422', '421',
    '414', '413', '412', '411'];
  for (const p of prefijos) {
    if (codigo.startsWith(p) && reglas[p]) return reglas[p];
  }

  return null;
};

export default function EERR() {
  const [tab, setTab] = useState('importar');
  const [mesesCargados, setMesesCargados] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [reglas, setReglas] = useState({});
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Flujo revisión cuentas nuevas
  const [etapa, setEtapa] = useState('idle');
  const [cuentasPendientes, setCuentasPendientes] = useState([]);
  const [cuentaActual, setCuentaActual] = useState(0);
  const [decisionesTemp, setDecisionesTemp] = useState({});
  const [datosMes, setDatosMes] = useState(null);
  const [mesActual, setMesActual] = useState('');
  const [nombreArchivoActual, setNombreArchivoActual] = useState('');

  // Filtros visualización
  const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
  const [vistaDetalle, setVistaDetalle] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [ocultarCeros, setOcultarCeros] = useState(true);
  const [seleccionPrevia, setSeleccionPrevia] = useState([]);

  // Ingresos campaña completa para prorrateo
  const [ingCampana, setIngCampana] = useState({});
  const [archivos, setArchivos] = useState([]);

  useEffect(() => { cargarMeses(); cargarReglas(); cargarArchivos(); }, []);

  const cargarArchivos = async () => {
    const { data } = await supabase
      .from('archivos_importados')
      .select('*')
      .eq('campana', CAMPANA)
      .order('importado_at', { ascending: false });
    if (data) setArchivos(data);
  };

  const eliminarArchivo = async (archivo) => {
    if (!window.confirm(`¿Eliminar ${archivo.nombre_archivo} y todos sus datos?`)) return;
    await supabase.from('balance_mensual')
      .delete()
      .eq('campana', CAMPANA)
      .eq('mes', archivo.mes);
    await supabase.from('archivos_importados')
      .delete()
      .eq('id', archivo.id);
    cargarArchivos();
    cargarMeses();
    cargarIngCampana();
    setRegistros([]);
    setMesesSeleccionados(prev => prev.filter(m => m !== archivo.mes));
  };

  const cargarMeses = async () => {
    const { data } = await supabase
      .from('balance_mensual').select('mes')
      .eq('campana', CAMPANA).order('mes');
    if (data) setMesesCargados([...new Set(data.map(d => d.mes))]);
  };

  const cargarReglas = async () => {
    const { data } = await supabase.from('reglas_cuentas').select('*');
    if (data) {
      const mapa = {};
      data.forEach(r => { mapa[r.cuenta_codigo] = r; });
      setReglas(mapa);
    }
  };

  // Cargar ingresos directos campaña completa para prorrateo
  const cargarIngCampana = useCallback(async () => {
    const { data } = await supabase
      .from('balance_mensual').select('*')
      .eq('campana', CAMPANA).eq('tipo', 'INGRESO');
    if (!data || !Object.keys(reglas).length) return;

    const totales = { agricultura: 0, granja_cerdos: 0, serv_transporte: 0, serv_agricolas: 0 };
    data.forEach(r => {
      const regla = getUdnPorCodigo(r.cuenta_codigo, reglas);
      if (regla && (regla.criterio === 'prefijo_directo' || regla.criterio === 'directo')) {
        const udn = regla.udn_destino;
        if (udn && totales[udn] !== undefined) {
          const totalFila = TODAS_COLUMNAS.reduce((s, c) => s + Math.abs(r[c.key] || 0), 0);
          totales[udn] += totalFila;
        }
      }
    });
    setIngCampana(totales);
  }, [reglas]);

  useEffect(() => {
    if (Object.keys(reglas).length > 0) cargarIngCampana();
  }, [reglas, cargarIngCampana]);

const cargarRegistros = useCallback(async () => {
    if (mesesSeleccionados.length === 0) { setRegistros([]); return; }
    setCargando(true);

    // Supabase pagina de a 1000 — necesitamos traer todo
    let allData = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('balance_mensual').select('*')
        .eq('campana', CAMPANA)
        .in('mes', mesesSeleccionados)
        .order('cuenta_codigo')
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }

    setRegistros(allData);
    setCargando(false);
  }, [mesesSeleccionados]);
  
  useEffect(() => {
    if (tab === 'visualizar') cargarRegistros();
  }, [tab, cargarRegistros]);

  // ── IMPORTAR ──────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setMsg('');

    const nombreLimpio = file.name.replace(/\.[^.]+$/, '');
    const matchMes = nombreLimpio.match(/(\d{4})[_-](\d{2})/);
    if (!matchMes) {
      setError('No se detectó el mes. Usá formato: Balance_por_Sector_2025_06_usd.xls');
      return;
    }
    const mes = `${matchMes[1]}-${matchMes[2]}`;
    setNombreArchivoActual(file.name);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const headers = data[1] || [];
        const colMap = mapColHeaders(headers);
        const rows = data.slice(2, data.length - 1)
          .filter(r => r[0] && String(r[0]).trim() !== '');

        const cuentasProcesadas = [];
        rows.forEach(r => {
          const raw = String(r[0]).trim();
          const codigo = raw.match(/^(\d+)/)?.[1] || '';
          const desc = raw.replace(/^\d+\s*/, '').trim();
          const tipo = codigo.startsWith('5') ? 'INGRESO'
            : codigo.startsWith('4') ? 'GASTO' : null;
          if (!tipo) return;

          const reg = {
            campana: CAMPANA, mes,
            fecha_periodo: `${matchMes[1]}-${matchMes[2]}-01`,
            cuenta_codigo: codigo, cuenta_desc: desc, tipo,
          };
          TODAS_COLUMNAS.forEach(col => {
            const idx = colMap[col.key];
            reg[col.key] = idx !== undefined ? (parseFloat(r[idx]) || 0) : 0;
          });
          cuentasProcesadas.push(reg);
        });

        // Detectar cuentas nuevas sin regla
        const codigosConRegla = new Set(Object.keys(reglas));
        const nuevasSinRegla = cuentasProcesadas.filter(c => {
          const num = parseInt(c.cuenta_codigo);
          const tieneRangoEspecial =
            (num >= 431100 && num <= 431115) ||
            (num >= 431201 && num <= 431210);
          if (tieneRangoEspecial) return false;
          const tienePrefijoRegla = ['411','412','413','414','421','422','423',
            '441','451','461','471','480','511','512','513','514','515','516','520']
            .some(p => c.cuenta_codigo.startsWith(p));
          if (tienePrefijoRegla) return false;
          return !codigosConRegla.has(c.cuenta_codigo);
        });

        setDatosMes(cuentasProcesadas);
        setMesActual(mes);

        if (nuevasSinRegla.length > 0) {
          setCuentasPendientes(nuevasSinRegla);
          setCuentaActual(0);
          setDecisionesTemp({});
          setEtapa('revisando');
        } else {
          await guardarMes(cuentasProcesadas, mes, file.name);
        }
      } catch (err) {
        setError('Error al leer el archivo.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const guardarMes = async (datos, mes, nombreArchivo) => {
    setEtapa('guardando');
    await supabase.from('balance_mensual')
      .delete()
      .eq('campana', CAMPANA)
      .eq('mes', mes);
    const { error: err } = await supabase
      .from('balance_mensual')
      .insert(datos);
    if (err) setError('Error al guardar: ' + err.message);
    else {
      const nombreFinal = nombreArchivo || nombreArchivoActual || mes;
      setMsg(`✓ ${nombreFinal} — ${MESES_CAMPANA.find(m => m.key === mes)?.label || mes} — ${datos.length} cuentas guardadas`);
      await supabase.from('archivos_importados').upsert({
        campana: CAMPANA,
        mes,
        nombre_archivo: nombreFinal,
        importado_at: new Date().toISOString(),
      }, { onConflict: 'campana,mes' });
      cargarMeses();
      cargarArchivos();
      cargarIngCampana();
    }
    setEtapa('idle');
  };

  const avanzarCuenta = async () => {
    const cuenta = cuentasPendientes[cuentaActual];
    const decision = decisionesTemp[cuenta.cuenta_codigo];
    if (!decision) { setError('Definí el criterio antes de continuar.'); return; }
    setError('');

    await supabase.from('reglas_cuentas').upsert({
      cuenta_codigo: cuenta.cuenta_codigo,
      cuenta_desc: cuenta.cuenta_desc,
      criterio: decision.criterio,
      udn_destino: decision.udn_destino || null,
      nota: decision.nota || null,
    }, { onConflict: 'cuenta_codigo' });

    await cargarReglas();

    if (cuentaActual < cuentasPendientes.length - 1) {
      setCuentaActual(prev => prev + 1);
    } else {
      await guardarMes(datosMes, mesActual, nombreArchivoActual);
      setCuentasPendientes([]);
      setCuentaActual(0);
    }
  };

  // ── APLICAR REGLAS ────────────────────────────────
const aplicarReglas = useCallback((datos) => {
    const totalIngCampana = Object.values(ingCampana).reduce((s, v) => s + v, 0);

    return datos.map(d => {
      const regla = getUdnPorCodigo(d.cuenta_codigo, reglas);
      const resultado = {
        ...d,
        _criterio: regla?.criterio || 'sin regla',
        _nota: regla?.nota || '',
      };

      // Reset todas las UdN a 0 antes de redistribuir
      UDN.forEach(u => { resultado[u.key] = 0; });

      if (!regla) return resultado;

      if (regla.criterio === 'prefijo_directo' || regla.criterio === 'directo') {
        const udn = regla.udn_destino;
        if (udn) {
          // Asignar el total completo de la cuenta a la UdN destino
          resultado[udn] = d.total || 0;
        }

      } else if (regla.criterio === 'prefijo_prorrateo' || regla.criterio === 'prorrateo') {
        if (totalIngCampana > 0) {
          UDN.forEach(u => {
            const prop = (ingCampana[u.key] || 0) / totalIngCampana;
            resultado[u.key] = (d.total || 0) * prop;
          });
        }

      } else if (regla.criterio === 'excluir') {
        // Ya reseteado — queda todo en 0
      }

      return resultado;
    });
  }, [reglas, ingCampana]);

  // ── CONSOLIDAR ────────────────────────────────────
const consolidar = useCallback(() => {
    const mapa = {};
    registros.forEach(r => {
      const k = r.cuenta_codigo;
      if (!mapa[k]) mapa[k] = { ...r };
      else TODAS_COLUMNAS.forEach(col => {
        mapa[k][col.key] = (mapa[k][col.key] || 0) + (r[col.key] || 0);
      });
    });
    const cuenta515 = Object.values(mapa).find(c => c.cuenta_codigo === '515101');
    console.log('515101 acumulado:', cuenta515?.total, '| serv_transporte:', cuenta515?.serv_transporte, '| meses en registros:', [...new Set(registros.map(r => r.mes))]);
    const resultado = aplicarReglas(Object.values(mapa));
    const totalBruto = Object.values(mapa).reduce((s, c) => s + (c.total || 0), 0);
    const totalIngRaw = Object.values(mapa).filter(c => c.tipo === 'INGRESO').reduce((s, c) => s + (c.total || 0), 0);
    const totalGstRaw = Object.values(mapa).filter(c => c.tipo === 'GASTO').reduce((s, c) => s + (c.total || 0), 0);
    console.log('--- DIAGNÓSTICO ---');
    console.log('Total bruto (suma columna total):', totalBruto);
    console.log('Total ingresos raw:', totalIngRaw);
    console.log('Total gastos raw:', totalGstRaw);
    console.log('Resultado esperado (ing negativo - gastos):', -totalIngRaw - totalGstRaw);
    console.log('ingCampana:', JSON.stringify(ingCampana));
    console.log('Cuentas sin regla:', resultado.filter(c => c._criterio === 'sin regla').map(c => c.cuenta_codigo));
    return resultado;
  }, [registros, aplicarReglas, ingCampana]);
  const datosRaw = consolidar();
  const datos = ocultarCeros
    ? datosRaw.filter(d => UDN.some(u => (d[u.key] || 0) !== 0))
    : datosRaw;
  const ingresos = datos.filter(d => d.tipo === 'INGRESO');
  const gastos = datos.filter(d => d.tipo === 'GASTO');
  const totalUdn = (tipo, udnKey) =>
    datos.filter(d => d.tipo === tipo).reduce((s, d) => s + (d[udnKey] || 0), 0);

  // ── SELECTOR MESES ────────────────────────────────
  const onMesMouseDown = (mesKey) => {
    setDragging(true);
    setDragStart(mesKey);
    setSeleccionPrevia(mesesSeleccionados);
  };
  const onMesMouseEnter = (mesKey) => {
    if (!dragging || !dragStart) return;
    const idxStart = MESES_CAMPANA.findIndex(m => m.key === dragStart);
    const idxEnd = MESES_CAMPANA.findIndex(m => m.key === mesKey);
    const [from, to] = idxStart < idxEnd ? [idxStart, idxEnd] : [idxEnd, idxStart];
    const rango = MESES_CAMPANA.slice(from, to + 1).map(m => m.key);
    // Combinar selección previa con el rango nuevo sin duplicados
    const combinado = [...new Set([...seleccionPrevia, ...rango])];
    setMesesSeleccionados(combinado);
  };

  const toggleMes = (mesKey) => {
    if (dragging) return;
    setMesesSeleccionados(prev =>
      prev.includes(mesKey) ? prev.filter(m => m !== mesKey) : [...prev, mesKey]
    );
  };

  const cuentaEnRevision = cuentasPendientes[cuentaActual];
  const decisionActual = cuentaEnRevision
    ? (decisionesTemp[cuentaEnRevision.cuenta_codigo] || {}) : {};

  return (
    <div style={s.container} onMouseUp={() => setDragging(false)}>
      {/* HEADER */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>Ganados Don Luis S.A.</div>
          <div style={s.headerSub}>Estado de Resultados · Campaña {CAMPANA}</div>
        </div>
        <div style={s.mesesBadges}>
          {mesesCargados.map(m => (
            <span key={m} style={s.mesBadge}>
              {MESES_CAMPANA.find(mc => mc.key === m)?.label || m}
            </span>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={s.tabs}>
        {[
          { key: 'importar', label: '📂 Importar' },
          { key: 'visualizar', label: '📊 Visualizar' },
          { key: 'reglas', label: '⚙️ Reglas' },
        ].map(t => (
          <button key={t.key}
            style={tab === t.key ? s.tabActive : s.tab}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {/* ── TAB IMPORTAR ── */}
        {tab === 'importar' && etapa === 'idle' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Importar Balance por Sector mensual</div>
            <div style={s.cardSub}>
              Formato esperado: <strong>Balance_por_Sector_2025_06_usd.xls</strong><br />
              Si hay cuentas nuevas sin regla definida, el sistema te pedirá clasificarlas antes de guardar.
            </div>
            <input type="file" accept=".xls,.xlsx" onChange={handleFile}
              style={{ display: 'none' }} id="file-input" />
            <label htmlFor="file-input" style={s.btn}>
              Seleccionar archivo XLS
            </label>
            {msg && <div style={s.msgOk}>{msg}</div>}
            {error && <div style={s.msgError}>{error}</div>}

            {mesesCargados.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={s.subTitle}>Estado campaña {CAMPANA}</div>
                <div style={s.mesesGrid}>
                  {MESES_CAMPANA.map(m => {
                    const ok = mesesCargados.includes(m.key);
                    return (
                      <div key={m.key} style={ok ? s.mesOk : s.mesPendiente}>
                        <span>{ok ? '✓' : '·'}</span> {m.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {archivos.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={s.subTitle}>Archivos importados</div>
                <div style={s.archivosList}>
                  {archivos.map(a => (
                    <div key={a.id} style={s.archivoItem}>
                      <span style={s.archivoIcon}>📄</span>
                      <span style={s.archivoNombre}>{a.nombre_archivo}</span>
                      <span style={s.archivoMes}>
                        {MESES_CAMPANA.find(m => m.key === a.mes)?.label || a.mes}
                      </span>
                      <button
                        style={s.archivoEliminar}
                        onClick={() => eliminarArchivo(a)}
                        title="Eliminar archivo y sus datos">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FLUJO REVISIÓN ── */}
        {tab === 'importar' && etapa === 'revisando' && cuentaEnRevision && (
          <div style={s.card}>
            <div style={s.cardTitle}>
              Cuenta nueva sin regla — {cuentaActual + 1} de {cuentasPendientes.length}
            </div>
            <div style={s.progreso}>
              <div style={{ ...s.progresoBar, width: `${(cuentaActual / cuentasPendientes.length) * 100}%` }} />
            </div>

            <div style={s.cuentaBox}>
              <div style={s.cuentaCod}>{cuentaEnRevision.cuenta_codigo}</div>
              <div style={s.cuentaDesc}>{cuentaEnRevision.cuenta_desc}</div>
              <div style={s.cuentaTipo}>{cuentaEnRevision.tipo}</div>
              <div style={s.saldosGrid}>
                {TODAS_COLUMNAS.filter(col =>
                  col.key !== 'total' && (cuentaEnRevision[col.key] || 0) !== 0
                ).map(col => (
                  <div key={col.key} style={s.saldoChip}>
                    <div style={s.saldoLabel}>{col.key.replace('_', ' ').toUpperCase()}</div>
                    <div style={s.saldoVal}>{fmt(cuentaEnRevision[col.key])}</div>
                  </div>
                ))}
                <div style={{ ...s.saldoChip, background: '#1C1008', color: '#E6B84A' }}>
                  <div style={s.saldoLabel}>TOTAL</div>
                  <div style={s.saldoVal}>{fmt(cuentaEnRevision.total)}</div>
                </div>
              </div>
            </div>

            <div style={s.subTitle}>¿A dónde va esta cuenta?</div>
            <div style={s.opcionesGrid}>
              {UDN.map(udn => (
                <button key={udn.key}
                  style={decisionActual.criterio === 'directo' && decisionActual.udn_destino === udn.key
                    ? s.opcionActive : s.opcion}
                  onClick={() => setDecisionesTemp(prev => ({
                    ...prev,
                    [cuentaEnRevision.cuenta_codigo]: {
                      criterio: 'directo',
                      udn_destino: udn.key,
                      nota: `Asignación directa → ${udn.label}`
                    }
                  }))}>
                  → {udn.label}
                </button>
              ))}
              <button
                style={decisionActual.criterio === 'prorrateo' ? s.opcionActive : s.opcion}
                onClick={() => setDecisionesTemp(prev => ({
                  ...prev,
                  [cuentaEnRevision.cuenta_codigo]: {
                    criterio: 'prorrateo',
                    udn_destino: null,
                    nota: 'Prorrateo por ingresos campaña completa'
                  }
                }))}>
                ÷ Prorratear
              </button>
              <button
                style={decisionActual.criterio === 'excluir' ? s.opcionActive : s.opcion}
                onClick={() => setDecisionesTemp(prev => ({
                  ...prev,
                  [cuentaEnRevision.cuenta_codigo]: {
                    criterio: 'excluir',
                    udn_destino: null,
                    nota: 'Excluido del EERR'
                  }
                }))}>
                ✕ Excluir
              </button>
            </div>

            <input
              style={s.notaInput}
              placeholder="Nota opcional..."
              value={decisionActual.nota || ''}
              onChange={e => setDecisionesTemp(prev => ({
                ...prev,
                [cuentaEnRevision.cuenta_codigo]: { ...decisionActual, nota: e.target.value }
              }))}
            />

            {error && <div style={s.msgError}>{error}</div>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button style={s.btn} onClick={avanzarCuenta}>
                {cuentaActual < cuentasPendientes.length - 1
                  ? 'Guardar y continuar →'
                  : 'Guardar e importar ✓'}
              </button>
              {cuentaActual > 0 && (
                <button style={s.btnSec}
                  onClick={() => setCuentaActual(prev => prev - 1)}>
                  ← Volver
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'importar' && etapa === 'guardando' && (
          <div style={s.card}>
            <div style={s.loading}>Guardando en Supabase...</div>
          </div>
        )}

        {/* ── TAB VISUALIZAR ── */}
        {tab === 'visualizar' && (
          <>
<div style={s.selectorBar}>
              <div style={s.selectorLeft}>
                <span style={s.selectorLabel}>PERÍODO</span>
                <div style={s.mesesSelector} onMouseLeave={() => setDragging(false)}>
                  {MESES_CAMPANA.map(m => {
                    const disponible = mesesCargados.includes(m.key);
                    const sel = mesesSeleccionados.includes(m.key);
                    return (
                      <div key={m.key}
                        style={!disponible ? s.mesNA : sel ? s.mesSelActive : s.mesSel}
                        onMouseDown={disponible ? () => onMesMouseDown(m.key) : undefined}
                        onMouseEnter={disponible ? () => onMesMouseEnter(m.key) : undefined}
                        onMouseUp={disponible ? () => setDragging(false) : undefined}
                        onClick={disponible ? () => toggleMes(m.key) : undefined}>
                        {m.label.replace(' 20', "'")}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={s.selectorRight}>
                <div style={s.selectorActions}>
                  <button style={s.btnMini} onClick={() => setMesesSeleccionados([...mesesCargados])}>Todos</button>
                  <button style={s.btnMini} onClick={() => setMesesSeleccionados([])}>Ninguno</button>
                  <span style={s.selectorCount}>
                    {mesesSeleccionados.length > 0
                      ? `${mesesSeleccionados.length} mes${mesesSeleccionados.length !== 1 ? 'es' : ''}`
                      : 'Sin selección'}
                  </span>
                </div>
                <div style={s.filtrosExtra}>
                  <label style={s.checkLabel}>
                    <input type="checkbox" checked={ocultarCeros}
                      onChange={e => setOcultarCeros(e.target.checked)}
                      style={{ marginRight: '5px' }} />
                    Ocultar filas en cero
                  </label>
                  <div style={s.vistaBtns}>
                    <button style={vistaDetalle ? s.vistaActive : s.vistaBtn}
                      onClick={() => setVistaDetalle(true)}>Detalle</button>
                    <button style={!vistaDetalle ? s.vistaActive : s.vistaBtn}
                      onClick={() => setVistaDetalle(false)}>Rubro</button>
                  </div>
                </div>
              </div>
            </div>

            {mesesSeleccionados.length === 0 ? (
              <div style={s.empty}>Seleccioná al menos un mes para ver el estado de resultados.</div>
            ) : cargando ? (
              <div style={s.loading}>Cargando...</div>
            ) : (
              <>

                <div style={s.tableCard}>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.thCuenta}>Cuenta</th>
                          {UDN.map(u => <th key={u.key} style={s.th}>{u.label}</th>)}
                          <th style={s.th}>TOTAL</th>
                          <th style={s.thCriterio}>Criterio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* INGRESOS */}
                        <tr><td colSpan={7} style={s.seccion}>INGRESOS</td></tr>
                        {vistaDetalle ? (
                          ingresos.map((c, i) => (
                            <tr key={c.cuenta_codigo}
                              style={{ background: i % 2 === 0 ? '#FFF' : '#F6F1E7' }}>
                              <td style={s.tdCuenta}>
                                <span style={s.cod}>{c.cuenta_codigo}</span> {c.cuenta_desc}
                              </td>
                              {UDN.map(u => (
                                <td key={u.key} style={s.tdNum}>{fmt(c[u.key])}</td>
                              ))}
                              <td style={s.tdNum}>{fmt(c.total)}</td>
                              <td style={s.tdCriterio}>
                                {c._criterio === 'prefijo_directo' || c._criterio === 'directo'
                                  ? '→ directa'
                                  : c._criterio === 'prefijo_prorrateo' || c._criterio === 'prorrateo'
                                  ? '÷ prorrateo'
                                  : c._criterio === 'excluir' ? '✕ excluido'
                                  : '⚠ sin regla'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr style={{ background: '#F6F1E7' }}>
                            <td style={s.tdCuenta}>Subtotal ingresos</td>
                            {UDN.map(u => (
                              <td key={u.key} style={s.tdNum}>{fmt(totalUdn('INGRESO', u.key))}</td>
                            ))}
                            <td style={s.tdNum}>{fmt(ingresos.reduce((s, d) => s + (d.total || 0), 0))}</td>
                            <td style={s.tdCriterio}></td>
                          </tr>
                        )}
                        <tr style={s.totalRow}>
                          <td style={s.tdTotal}>TOTAL INGRESOS</td>
                          {UDN.map(u => (
                            <td key={u.key} style={s.tdTotalNum}>{fmt(totalUdn('INGRESO', u.key))}</td>
                          ))}
                          <td style={s.tdTotalNum}>
                            {fmt(ingresos.reduce((s, d) => s + (d.total || 0), 0))}
                          </td>
                          <td style={s.tdCriterio}></td>
                        </tr>

                        {/* GASTOS */}
                        <tr><td colSpan={7} style={s.seccion}>GASTOS</td></tr>
                        {vistaDetalle ? (
                          gastos.map((c, i) => (
                            <tr key={c.cuenta_codigo}
                              style={{ background: i % 2 === 0 ? '#FFF' : '#F6F1E7' }}>
                              <td style={s.tdCuenta}>
                                <span style={s.cod}>{c.cuenta_codigo}</span> {c.cuenta_desc}
                              </td>
                              {UDN.map(u => (
                                <td key={u.key} style={s.tdNum}>{fmt(c[u.key])}</td>
                              ))}
                              <td style={s.tdNum}>{fmt(c.total)}</td>
                              <td style={s.tdCriterio}>
                                {c._criterio === 'prefijo_directo' || c._criterio === 'directo'
                                  ? '→ directa'
                                  : c._criterio === 'prefijo_prorrateo' || c._criterio === 'prorrateo'
                                  ? '÷ prorrateo'
                                  : c._criterio === 'excluir' ? '✕ excluido'
                                  : '⚠ sin regla'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <>
{[
                            { label: 'Gastos directos ganaderos (411–414)', prefijos: ['411','412','413','414'], rango: null },
                            { label: 'Gastos directos agrícolas (421–423)', prefijos: ['421','422','423'], rango: null },
                            { label: 'Serv. Transporte — gastos directos', prefijos: [], rango: [431100, 431115] },
                            { label: 'Serv. Agrícolas — gastos directos', prefijos: [], rango: [431201, 431210] },
                            { label: 'Gastos de estructura (441)', prefijos: ['441'], rango: null },
                            { label: 'Administración (451)', prefijos: ['451'], rango: null },
                            { label: 'Financieros (461, 480)', prefijos: ['461','480'], rango: null },
                            { label: 'Impuestos y tasas (471)', prefijos: ['471'], rango: null },
                          ].map((rubro, i) => {
                            const cuentasRubro = gastos.filter(c => {
                              const num = parseInt(c.cuenta_codigo);
                              if (rubro.rango) {
                                return num >= rubro.rango[0] && num <= rubro.rango[1];
                              }
                              return rubro.prefijos.some(p => c.cuenta_codigo.startsWith(p));
                            });                              if (cuentasRubro.length === 0) return null;
                              return (
                                <tr key={rubro.label}
                                  style={{ background: i % 2 === 0 ? '#FFF' : '#F6F1E7' }}>
                                  <td style={s.tdCuenta}>{rubro.label}</td>
                                  {UDN.map(u => (
                                    <td key={u.key} style={s.tdNum}>
                                      {fmt(cuentasRubro.reduce((s, c) => s + (c[u.key] || 0), 0))}
                                    </td>
                                  ))}
                                  <td style={s.tdNum}>
                                    {fmt(cuentasRubro.reduce((s, c) => s + (c.total || 0), 0))}
                                  </td>
                                  <td style={s.tdCriterio}></td>
                                </tr>
                              );
                            })}
                          </>
                        )}
                        <tr style={s.totalRow}>
                          <td style={s.tdTotal}>TOTAL GASTOS</td>
                          {UDN.map(u => (
                            <td key={u.key} style={s.tdTotalNum}>{fmt(totalUdn('GASTO', u.key))}</td>
                          ))}
                          <td style={s.tdTotalNum}>
                            {fmt(gastos.reduce((s, d) => s + (d.total || 0), 0))}
                          </td>
                          <td style={s.tdCriterio}></td>
                        </tr>

{/* RESULTADO */}
                        <tr style={s.resultadoRow}>
                          <td style={s.tdResultado}>RESULTADO</td>
                          {UDN.map(u => {
                            const ing = -totalUdn('INGRESO', u.key);
                            const gst = totalUdn('GASTO', u.key);
                            const r = ing - gst;
                            return (
                              <td key={u.key} style={{
                                ...s.tdResultadoNum,
                                color: r >= 0 ? '#A8CC90' : '#F09595'
                              }}>
                                {fmt(r)}
                              </td>
                            );
                          })}
                          {(() => {
                            const totalIng = -UDN.reduce((s, u) => s + totalUdn('INGRESO', u.key), 0);
                            const totalGst = UDN.reduce((s, u) => s + totalUdn('GASTO', u.key), 0);
                            const totalR = totalIng - totalGst;
                            return (
                              <td style={{
                                ...s.tdResultadoNum,
                                color: totalR >= 0 ? '#A8CC90' : '#F09595',
                                borderLeft: '1px solid rgba(255,255,255,0.15)'
                              }}>
                                {fmt(totalR)}
                              </td>
                            );
                          })()}
                          <td style={s.tdCriterio}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── TAB REGLAS ── */}
        {tab === 'reglas' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Reglas de imputación</div>
            <div style={s.cardSub}>
              Se aplican automáticamente al visualizar. Las reglas por prefijo cubren todos los códigos que empiecen con esos 3 dígitos.
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thCuenta}>Código / Prefijo</th>
                    <th style={s.th}>Descripción</th>
                    <th style={s.th}>Criterio</th>
                    <th style={s.th}>UdN destino</th>
                    <th style={s.th}>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(reglas)
                    .sort((a, b) => a.cuenta_codigo.localeCompare(b.cuenta_codigo))
                    .map((r, i) => (
                      <tr key={r.cuenta_codigo}
                        style={{ background: i % 2 === 0 ? '#FFF' : '#F6F1E7' }}>
                        <td style={s.tdCuenta}>
                          <span style={s.cod}>{r.cuenta_codigo}</span>
                          {r.cuenta_codigo.length <= 3 && (
                            <span style={s.prefijoBadge}>prefijo</span>
                          )}
                        </td>
                        <td style={s.tdCuenta}>{r.cuenta_desc}</td>
                        <td style={s.tdNum}>
                          {r.criterio.includes('directo') ? '→ directa'
                            : r.criterio.includes('prorrateo') ? '÷ prorrateo'
                            : '✕ excluir'}
                        </td>
                        <td style={s.tdNum}>
                          {UDN.find(u => u.key === r.udn_destino)?.label || '—'}
                        </td>
                        <td style={{ ...s.tdCuenta, fontSize: '11px', color: '#8E7E62' }}>
                          {r.nota || '—'}
                        </td>
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
  container: { minHeight: '100vh', background: '#F2EDD8', fontFamily: 'Arial, sans-serif', userSelect: 'none' },
  header: { background: '#1C1008', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
  headerTitle: { fontSize: '16px', fontWeight: '700', color: '#E6B84A', fontFamily: 'Georgia, serif' },
  headerSub: { fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' },
  mesesBadges: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  mesBadge: { fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(62,110,52,0.5)', color: '#A8CC90', fontWeight: '700' },
  tabs: { background: '#2D1F0A', display: 'flex' },
  tab: { padding: '10px 24px', fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  tabActive: { padding: '10px 24px', fontSize: '13px', fontWeight: '700', color: '#E6B84A', background: 'none', border: 'none', borderBottom: '2px solid #C8952A', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  content: { padding: '24px 28px' },
  card: { background: '#FFFFFF', border: '1px solid #D6D0C4', borderRadius: '10px', padding: '24px 28px', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: '700', color: '#1C1008', marginBottom: '8px' },
  cardSub: { fontSize: '12px', color: '#5E4E36', marginBottom: '16px', lineHeight: '1.7' },
  btn: { display: 'inline-block', padding: '10px 20px', background: '#3E6E34', color: '#FFF', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none', fontFamily: 'Arial, sans-serif' },
  btnSec: { padding: '10px 20px', background: '#F0EDE4', color: '#5E4E36', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: '1px solid #D6D0C4', fontFamily: 'Arial, sans-serif' },
  btnChico: { padding: '4px 10px', fontSize: '11px', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '5px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  msgOk: { marginTop: '12px', padding: '10px 14px', background: '#EAF3DE', color: '#274F22', borderRadius: '6px', fontSize: '13px', fontWeight: '600' },
  msgError: { marginTop: '12px', padding: '10px 14px', background: '#FDEAEA', color: '#7A1A1A', borderRadius: '6px', fontSize: '13px' },
  subTitle: { fontSize: '11px', fontWeight: '700', color: '#5E4E36', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' },
  mesesGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' },
  mesOk: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: '#EAF3DE', color: '#274F22', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
  mesPendiente: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: '#F0EDE4', color: '#9B8B72', borderRadius: '6px', fontSize: '12px' },
  progreso: { height: '4px', background: '#E6DEC8', borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' },
  progresoBar: { height: '100%', background: '#3E6E34', borderRadius: '2px', transition: 'width 0.3s' },
  cuentaBox: { background: '#F6F1E7', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' },
  cuentaCod: { fontSize: '11px', color: '#8E7E62', fontWeight: '700', letterSpacing: '0.06em', marginBottom: '4px' },
  cuentaDesc: { fontSize: '18px', fontWeight: '700', color: '#1C1008', marginBottom: '4px', fontFamily: 'Georgia, serif' },
  cuentaTipo: { fontSize: '11px', color: '#5E4E36', marginBottom: '12px' },
  saldosGrid: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  saldoChip: { padding: '8px 12px', background: '#FEF0E0', border: '1px solid #E8BF80', borderRadius: '6px', minWidth: '90px' },
  saldoLabel: { fontSize: '9px', color: '#8E7E62', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' },
  saldoVal: { fontSize: '13px', fontWeight: '700', color: '#1C1008', fontVariantNumeric: 'tabular-nums' },
  opcionesGrid: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' },
  opcion: { padding: '8px 16px', fontSize: '13px', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontWeight: '600' },
  opcionActive: { padding: '8px 16px', fontSize: '13px', background: '#1A3317', color: '#A8CC90', border: '1px solid #3E6E34', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Arial, sans-serif', fontWeight: '700' },
  notaInput: { width: '100%', padding: '8px 12px', fontSize: '12px', border: '1px solid #D6D0C4', borderRadius: '6px', fontFamily: 'Arial, sans-serif', background: '#F6F1E7', color: '#1C1008', marginBottom: '4px' },
  mesesSelector: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  mesSel: { padding: '8px 14px', fontSize: '12px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' },
  mesSelActive: { padding: '8px 14px', fontSize: '12px', fontWeight: '700', background: '#1A3317', color: '#A8CC90', border: '1px solid #3E6E34', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' },
  mesNA: { padding: '8px 14px', fontSize: '12px', background: '#F6F1E7', color: '#C4B89A', border: '1px dashed #D6D0C4', borderRadius: '6px', cursor: 'not-allowed', userSelect: 'none' },
  filtroBtn: { padding: '6px 14px', fontSize: '12px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  filtroBtnActive: { padding: '6px 14px', fontSize: '12px', fontWeight: '700', background: '#3E6E34', color: '#FFF', border: '1px solid #3E6E34', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  tableCard: { background: '#FFF', border: '1px solid #D6D0C4', borderRadius: '10px', overflow: 'hidden' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
  thCuenta: { background: '#1C1008', color: '#FFF', padding: '8px 12px', textAlign: 'left', fontSize: '10px', letterSpacing: '0.05em', whiteSpace: 'nowrap', position: 'sticky', left: 0 },
  th: { background: '#1C1008', color: '#FFF', padding: '8px 12px', textAlign: 'right', fontSize: '10px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  thCriterio: { background: '#1C1008', color: 'rgba(255,255,255,0.4)', padding: '8px 12px', textAlign: 'left', fontSize: '9px', whiteSpace: 'nowrap' },
  seccion: { background: '#4A3520', color: '#E6B84A', padding: '5px 12px', fontWeight: '700', fontSize: '10px', letterSpacing: '0.08em' },
  tdCuenta: { padding: '5px 12px', borderBottom: '1px solid #E6DEC8', color: '#2A1E10', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'inherit' },
  cod: { color: '#8E7E62', fontSize: '10px', marginRight: '6px' },
  tdNum: { padding: '5px 12px', borderBottom: '1px solid #E6DEC8', textAlign: 'right', color: '#2A1E10', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  tdCriterio: { padding: '5px 12px', borderBottom: '1px solid #E6DEC8', fontSize: '10px', color: '#8E7E62', whiteSpace: 'nowrap' },
  totalRow: { background: '#2D1F0A' },
  tdTotal: { padding: '7px 12px', color: '#FFF', fontWeight: '700', fontSize: '11px', position: 'sticky', left: 0, background: '#2D1F0A' },
  tdTotalNum: { padding: '7px 12px', textAlign: 'right', color: '#E6B84A', fontWeight: '700', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  resultadoRow: { background: '#1A3317' },
  tdResultado: { padding: '9px 12px', color: '#FFF', fontWeight: '700', fontSize: '12px', position: 'sticky', left: 0, background: '#1A3317' },
  tdResultadoNum: { padding: '9px 12px', textAlign: 'right', fontWeight: '700', fontSize: '12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  prefijoBadge: { marginLeft: '6px', fontSize: '9px', padding: '1px 5px', background: '#E6DEC8', color: '#8E7E62', borderRadius: '4px' },
  loading: { textAlign: 'center', padding: '48px', color: '#8E7E62', fontSize: '13px' },
  empty: { textAlign: 'center', padding: '48px', color: '#8E7E62', fontSize: '13px' },
  selectorBar: { background: '#FFFFFF', border: '1px solid #D6D0C4', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' },
  selectorLeft: { flex: 1, minWidth: 0 },
  selectorRight: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 },
  selectorLabel: { fontSize: '9px', fontWeight: '700', color: '#8E7E62', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' },
  selectorActions: { display: 'flex', gap: '6px', alignItems: 'center' },
  selectorCount: { fontSize: '11px', color: '#8E7E62', fontWeight: '600', minWidth: '60px', textAlign: 'right' },
  btnMini: { padding: '3px 9px', fontSize: '11px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '5px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  filtrosExtra: { display: 'flex', gap: '12px', alignItems: 'center' },
  checkLabel: { fontSize: '11px', color: '#5E4E36', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  vistaBtns: { display: 'flex', gap: '0' },
  vistaBtn: { padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  vistaActive: { padding: '4px 10px', fontSize: '11px', fontWeight: '700', background: '#1A3317', color: '#A8CC90', border: '1px solid #3E6E34', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  archivosList: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' },
  archivoItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#F6F1E7', border: '1px solid #E6DEC8', borderRadius: '6px', fontSize: '12px' },
  archivoIcon: { fontSize: '14px', flexShrink: 0 },
  archivoNombre: { flex: 1, color: '#2A1E10', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  archivoMes: { fontSize: '11px', padding: '2px 8px', background: '#EAF3DE', color: '#274F22', borderRadius: '10px', fontWeight: '700', flexShrink: 0 },
  archivoEliminar: { background: 'none', border: 'none', color: '#8E7E62', fontSize: '16px', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, fontWeight: '700' },
};
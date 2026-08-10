import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

const CAMPANA = '2025-2026';

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

const UDN = [
  { key: 'administracion', corto: 'Administración', color: '#6B6257' },
  { key: 'agricultura', corto: 'Agricultura', color: '#7C8460' },
  { key: 'granja_cerdos', corto: 'Cerdos', color: '#A9542F' },
  { key: 'serv_transporte', corto: 'Transporte', color: '#4A5A5C' },
  { key: 'serv_agricolas', corto: 'Servicios', color: '#C08A23' },
];

const TIPOS = [
  { key: 'corte_campana', label: 'Corte de campaña', desc: 'Traslado a la campaña anterior o posterior', justifica: true },
  { key: 'cierre_fiscal', label: 'Cierre fiscal', desc: 'Ajuste de cierre de ejercicio (diciembre)', justifica: true },
  { key: 'reclasificacion', label: 'Reclasificación', desc: 'Cambio de unidad de negocio, sin cambiar el total', justifica: true },
  { key: 'devengamiento', label: 'Devengamiento', desc: 'Imputación al período que corresponde', justifica: true },
  { key: 'sin_justificar', label: 'Sin justificar', desc: 'Diferencia a revisar con contabilidad', justifica: false },
];

const fmt = (v) => {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return '—';
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
};

const pct = (v) => `${(v * 100).toFixed(1)}%`;

const norm = (s) => String(s || '').trim().toUpperCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const mapCols = (headers) => {
  const m = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    if (n.includes('ADMINISTRACION')) m.administracion = i;
    else if (n === 'AGRICULTURA') m.agricultura = i;
    else if (n.includes('GRANJA')) m.granja_cerdos = i;
    else if (n.includes('TRANSPORTE')) m.serv_transporte = i;
    else if (n.includes('AGRICOLA')) m.serv_agricolas = i;
    else if (n === 'TOTAL') m.total = i;
    else if (n === 'CONTROL') m.clasificacion = i;
  });
  return m;
};

export default function Conciliacion({ moneda = 'ARS', onMoneda }) {
  const [conta, setConta] = useState([]);
  const [gestion, setGestion] = useState([]);
  const [ajustes, setAjustes] = useState({});
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [soloDesvios, setSoloDesvios] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [udnFiltro, setUdnFiltro] = useState('total');
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [monedaCarga, setMonedaCarga] = useState('ARS');
  const [resumen, setResumen] = useState([]);

  const cargarResumen = useCallback(async () => {
    const { data } = await supabase
      .from('consolidado_gestion')
      .select('moneda, nombre_archivo, importado_at')
      .eq('campana', CAMPANA);
    if (!data) { setResumen([]); return; }
    const g = {};
    data.forEach(r => {
      const k = `${r.moneda}|${r.nombre_archivo || 'sin nombre'}`;
      if (!g[k]) g[k] = { moneda: r.moneda, nombre: r.nombre_archivo || 'sin nombre', cuentas: 0, fecha: r.importado_at };
      g[k].cuentas += 1;
      if (r.importado_at > g[k].fecha) g[k].fecha = r.importado_at;
    });
    setResumen(Object.values(g).sort((a, b) => a.moneda.localeCompare(b.moneda)));
  }, []);

  const eliminarConsolidado = async (mon, nombre) => {
    if (!window.confirm(`¿Eliminar ${nombre} y todos sus datos en ${mon === 'ARS' ? 'AR$' : 'U$S'}?`)) return;
    await supabase.from('consolidado_gestion')
      .delete().eq('campana', CAMPANA).eq('moneda', mon);
    await supabase.from('ajustes_conciliacion')
      .delete().eq('campana', CAMPANA).eq('moneda', mon);
    setMsg(`Se eliminó ${nombre} y sus ajustes en ${mon === 'ARS' ? 'AR$' : 'U$S'}.`);
    await cargarResumen();
    cargarTodo();
  };

  const cargarTodo = useCallback(async () => {
    setCargando(true);

    let filas = [];
    let from = 0;
    while (true) {
      const { data, error: e } = await supabase
        .from('balance_mensual').select('*')
        .eq('campana', CAMPANA).eq('moneda', moneda)
        .range(from, from + 999);
      if (e || !data || data.length === 0) break;
      filas = filas.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const acum = {};
    filas.forEach(r => {
      if (!acum[r.cuenta_codigo]) {
        acum[r.cuenta_codigo] = {
          cuenta_codigo: r.cuenta_codigo, cuenta_desc: r.cuenta_desc, tipo: r.tipo,
          administracion: 0, agricultura: 0, granja_cerdos: 0,
          serv_transporte: 0, serv_agricolas: 0, total: 0,
        };
      }
      ['administracion','agricultura','granja_cerdos','serv_transporte','serv_agricolas','total']
        .forEach(k => { acum[r.cuenta_codigo][k] += (r[k] || 0); });
    });
    setConta(Object.values(acum));

    const { data: g } = await supabase
      .from('consolidado_gestion').select('*')
      .eq('campana', CAMPANA).eq('moneda', moneda);
    setGestion(g || []);

    const { data: a } = await supabase
      .from('ajustes_conciliacion').select('*')
      .eq('campana', CAMPANA).eq('moneda', moneda);
    const mapa = {};
    (a || []).forEach(x => { mapa[x.cuenta_codigo] = x; });
    setAjustes(mapa);

    setCargando(false);
  }, [moneda]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);
  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setMsg('');

    const mon = monedaCarga;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const nombreHoja = wb.SheetNames.find(n => norm(n).includes('TOTAL')) || wb.SheetNames[0];
        const ws = wb.Sheets[nombreHoja];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        let filaHead = 0;
        for (let i = 0; i < Math.min(6, data.length); i++) {
          if (data[i].some(c => norm(c) === 'TOTAL')) { filaHead = i; break; }
        }
        const cm = mapCols(data[filaHead] || []);
        if (cm.total === undefined) {
          setError('No se encontró la columna TOTAL en la planilla.');
          return;
        }

        const regs = [];
        for (let i = filaHead + 1; i < data.length; i++) {
          const cod = String(data[i][0] || '').trim();
          if (!/^\d{6}$/.test(cod)) continue;
          if (!(cod.startsWith('4') || cod.startsWith('5'))) continue;
          const r = {
            campana: CAMPANA, moneda: mon,
            cuenta_codigo: cod,
            cuenta_desc: String(data[i][1] || '').trim(),
            nombre_archivo: file.name,
            importado_at: new Date().toISOString(),
          };
          ['administracion','agricultura','granja_cerdos','serv_transporte','serv_agricolas','total']
            .forEach(k => {
              const idx = cm[k];
              r[k] = idx !== undefined ? (parseFloat(data[i][idx]) || 0) : 0;
            });
          r.clasificacion = cm.clasificacion !== undefined
            ? String(data[i][cm.clasificacion] || '').trim() || null : null;
          regs.push(r);
        }

        if (regs.length === 0) {
          setError('No se detectaron cuentas de resultado en la planilla.');
          return;
        }

        await supabase.from('consolidado_gestion')
          .delete().eq('campana', CAMPANA).eq('moneda', mon);
        const { error: err } = await supabase.from('consolidado_gestion').insert(regs);
        if (err) { setError('Error al guardar: ' + err.message); return; }

        if (mon !== moneda && onMoneda) onMoneda(mon);
        setMsg(`✓ ${file.name} — ${regs.length} cuentas importadas en ${mon === 'ARS' ? 'AR$' : 'U$S'}`);
        await cargarResumen();
        cargarTodo();
      } catch (err) {
        setError('No se pudo leer la planilla.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const col = udnFiltro;
  const mapaConta = {};
  conta.forEach(c => { mapaConta[c.cuenta_codigo] = c; });
  const mapaGest = {};
  gestion.forEach(g => { mapaGest[g.cuenta_codigo] = g; });

  const codigos = Array.from(new Set([...Object.keys(mapaConta), ...Object.keys(mapaGest)])).sort();

  const filas = codigos.map(cod => {
    const c = mapaConta[cod];
    const g = mapaGest[cod];
    const vc = c ? (c[col] || 0) : 0;
    const vg = g ? (g[col] || 0) : 0;
    return {
      cod,
      desc: (g && g.cuenta_desc) || (c && c.cuenta_desc) || '',
      tipo: (c && c.tipo) || (cod.startsWith('5') ? 'INGRESO' : 'GASTO'),
      contable: vc,
      gestion: vg,
      desvio: vg - vc,
      ajuste: ajustes[cod] || null,
      enConta: !!c,
      enGestion: !!g,
    };
  });

  const conDesvio = filas.filter(f => Math.abs(f.desvio) >= 1);
  const base = soloDesvios ? conDesvio : filas;
  const visibles = !filtroTipo ? base
    : filtroTipo === 'sin_clasificar'
      ? base.filter(f => !f.ajuste && Math.abs(f.desvio) >= 1)
      : base.filter(f => f.ajuste && f.ajuste.tipo === filtroTipo);

  const sumar = (arr, campo) => arr.reduce((s, f) => s + f[campo], 0);
  const ingresos = filas.filter(f => f.tipo === 'INGRESO');
  const gastos = filas.filter(f => f.tipo === 'GASTO');

  const bloques = [
    { label: 'INGRESOS', filas: ingresos, signo: -1 },
    { label: 'GASTOS', filas: gastos, signo: 1 },
  ];

  const totContable = sumar(filas, 'contable');
  const totGestion = sumar(filas, 'gestion');
  const totDesvio = totGestion - totContable;

  // El resultado se lee con los ingresos en positivo
  const resContable = -sumar(ingresos, 'contable') - sumar(gastos, 'contable');
  const resGestion = -sumar(ingresos, 'gestion') - sumar(gastos, 'gestion');

  const porTipo = {};
  TIPOS.forEach(t => { porTipo[t.key] = 0; });
  let sinClasificar = 0;
  conDesvio.forEach(f => {
    if (f.ajuste && porTipo[f.ajuste.tipo] !== undefined) porTipo[f.ajuste.tipo] += f.desvio;
    else sinClasificar += f.desvio;
  });

  const explicado = TIPOS.filter(t => t.justifica).reduce((s, t) => s + Math.abs(porTipo[t.key]), 0);
  const totalAbs = conDesvio.reduce((s, f) => s + Math.abs(f.desvio), 0);
  const cobertura = totalAbs > 0 ? explicado / totalAbs : 1;

  const guardarAjuste = async (fila) => {
    const b = borrador;
    if (!b.tipo) { setError('Elegí un tipo de ajuste.'); return; }
    setError('');
    const { error: err } = await supabase.from('ajustes_conciliacion').upsert({
      campana: CAMPANA, moneda,
      cuenta_codigo: fila.cod,
      cuenta_desc: fila.desc,
      tipo: b.tipo,
      campana_destino: b.campana_destino || null,
      importe: fila.desvio,
      justificacion: b.justificacion || null,
      autor: b.autor || null,
    }, { onConflict: 'campana,moneda,cuenta_codigo' });
    if (err) { setError('Error al guardar: ' + err.message); return; }
    setEditando(null);
    setBorrador({});
    cargarTodo();
  };

  const quitarAjuste = async (cod) => {
    await supabase.from('ajustes_conciliacion').delete()
      .eq('campana', CAMPANA).eq('moneda', moneda).eq('cuenta_codigo', cod);
    cargarTodo();
  };

  const abrirEdicion = (f) => {
    setEditando(f.cod);
    setBorrador(f.ajuste
      ? { tipo: f.ajuste.tipo, campana_destino: f.ajuste.campana_destino || '',
          justificacion: f.ajuste.justificacion || '', autor: f.ajuste.autor || '' }
      : { tipo: '', campana_destino: '', justificacion: '', autor: '' });
  };

  const simbolo = moneda === 'ARS' ? 'AR$' : 'U$S';

  function renderFila(f, i) {
    const t = f.ajuste ? TIPOS.find(x => x.key === f.ajuste.tipo) : null;
    const abierto = editando === f.cod;
    return (
      <React.Fragment key={f.cod}>
        <tr style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
          <td style={s.tdL}>
            <span style={s.cod}>{f.cod}</span> {f.desc}
            {!f.enConta && <span style={s.badgeFalta}>solo gestión</span>}
            {!f.enGestion && <span style={s.badgeFalta}>solo contable</span>}
          </td>
          <td style={s.tdR}>{fmt(f.contable)}</td>
          <td style={s.tdR}>{fmt(f.gestion)}</td>
          <td style={{ ...s.tdR, color: Math.abs(f.desvio) < 1 ? COLOR.textoTenue
            : f.desvio > 0 ? COLOR.ok : COLOR.alerta, fontWeight: 600 }}>
            {fmt(f.desvio)}
          </td>
          <td style={s.tdL}>
            {t ? (
              <span style={t.justifica ? s.pillOk : s.pillAlerta}>{t.label}</span>
            ) : Math.abs(f.desvio) >= 1 ? (
              <span style={s.pillPendiente}>sin clasificar</span>
            ) : null}
          </td>
          <td style={s.tdNota}>
            {f.ajuste ? (
              <>
                {f.ajuste.justificacion || '—'}
                {f.ajuste.campana_destino && (
                  <span style={s.destino}> → {f.ajuste.campana_destino}</span>
                )}
              </>
            ) : ''}
          </td>
          <td style={s.tdAcc}>
            {Math.abs(f.desvio) >= 1 && (
              <button style={s.btnMini} onClick={() => abrirEdicion(f)}>
                {f.ajuste ? 'editar' : 'clasificar'}
              </button>
            )}
          </td>
        </tr>

        {abierto && (
          <tr>
            <td colSpan={7} style={s.editorCelda}>
              <div style={s.editor}>
                <div style={s.editorHead}>
                  Desvío de {fmt(f.desvio)} {simbolo} en {f.cod} {f.desc}
                </div>
                <div style={s.tiposGrid}>
                  {TIPOS.map(tt => (
                    <button key={tt.key}
                      style={borrador.tipo === tt.key ? s.tipoActive : s.tipoBtn}
                      onClick={() => setBorrador(b => ({ ...b, tipo: tt.key }))}
                      title={tt.desc}>
                      {tt.label}
                    </button>
                  ))}
                </div>
                {borrador.tipo === 'corte_campana' && (
                  <input style={s.input} placeholder="Campaña destino, por ejemplo 2026-2027"
                    value={borrador.campana_destino || ''}
                    onChange={e => setBorrador(b => ({ ...b, campana_destino: e.target.value }))} />
                )}
                <input style={s.input} placeholder="Justificación del ajuste"
                  value={borrador.justificacion || ''}
                  onChange={e => setBorrador(b => ({ ...b, justificacion: e.target.value }))} />
                <input style={s.input} placeholder="Quién lo definió"
                  value={borrador.autor || ''}
                  onChange={e => setBorrador(b => ({ ...b, autor: e.target.value }))} />
                <div style={s.editorAcc}>
                  <button style={s.btn} onClick={() => guardarAjuste(f)}>Guardar</button>
                  <button style={s.btnSec} onClick={() => { setEditando(null); setBorrador({}); }}>
                    Cancelar
                  </button>
                  {f.ajuste && (
                    <button style={s.btnSec} onClick={() => quitarAjuste(f.cod)}>
                      Quitar clasificación
                    </button>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  }

  return (
    <>
      <div style={s.card}>
        <div style={s.cardTitle}>Planilla de gestión del contador</div>
        <div style={s.cardSub}>
          Se lee la solapa TOTAL ANUAL. Elegí la moneda en la que está expresada la planilla
          antes de subirla. La comparación es válida en pesos: en dólares el contador usa un
          tipo de cambio único y la contabilidad usa el de cada operación.
        </div>

        <div style={s.cargaFila}>
          <span style={s.label}>MONEDA</span>
          <div style={s.grupo}>
            <button style={monedaCarga === 'ARS' ? s.btnActive : s.btnOff}
              onClick={() => setMonedaCarga('ARS')}>AR$</button>
            <button style={monedaCarga === 'USD' ? s.btnActive : s.btnOff}
              onClick={() => setMonedaCarga('USD')}>U$S</button>
          </div>
          <input type="file" accept=".xls,.xlsx" onChange={handleFile}
            style={{ display: 'none' }} id="file-gestion" />
          <label htmlFor="file-gestion" style={s.btn}>Subir planilla</label>
        </div>

        {msg && <div style={s.msgOk}>{msg}</div>}
        {error && <div style={s.msgError}>{error}</div>}

        {resumen.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={s.subTitulo}>PLANILLAS CARGADAS</div>
            {resumen.map(r => (
              <div key={r.moneda + r.nombre} style={s.archivoItem}>
                <span style={r.moneda === 'ARS' ? s.pillArs : s.pillUsd}>
                  {r.moneda === 'ARS' ? 'AR$' : 'U$S'}
                </span>
                <span style={s.archivoNombre}>{r.nombre}</span>
                <span style={s.archivoDato}>{r.cuentas} cuentas</span>
                <span style={s.archivoDato}>
                  {r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : ''}
                </span>
                <button style={s.archivoEliminar}
                  onClick={() => eliminarConsolidado(r.moneda, r.nombre)}
                  title="Eliminar planilla, sus datos y sus ajustes">×</button>
              </div>
            ))}
            <div style={s.notaChica}>
              Subir de nuevo la misma moneda reemplaza la planilla anterior por completo.
              Eliminar borra también los ajustes clasificados de esa moneda.
            </div>
          </div>
        )}
      </div>

      <div style={s.selectorBar}>
        <div style={s.fila}>
          <span style={s.label}>COLUMNA</span>
          <div style={s.grupo}>
            <button style={udnFiltro === 'total' ? s.btnActive : s.btnOff}
              onClick={() => setUdnFiltro('total')}>Total</button>
            {UDN.map(u => (
              <button key={u.key}
                style={udnFiltro === u.key
                  ? { ...s.btnActive, background: u.color, borderColor: u.color, color: '#FFF' }
                  : s.btnOff}
                onClick={() => setUdnFiltro(u.key)}>
                {u.corto}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <label style={s.check}>
            <input type="checkbox" checked={soloDesvios}
              onChange={e => setSoloDesvios(e.target.checked)}
              style={{ marginRight: '5px' }} />
            Solo cuentas con desvío
          </label>
        </div>
        {udnFiltro !== 'total' && udnFiltro !== 'administracion' && (
          <div style={s.avisoTC}>
            La planilla del contador deja Administración sin prorratear, así que las columnas
            por unidad no son comparables una a una. El desvío real se mide en la columna Total.
          </div>
        )}
        {moneda === 'USD' && (
          <div style={s.avisoTC}>
            Estás viendo dólares: las diferencias incluyen el efecto del tipo de cambio.
            Para analizar ajustes, cambiá a AR$ en la pestaña Visualizar.
          </div>
        )}
      </div>

      {cargando ? (
        <div style={s.loading}>Cargando…</div>
      ) : gestion.length === 0 ? (
        <div style={s.empty}>
          Importá la planilla del contador para ver la conciliación en {simbolo}.
        </div>
      ) : (
        <>
          <div style={s.card}>
            <div style={s.cardTitle}>Puente contabilidad → gestión</div>
            <div style={s.puente}>
              <div style={s.puenteItem}>
                <div style={s.puenteLabel}>CONTABILIDAD</div>
                <div style={s.puenteVal}>{fmt(totContable)}</div>
              </div>
              {TIPOS.map(t => {
                const n = conDesvio.filter(f => f.ajuste && f.ajuste.tipo === t.key).length;
                const activo = filtroTipo === t.key;
                return (
                  <div key={t.key}
                    style={activo ? { ...s.puenteItem, ...s.puenteActivo } : s.puenteItem}
                    onClick={() => setFiltroTipo(activo ? null : t.key)}
                    title={t.desc}>
                    <div style={s.puenteLabel}>{t.label.toUpperCase()}</div>
                    <div style={{ ...s.puenteVal, color: t.justifica ? COLOR.ok : COLOR.alerta }}>
                      {porTipo[t.key] >= 0 ? '+' : ''}{fmt(porTipo[t.key])}
                    </div>
                    <div style={s.puenteCuenta}>{n} cuenta{n !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
              {Math.abs(sinClasificar) >= 1 && (() => {
                const n = conDesvio.filter(f => !f.ajuste).length;
                const activo = filtroTipo === 'sin_clasificar';
                return (
                  <div style={activo ? { ...s.puenteItem, ...s.puenteActivo } : s.puenteItem}
                    onClick={() => setFiltroTipo(activo ? null : 'sin_clasificar')}
                    title="Cuentas con desvío que todavía no revisaste">
                    <div style={s.puenteLabel}>SIN CLASIFICAR</div>
                    <div style={{ ...s.puenteVal, color: COLOR.alerta }}>
                      {sinClasificar >= 0 ? '+' : ''}{fmt(sinClasificar)}
                    </div>
                    <div style={s.puenteCuenta}>{n} cuenta{n !== 1 ? 's' : ''}</div>
                  </div>
                );
              })()}
              <div style={{ ...s.puenteItem, ...s.puenteFinal }}>
                <div style={s.puenteLabel}>GESTIÓN</div>
                <div style={{ ...s.puenteVal, color: COLOR.bronceClaro }}>{fmt(totGestion)}</div>
              </div>
            </div>

            <div style={s.resumenLinea}>
              <span>Desvío total: <strong>{fmt(totDesvio)} {simbolo}</strong></span>
              <span>Cuentas con desvío: <strong>{conDesvio.length}</strong> de {filas.length}</span>
              <span style={{ color: cobertura >= 0.9 ? COLOR.ok : COLOR.alerta }}>
                Desvío justificado: <strong>{pct(cobertura)}</strong>
              </span>
            </div>
            <div style={s.barra}>
              <div style={{ ...s.barraOk, width: `${Math.min(100, cobertura * 100)}%` }} />
            </div>
            {filtroTipo && (
              <div style={s.filtroActivo}>
                Mostrando {visibles.length} cuenta{visibles.length !== 1 ? 's' : ''} de{' '}
                {filtroTipo === 'sin_clasificar'
                  ? 'sin clasificar'
                  : TIPOS.find(t => t.key === filtroTipo)?.label.toLowerCase()}
                <button style={s.btnQuitar} onClick={() => setFiltroTipo(null)}>quitar filtro</button>
              </div>
            )}
          </div>

          <div style={s.tableCard}>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thL}>Cuenta</th>
                    <th style={s.thR}>Contabilidad</th>
                    <th style={s.thR}>Gestión</th>
                    <th style={s.thR}>Desvío</th>
                    <th style={s.thL}>Tipo de ajuste</th>
                    <th style={s.thL}>Justificación</th>
                    <th style={s.thL}></th>
                  </tr>
                </thead>
                <tbody>
                  {bloques.map(bl => {
                    const delBloque = visibles.filter(f => f.tipo === bl.label.slice(0, -1));
                    if (delBloque.length === 0) return null;
                    return (
                      <React.Fragment key={bl.label}>
                        <tr>
                          <td colSpan={7} style={s.seccion}>{bl.label}</td>
                        </tr>
                        {delBloque.map((f, i) => renderFila(f, i))}
                        <tr style={s.subtotalRow}>
                          <td style={s.tdSubtotal}>Subtotal {bl.label.toLowerCase()}</td>
                          <td style={s.tdSubtotalNum}>{fmt(sumar(delBloque, 'contable'))}</td>
                          <td style={s.tdSubtotalNum}>{fmt(sumar(delBloque, 'gestion'))}</td>
                          <td style={s.tdSubtotalNum}>{fmt(sumar(delBloque, 'desvio'))}</td>
                          <td colSpan={3} style={s.tdSubtotal}></td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  <tr style={s.totalRow}>
                    <td style={s.tdTotal}>RESULTADO</td>
                    <td style={s.tdTotalNum}>{fmt(resContable)}</td>
                    <td style={s.tdTotalNum}>{fmt(resGestion)}</td>
                    <td style={s.tdTotalNum}>{fmt(resGestion - resContable)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const s = {
  card: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', padding: '18px 22px', marginBottom: '14px' },
  cardTitle: { fontSize: '15px', color: COLOR.oscuro, fontFamily: FUENTE.titulo, marginBottom: '6px' },
  cardSub: { fontSize: '11.5px', color: COLOR.textoSuave, lineHeight: '1.7', marginBottom: '14px' },
  btn: { display: 'inline-block', padding: '8px 18px', background: COLOR.oscuro, color: COLOR.bronceClaro, borderRadius: '2px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', border: 'none', fontFamily: FUENTE.ui, letterSpacing: '0.1em' },
  btnSec: { padding: '8px 16px', background: 'transparent', color: COLOR.textoSuave, borderRadius: '2px', fontSize: '11px', cursor: 'pointer', border: `1px solid ${COLOR.borde}`, fontFamily: FUENTE.ui },
  archivoInfo: { marginLeft: '12px', fontSize: '11px', color: COLOR.textoTenue },
  msgOk: { marginTop: '12px', padding: '9px 13px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '2px', fontSize: '12px' },
  msgError: { marginTop: '12px', padding: '9px 13px', background: COLOR.alertaFondo, color: COLOR.alerta, borderRadius: '2px', fontSize: '12px' },
  selectorBar: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', padding: '12px 16px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  fila: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  label: { width: '58px', fontSize: '9px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.12em', flexShrink: 0 },
  grupo: { display: 'flex', gap: '4px' },
  btnOff: { padding: '4px 12px', fontSize: '11px', fontWeight: '500', background: '#F0EDE4', color: COLOR.textoSuave, border: `1px solid ${COLOR.borde}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  btnActive: { padding: '4px 12px', fontSize: '11px', fontWeight: '700', background: COLOR.oscuro, color: COLOR.bronceClaro, border: `1px solid ${COLOR.oscuro}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  avisoTC: { fontSize: '10.5px', color: COLOR.alerta, paddingLeft: '68px' },
  check: { fontSize: '11px', color: COLOR.textoSuave, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  puente: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' },
  puenteItem: { flex: '1 1 110px', background: COLOR.fila, border: `1px solid ${COLOR.linea}`, borderRadius: '2px', padding: '9px 11px', minWidth: '110px', cursor: 'pointer' },
  puenteFinal: { background: COLOR.oscuro, borderColor: COLOR.oscuro },
  puenteLabel: { fontSize: '8.5px', color: COLOR.textoTenue, letterSpacing: '0.1em', marginBottom: '4px' },
  puenteVal: { fontSize: '14px', fontWeight: '600', color: COLOR.texto, fontVariantNumeric: 'tabular-nums' },
  resumenLinea: { display: 'flex', gap: '22px', flexWrap: 'wrap', fontSize: '11.5px', color: COLOR.textoSuave, marginBottom: '8px' },
  barra: { height: '5px', background: COLOR.linea, borderRadius: '2px', overflow: 'hidden' },
  barraOk: { height: '100%', background: '#7C8460' },
  tableCard: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', overflow: 'hidden' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
  thL: { background: COLOR.oscuro, color: '#FFF', padding: '8px 11px', textAlign: 'left', fontSize: '9.5px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '500' },
  thR: { background: COLOR.oscuro, color: '#FFF', padding: '8px 11px', textAlign: 'right', fontSize: '9.5px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '500' },
  tdL: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, color: COLOR.texto, whiteSpace: 'nowrap' },
  tdR: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, textAlign: 'right', color: COLOR.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  tdNota: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, fontSize: '10.5px', color: COLOR.textoSuave, maxWidth: '220px' },
  tdAcc: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, textAlign: 'right' },
  cod: { color: COLOR.textoTenue, fontSize: '10px', marginRight: '6px' },
  badgeFalta: { marginLeft: '7px', fontSize: '9px', padding: '1px 6px', background: COLOR.alertaFondo, color: COLOR.alerta, borderRadius: '999px' },
  pillOk: { fontSize: '10px', padding: '2px 8px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '999px', whiteSpace: 'nowrap' },
  pillAlerta: { fontSize: '10px', padding: '2px 8px', background: COLOR.alertaFondo, color: COLOR.alerta, borderRadius: '999px', whiteSpace: 'nowrap' },
  pillPendiente: { fontSize: '10px', padding: '2px 8px', background: '#F4EFE3', color: COLOR.textoTenue, borderRadius: '999px', whiteSpace: 'nowrap' },
  destino: { color: COLOR.bronce, fontWeight: '500' },
  btnMini: { padding: '2px 9px', fontSize: '10px', background: 'transparent', color: COLOR.textoSuave, border: `1px solid ${COLOR.borde}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  editorCelda: { padding: 0, background: COLOR.fila, borderBottom: `1px solid ${COLOR.linea}` },
  editor: { padding: '14px 18px' },
  editorHead: { fontSize: '12px', color: COLOR.texto, marginBottom: '10px', fontWeight: '500' },
  tiposGrid: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' },
  tipoBtn: { padding: '6px 13px', fontSize: '11px', background: COLOR.papel, color: COLOR.textoSuave, border: `1px solid ${COLOR.borde}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  tipoActive: { padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: COLOR.oscuro, color: COLOR.bronceClaro, border: `1px solid ${COLOR.oscuro}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  input: { width: '100%', padding: '7px 11px', fontSize: '11.5px', border: `1px solid ${COLOR.borde}`, borderRadius: '2px', fontFamily: FUENTE.ui, background: COLOR.papel, color: COLOR.texto, marginBottom: '7px', outline: 'none', boxSizing: 'border-box' },
  editorAcc: { display: 'flex', gap: '7px', marginTop: '4px' },
  totalRow: { background: COLOR.medio },
  tdTotal: { padding: '8px 11px', color: '#FFF', fontWeight: '600', fontSize: '11px' },
  tdTotalNum: { padding: '8px 11px', textAlign: 'right', color: COLOR.bronceClaro, fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
  loading: { textAlign: 'center', padding: '44px', color: COLOR.textoTenue, fontSize: '12px' },
  empty: { textAlign: 'center', padding: '44px', color: COLOR.textoTenue, fontSize: '12px', background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px' },
  cargaFila: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  subTitulo: { fontSize: '9px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.12em', marginBottom: '8px' },
  archivoItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 11px', background: COLOR.fila, border: `1px solid ${COLOR.linea}`, borderRadius: '2px', marginBottom: '5px', fontSize: '12px' },
  archivoNombre: { flex: 1, color: COLOR.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  archivoDato: { fontSize: '10.5px', color: COLOR.textoTenue, flexShrink: 0 },
  archivoEliminar: { background: 'none', border: 'none', color: COLOR.textoTenue, fontSize: '17px', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 },
  pillArs: { fontSize: '10px', fontWeight: '700', padding: '2px 9px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '999px', flexShrink: 0 },
  pillUsd: { fontSize: '10px', fontWeight: '700', padding: '2px 9px', background: '#FBEBCB', color: '#7E5A12', borderRadius: '999px', flexShrink: 0 },
  notaChica: { fontSize: '10.5px', color: COLOR.textoTenue, marginTop: '8px', lineHeight: '1.6' },
  puenteActivo: { background: COLOR.oscuro, borderColor: COLOR.oscuro },
  puenteCuenta: { fontSize: '9.5px', color: COLOR.textoTenue, marginTop: '3px' },
  filtroActivo: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '11px', color: COLOR.textoSuave },
  btnQuitar: { padding: '2px 9px', fontSize: '10px', background: 'transparent', color: COLOR.alerta, border: `1px solid ${COLOR.alerta}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  seccion: { background: '#4A3520', color: '#E6C070', padding: '5px 11px', fontWeight: '600', fontSize: '9.5px', letterSpacing: '0.1em' },
  subtotalRow: { background: '#EFE8DA' },
  tdSubtotal: { padding: '6px 11px', color: COLOR.texto, fontWeight: '600', fontSize: '11px', borderTop: `1px solid ${COLOR.borde}` },
  tdSubtotalNum: { padding: '6px 11px', textAlign: 'right', color: COLOR.texto, fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${COLOR.borde}`, whiteSpace: 'nowrap' },
};
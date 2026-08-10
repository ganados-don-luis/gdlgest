import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { APP_NOMBRE, APP_VERSION } from '../version';

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

const ESTIVALES = ['MAIZ', 'MAIZ TARDIO', 'SOJA DE PRIMERA', 'SOJA DE SEGUNDA'];

const norm = (s) => String(s || '').trim().toUpperCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const n0 = (v) => (v === null || v === undefined || !isFinite(v) || Math.abs(v) < 0.5)
  ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v);
const n1 = (v) => !isFinite(v) ? '—'
  : new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const n2 = (v) => !isFinite(v) ? '—'
  : new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export default function MargenBruto() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('resultado');
  const [cultivo, setCultivo] = useState('MAIZ');
  const [baseHa, setBaseHa] = useState('sembrada');

  const [siembra, setSiembra] = useState([]);
  const [cosecha, setCosecha] = useState([]);
  const [costos, setCostos] = useState([]);
  const [param, setParam] = useState(null);
  const [indirectos, setIndirectos] = useState({ agronomo: 0, seguro: 0, arrendamiento: 0, estructura: 0 });
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [borrador, setBorrador] = useState({});

  // ── CARGA ─────────────────────────────────────
  const cargarTodo = useCallback(async () => {
    setCargando(true);
    const [s, c, k, p] = await Promise.all([
      supabase.from('mb_siembra').select('*').eq('campana', CAMPANA),
      supabase.from('mb_cosecha').select('*').eq('campana', CAMPANA),
      supabase.from('mb_costo_lote').select('*').eq('campana', CAMPANA),
      supabase.from('mb_parametros').select('*').eq('campana', CAMPANA),
    ]);
    setSiembra(s.data || []);
    setCosecha(c.data || []);
    setCostos(k.data || []);
    const pc = (p.data || []).find(x => x.cultivo === cultivo)
      || { campana: CAMPANA, cultivo, precio_usd_tn: 0, comision_usd_tn: 2,
           flete_ars_tn: 22000, tc: 1376.17, cosecha_pct: 0.07 };
    setParam(pc);
    setBorrador(pc);
    setCargando(false);
  }, [cultivo]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // ── INDIRECTOS DESDE EL BALANCE ───────────────
  const cargarIndirectos = useCallback(async () => {
    const { data: cta } = await supabase
      .from('mb_cuentas_indirectas').select('*').eq('activo', true);
    if (!cta) return;

    let filas = [];
    let from = 0;
    while (true) {
      const { data, error: e } = await supabase
        .from('balance_mensual').select('cuenta_codigo, total')
        .eq('campana', CAMPANA).eq('moneda', 'USD')
        .range(from, from + 999);
      if (e || !data || data.length === 0) break;
      filas = filas.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const acum = { agronomo: 0, seguro: 0, arrendamiento: 0, estructura: 0 };
    filas.forEach(f => {
      cta.forEach(c => {
        if (f.cuenta_codigo.startsWith(c.cuenta_codigo)) {
          acum[c.concepto] = (acum[c.concepto] || 0) + (f.total || 0);
        }
      });
    });
    setIndirectos(acum);
  }, []);

  useEffect(() => { cargarIndirectos(); }, [cargarIndirectos]);

  // ── CÁLCULO ───────────────────────────────────
  const esEstival = (c) => ESTIVALES.includes(norm(c));

  // superficie física por campo (máximo por lote entre ciclos)
  const fisicaPorCampo = {};
  const loteMax = {};
  siembra.forEach(s => {
    const k = `${s.campo}|${s.lote}`;
    loteMax[k] = Math.max(loteMax[k] || 0, s.ha_sembrada || 0);
  });
  Object.entries(loteMax).forEach(([k, v]) => {
    const campo = k.split('|')[0];
    fisicaPorCampo[campo] = (fisicaPorCampo[campo] || 0) + v;
  });
  const totalFisica = Object.values(fisicaPorCampo).reduce((a, b) => a + b, 0);

  // arrendamiento por cultivo, según ocupación del campo
  const arrPorCultivo = {};
  Object.entries(fisicaPorCampo).forEach(([campo, haF]) => {
    const delCampo = siembra.filter(s => s.campo === campo);
    const hayE = delCampo.some(s => esEstival(s.cultivo));
    const hayI = delCampo.some(s => !esEstival(s.cultivo));
    const arr = totalFisica > 0 ? (haF / totalFisica) * indirectos.arrendamiento : 0;
    const aVerano = hayE && hayI ? arr * 0.5 : hayE ? arr : 0;
    const aInvierno = hayE && hayI ? arr * 0.5 : hayI ? arr : 0;

    const haE = delCampo.filter(s => esEstival(s.cultivo))
      .reduce((a, s) => a + (s.ha_sembrada || 0), 0);
    delCampo.forEach(s => {
      if (esEstival(s.cultivo) && haE > 0) {
        arrPorCultivo[norm(s.cultivo)] =
          (arrPorCultivo[norm(s.cultivo)] || 0) + aVerano * (s.ha_sembrada || 0) / haE;
      }
    });
    const haI = delCampo.filter(s => !esEstival(s.cultivo))
      .reduce((a, s) => a + (s.ha_sembrada || 0), 0);
    delCampo.forEach(s => {
      if (!esEstival(s.cultivo) && haI > 0) {
        arrPorCultivo[norm(s.cultivo)] =
          (arrPorCultivo[norm(s.cultivo)] || 0) + aInvierno * (s.ha_sembrada || 0) / haI;
      }
    });
  });

  const haEstivales = siembra.filter(s => esEstival(s.cultivo))
    .reduce((a, s) => a + (s.ha_sembrada || 0), 0);
  const haCultivo = siembra.filter(s => norm(s.cultivo) === cultivo)
    .reduce((a, s) => a + (s.ha_sembrada || 0), 0);
  const coef = haEstivales > 0 ? haCultivo / haEstivales : 0;

  // lotes del cultivo
  const lotes = siembra
    .filter(s => norm(s.cultivo) === cultivo)
    .map(s => {
      const co = cosecha.find(c => c.campo === s.campo && c.lote === s.lote
        && norm(c.cultivo) === cultivo);
      const cs = costos.filter(c => c.campo === s.campo && c.lote === s.lote
        && norm(c.cultivo) === cultivo);
      const ha = baseHa === 'cosechada'
        ? (s.ha_cosechada || s.ha_sembrada || 0)
        : (s.ha_sembrada || 0);
      return {
        campo: s.campo, lote: s.lote,
        haSem: s.ha_sembrada || 0,
        haCos: s.ha_cosechada || s.ha_sembrada || 0,
        ha,
        kgCampo: co ? (co.kg_campo || 0) : 0,
        kgNeto: co ? (co.kg_neto || 0) : 0,
        laboreos: cs.filter(c => c.concepto === 'laboreo').reduce((a, c) => a + (c.usd || 0), 0),
        productos: cs.filter(c => c.concepto === 'producto').reduce((a, c) => a + (c.usd || 0), 0),
      };
    })
    .sort((a, b) => (a.campo + a.lote).localeCompare(b.campo + b.lote));

  const P = param || {};
  const precio = P.precio_usd_tn || 0;
  const comision = P.comision_usd_tn || 0;
  const tc = P.tc || 1;
  const fleteUsd = (P.flete_ars_tn || 0) / tc;
  const cosPct = P.cosecha_pct || 0;

  const haTot = lotes.reduce((a, l) => a + l.ha, 0);
  const agronCult = indirectos.agronomo * coef;
  const seguroCult = indirectos.seguro * coef;
  const estrucCult = indirectos.estructura * coef;
  const arrCult = arrPorCultivo[cultivo] || 0;

  const calc = lotes.map(l => {
    const p = haTot > 0 ? l.ha / haTot : 0;
    const prodBruta = l.kgCampo / 1000 * precio;
    const merma = -(l.kgCampo - l.kgNeto) / 1000 * precio;
    const ingBruto = l.kgNeto / 1000 * precio;
    const com = -l.kgNeto / 1000 * comision;
    const fle = -l.kgNeto / 1000 * fleteUsd;
    const ingNeto = ingBruto + com + fle;
    const cos = -prodBruta * cosPct;
    const agr = -agronCult * p;
    const seg = -seguroCult * p;
    const arr = -arrCult * p;
    const est = -estrucCult * p;
    const mb = ingNeto + cos - l.laboreos - l.productos + agr + seg + arr;
    return { ...l, prodBruta, merma, ingBruto, com, fle, ingNeto, cos,
      agr, seg, arr, est, mb, mn: mb + est };
  });

  const T = (campo) => calc.reduce((a, l) => a + (l[campo] || 0), 0);
  const sumLab = calc.reduce((a, l) => a + l.laboreos, 0);
  const sumProd = calc.reduce((a, l) => a + l.productos, 0);
  const kgCampoT = calc.reduce((a, l) => a + l.kgCampo, 0);
  const kgNetoT = calc.reduce((a, l) => a + l.kgNeto, 0);

  const filasFisicas = [
    { l: 'Superficie', u: 'ha', v: (x) => x.ha, d: 1 },
    { l: 'Producción de campo', u: 'kg', v: (x) => x.kgCampo, d: 0 },
    { l: 'Producción neta', u: 'kg', v: (x) => x.kgNeto, d: 0 },
    { l: 'Merma', u: 'kg', v: (x) => -(x.kgCampo - x.kgNeto), d: 0 },
    { l: 'Rinde neto', u: 'qq/ha', v: (x) => x.ha > 0 ? x.kgNeto / x.ha / 100 : 0, d: 1, prom: true },
  ];

  const filasCascada = [
    { l: 'Producción bruta', v: (x) => x.prodBruta, fuerte: true },
    { l: 'Merma', v: (x) => x.merma, sub: true },
    { l: 'INGRESO BRUTO', v: (x) => x.ingBruto, total: true },
    { l: 'Comisión', v: (x) => x.com, sub: true },
    { l: 'Flete', v: (x) => x.fle, sub: true },
    { l: 'INGRESO NETO', v: (x) => x.ingNeto, total: true },
    { l: 'Cosecha', v: (x) => x.cos, sub: true },
    { l: 'Laboreos', v: (x) => -x.laboreos, sub: true },
    { l: 'Productos aplicados', v: (x) => -x.productos, sub: true },
    { l: 'Ing. agrónomo', v: (x) => x.agr, sub: true },
    { l: 'Seguro agrícola', v: (x) => x.seg, sub: true },
    { l: 'Arrendamiento', v: (x) => x.arr, sub: true },
    { l: 'MARGEN BRUTO', v: (x) => x.mb, total: true, destaca: true },
    { l: 'Estructura', v: (x) => x.est, sub: true },
    { l: 'MARGEN NETO', v: (x) => x.mn, total: true, destaca: true },
  ];

  // ── PARÁMETROS ────────────────────────────────
  const guardarParam = async () => {
    setError(''); setMsg('');
    const b = borrador;
    const { error: err } = await supabase.from('mb_parametros').upsert({
      campana: CAMPANA, cultivo,
      precio_usd_tn: parseFloat(b.precio_usd_tn) || 0,
      precio_fuente: b.precio_fuente || null,
      precio_fecha: b.precio_fecha || null,
      comision_usd_tn: parseFloat(b.comision_usd_tn) || 0,
      flete_ars_tn: parseFloat(b.flete_ars_tn) || 0,
      tc: parseFloat(b.tc) || 1,
      cosecha_pct: parseFloat(b.cosecha_pct) || 0,
      actualizado_at: new Date().toISOString(),
    }, { onConflict: 'campana,cultivo' });
    if (err) { setError('Error: ' + err.message); return; }
    setMsg('Parámetros guardados.');
    cargarTodo();
  };

  // ── IMPORTADORES ──────────────────────────────
  const leerArchivo = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        res(wb);
      } catch (err) { rej(err); }
    };
    r.onerror = rej;
    r.readAsBinaryString(file);
  });

  const impSiembra = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setError(''); setMsg('');
    try {
      const wb = await leerArchivo(file);
      const hoja = wb.SheetNames.find(n => norm(n).includes('SIEMBRA')) || wb.SheetNames[0];
      const d = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '' });
      // localizar columna GDL en la fila de encabezados
      let filaH = -1, colGdl = -1;
      for (let i = 0; i < Math.min(8, d.length); i++) {
        const idx = d[i].findIndex(c => norm(c) === 'GDL');
        if (idx >= 0) { filaH = i; colGdl = idx; }
      }
      if (colGdl < 0) { setError('No se encontró la columna GDL en el plan de siembra.'); return; }

      const regs = [];
      let campo = '';
      for (let i = filaH + 1; i < d.length; i++) {
        if (d[i][0] && String(d[i][0]).trim()) campo = String(d[i][0]).trim();
        const lote = String(d[i][8] || '').trim();
        const cult = String(d[i][9] || '').trim();
        const ha = parseFloat(d[i][colGdl]);
        if (!cult || !lote || !isFinite(ha) || ha <= 0) continue;
        if (!/[A-Z]/i.test(cult)) continue;
        regs.push({
          campana: CAMPANA, campo, lote, cultivo: norm(cult),
          ciclo: ESTIVALES.includes(norm(cult)) ? 'estival' : 'invernal',
          ha_sembrada: ha, ha_cosechada: ha,
        });
      }
      if (!regs.length) { setError('No se detectaron filas válidas.'); return; }
      await supabase.from('mb_siembra').delete().eq('campana', CAMPANA);
      const { error: err } = await supabase.from('mb_siembra').insert(regs);
      if (err) { setError('Error: ' + err.message); return; }
      setMsg(`✓ Plan de siembra: ${regs.length} registros.`);
      cargarTodo();
    } catch (err) { setError('No se pudo leer el archivo.'); }
  };

// Los nombres de lote difieren entre archivos (BEBIDA vs CAMPAS BEBIDAS).
  // Busca en el plan de siembra el lote que corresponde.
  const emparejarLote = (campo, loteRaw, lista) => {
    const candidatos = (lista || siembra).filter(x =>
      norm(x.campo) === norm(campo) && norm(x.cultivo) === cultivo);
    if (!candidatos.length) return loteRaw;

    const exacto = candidatos.find(x => norm(x.lote) === norm(loteRaw));
    if (exacto) return exacto.lote;

    const raiz = (t) => t.replace(/(ES|S)$/, '');
    const tokens = norm(loteRaw).split(/[^A-Z0-9]+/).filter(t => t.length >= 4).map(raiz);

    for (const c of candidatos) {
      const tc = norm(c.lote).split(/[^A-Z0-9]+/).filter(t => t.length >= 4).map(raiz);
      if (tokens.some(t => tc.some(x => x.startsWith(t) || t.startsWith(x)))) return c.lote;
    }
    return loteRaw;
  };

  const impCosecha = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setError(''); setMsg('');
    try {
      const { data: siembraDb } = await supabase
        .from('mb_siembra').select('*').eq('campana', CAMPANA);
      const lista = siembraDb || [];
      if (!lista.length) {
        setError('Importá primero el plan de siembra.');
        return;
      }
      const wb = await leerArchivo(file);
      const hoja = wb.SheetNames.find(n => norm(n).includes('RINDE')) || wb.SheetNames[0];
      const d = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '' });
      let filaH = -1;
      for (let i = 0; i < Math.min(10, d.length); i++) {
        if (d[i].some(c => norm(c).includes('KILOS CAMPO'))) { filaH = i; break; }
      }
      if (filaH < 0) { setError('No se encontró el encabezado KILOS CAMPO.'); return; }
      const H = d[filaH].map(norm);
      const iCampo = H.findIndex(c => c === 'CAMPO');
      const iLote = H.findIndex(c => c === 'LOTE');
      const iCampoKg = H.findIndex(c => c.includes('KILOS CAMPO'));
      const iNeto = H.findIndex(c => c.includes('KILOS NETO'));
      const iGdl = H.findIndex(c => c === 'GDL');

      const regs = [];
      for (let i = filaH + 1; i < d.length; i++) {
        const campo = String(d[i][iCampo] || '').trim();
        if (!campo) continue;
        const gdl = parseFloat(d[i][iGdl]);
        if (!isFinite(gdl) || gdl <= 0) continue;   // solo lo de GDL
        const kgC = parseFloat(d[i][iCampoKg]) || 0;
        const kgN = parseFloat(d[i][iNeto]) || 0;
        const prop = kgN > 0 ? gdl / kgN : 1;
        const loteRaw = String(d[i][iLote] || campo).trim() || campo;
        regs.push({
          campana: CAMPANA, campo,
          lote: emparejarLote(campo, loteRaw, lista),
          cultivo: cultivo,
          fecha_cosecha: null,
          kg_campo: Math.round(kgC * prop),
          kg_neto: Math.round(gdl),
        });
      }
      if (!regs.length) { setError('No se detectaron lotes de GDL.'); return; }
      await supabase.from('mb_cosecha').delete()
        .eq('campana', CAMPANA).eq('cultivo', cultivo);
      const { error: err } = await supabase.from('mb_cosecha').insert(regs);
      if (err) { setError('Error: ' + err.message); return; }
      setMsg(`✓ Cosecha ${cultivo}: ${regs.length} lotes.`);
      cargarTodo();
    } catch (err) { setError('No se pudo leer el archivo.'); }
  };

  const impLaboreos = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setError(''); setMsg('');
    try {
      const wb = await leerArchivo(file);
      const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      // sección del socio 1
      let ini = -1, fin = d.length;
      for (let i = 0; i < d.length; i++) {
        if (String(d[i][0] || '').trim() === 'Socio:') {
          const nro = parseFloat(d[i][2]);
          if (nro === 1) ini = i;
          else if (ini >= 0 && i > ini) { fin = i; break; }
        }
      }
      if (ini < 0) { setError('No se encontró la sección del socio 1.'); return; }

      const regs = [];
      for (let i = ini + 1; i < fin; i++) {
        const minuta = parseFloat(d[i][0]);
        if (!isFinite(minuta)) continue;
        const cl = String(d[i][3] || '').trim();
        if (!cl) continue;
        const [campo, lote] = cl.includes(' - ')
          ? [cl.split(' - ')[0].trim(), cl.split(' - ').slice(1).join(' - ').trim()]
          : [cl, cl];
        regs.push({
          campana: CAMPANA, campo, lote, cultivo,
          concepto: 'laboreo',
          detalle: String(d[i][10] || '').trim(),
          cantidad: parseFloat(d[i][20]) || 0,
          unidad: 'ha',
          usd: parseFloat(d[i][25]) || 0,
        });
      }
      if (!regs.length) { setError('No se detectaron laboreos.'); return; }
      await supabase.from('mb_costo_lote').delete()
        .eq('campana', CAMPANA).eq('cultivo', cultivo).eq('concepto', 'laboreo');
      const { error: err } = await supabase.from('mb_costo_lote').insert(regs);
      if (err) { setError('Error: ' + err.message); return; }
      setMsg(`✓ Laboreos ${cultivo}: ${regs.length} registros.`);
      cargarTodo();
    } catch (err) { setError('No se pudo leer el archivo.'); }
  };

  const impProductos = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setError(''); setMsg('');
    if (siembra.length === 0) {
      setError('Importá primero el plan de siembra: define qué lotes son de GDL.');
      return;
    }
    try {
      const wb = await leerArchivo(file);
      const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const lotesGdl = new Set(
        siembra.filter(s => norm(s.cultivo) === cultivo)
          .map(s => norm(s.campo) + '|' + norm(s.lote))
      );
      const regs = [];
      for (let i = 7; i < d.length; i++) {
        const cl = String(d[i][3] || '').trim();
        const prod = String(d[i][13] || '').trim();
        if (!cl || !prod) continue;
        const [campo, lote] = cl.includes(' - ')
          ? [cl.split(' - ')[0].trim(), cl.split(' - ').slice(1).join(' - ').trim()]
          : [cl, cl];
        regs.push({
          campana: CAMPANA, campo, lote, cultivo,
          concepto: 'producto', detalle: prod,
          cantidad: parseFloat(d[i][21]) || 0,
          unidad: 'kg/lt',
          usd: parseFloat(d[i][32]) || 0,
          _k: norm(campo) + '|' + norm(lote),
        });
      }
      const filtrados = regs.filter(r => lotesGdl.has(r._k)).map(({ _k, ...r }) => r);
      if (!filtrados.length) {
        setError(`Ningún lote del archivo coincide con los ${lotesGdl.size} lotes de GDL para ${cultivo}.`);
        return;
      }
      await supabase.from('mb_costo_lote').delete()
        .eq('campana', CAMPANA).eq('cultivo', cultivo).eq('concepto', 'producto');
      const { error: err } = await supabase.from('mb_costo_lote').insert(filtrados);
      if (err) { setError('Error: ' + err.message); return; }
      setMsg(`✓ Productos ${cultivo}: ${filtrados.length} de ${regs.length} filas (resto de otras firmas).`);
      cargarTodo();
    } catch (err) { setError('No se pudo leer el archivo.'); }
  };

  const cultivosCargados = Array.from(new Set(siembra.map(s => norm(s.cultivo)))).sort();

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>Ganados Don Luis S.A.</div>
          <div style={s.headerSub}>Margen bruto por lote · Campaña {CAMPANA}</div>
        </div>
        <div style={s.headerDer}>
          <button style={s.versionBtn} onClick={() => navigate('/inicio')}>← Inicio</button>
          <span style={s.versionBtn}>v{APP_VERSION}</span>
        </div>
      </div>

      <div style={s.tabs}>
        {[['resultado', 'Resultado'], ['fisico', 'Producción física'],
          ['parametros', 'Parámetros'], ['datos', 'Importar datos']]
          .map(([k, l]) => (
            <button key={k} style={tab === k ? s.tabActive : s.tab} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
      </div>

      <div style={s.content}>

        <div style={s.barra}>
          <span style={s.label}>CULTIVO</span>
          <div style={s.grupo}>
            {(cultivosCargados.length ? cultivosCargados : ['MAIZ']).map(c => (
              <button key={c} style={cultivo === c ? s.btnActive : s.btnOff}
                onClick={() => setCultivo(c)}>{c}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <span style={s.label}>BASE</span>
          <div style={s.grupo}>
            <button style={baseHa === 'sembrada' ? s.btnActive : s.btnOff}
              onClick={() => setBaseHa('sembrada')}>ha sembrada</button>
            <button style={baseHa === 'cosechada' ? s.btnActive : s.btnOff}
              onClick={() => setBaseHa('cosechada')}>ha cosechada</button>
          </div>
        </div>

        {msg && <div style={s.msgOk}>{msg}</div>}
        {error && <div style={s.msgError}>{error}</div>}

        {/* ── RESULTADO ── */}
        {tab === 'resultado' && (
          cargando ? <div style={s.loading}>Cargando…</div>
          : lotes.length === 0 ? (
            <div style={s.empty}>
              No hay datos de {cultivo}. Importá el plan de siembra en la pestaña “Importar datos”.
            </div>
          ) : (
            <>
              <div style={s.kpis}>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>SUPERFICIE</div>
                  <div style={s.kpiVal}>{n1(haTot)}</div>
                  <div style={s.kpiNota}>hectáreas {baseHa}s</div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>RINDE CAMPO</div>
                  <div style={s.kpiVal}>{n1(haTot > 0 ? kgCampoT / haTot / 100 : 0)}</div>
                  <div style={s.kpiNota}>qq/ha · neto {n1(haTot > 0 ? kgNetoT / haTot / 100 : 0)}</div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>MARGEN BRUTO</div>
                  <div style={{ ...s.kpiVal, color: T('mb') >= 0 ? COLOR.ok : COLOR.alerta }}>
                    {n0(haTot > 0 ? T('mb') / haTot : 0)}
                  </div>
                  <div style={s.kpiNota}>U$S/ha · total {n0(T('mb'))}</div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>RINDE INDIFERENCIA</div>
                  <div style={s.kpiVal}>
                    {n1(precio > 0 && haTot > 0
                      ? (sumLab + sumProd - T('cos') - T('agr') - T('seg') - T('arr'))
                        / precio * 1000 / haTot / 100
                      : 0)}
                  </div>
                  <div style={s.kpiNota}>qq/ha para cubrir directos</div>
                </div>
              </div>

              <div style={s.tableCard}>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Concepto</th>
                        <th style={s.thU}>Unidad</th>
                        {calc.map(l => (
                          <th key={l.campo + l.lote} style={s.thR}>
                            {l.lote}
                            <div style={s.thSub}>{n1(l.ha)} ha</div>
                          </th>
                        ))}
                        <th style={s.thR}>TOTAL</th>
                        <th style={s.thR}>U$S/ha</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td colSpan={calc.length + 4} style={s.seccion}>CANTIDADES FÍSICAS</td></tr>
                      {filasFisicas.map((f, i) => {
                        const tot = f.prom
                          ? (haTot > 0 ? kgNetoT / haTot / 100 : 0)
                          : calc.reduce((a, l) => a + f.v(l), 0);
                        const fmtN = f.d === 0 ? n0 : n1;
                        return (
                          <tr key={f.l} style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
                            <td style={s.tdL}>{f.l}</td>
                            <td style={s.tdU}>{f.u}</td>
                            {calc.map(l => (
                              <td key={l.campo + l.lote} style={s.tdR}>{fmtN(f.v(l))}</td>
                            ))}
                            <td style={s.tdR}>{fmtN(tot)}</td>
                            <td style={s.tdR}>—</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td style={s.tdL}>Precio de valorización</td>
                        <td style={s.tdU}>U$S/tn</td>
                        <td colSpan={calc.length} style={s.tdRprecio}>{n2(precio)}</td>
                        <td style={s.tdR}>{n2(precio)}</td>
                        <td style={s.tdR}>—</td>
                      </tr>
                      <tr><td colSpan={calc.length + 4} style={s.seccion}>RESULTADO ECONÓMICO</td></tr>
                      {filasCascada.map((f, i) => {
                        const tot = calc.reduce((a, l) => a + f.v(l), 0);
                        const est = f.total
                          ? (f.destaca ? s.trDestaca : s.trTotal)
                          : { background: i % 2 === 0 ? COLOR.papel : COLOR.fila };
                        const tdL = f.total ? (f.destaca ? s.tdDestacaL : s.tdTotalL) : s.tdL;
                        const tdR = f.total ? (f.destaca ? s.tdDestacaR : s.tdTotalR) : s.tdR;
                        return (
                          <tr key={f.l} style={est}>
                            <td style={{ ...tdL, paddingLeft: f.sub ? '26px' : '11px' }}>{f.l}</td>
                            <td style={f.total ? { ...tdR, textAlign: 'left' } : s.tdU}>U$S</td>
                            {calc.map(l => (
                              <td key={l.campo + l.lote} style={tdR}>{n0(f.v(l))}</td>
                            ))}
                            <td style={tdR}>{n0(tot)}</td>
                            <td style={tdR}>{n0(haTot > 0 ? tot / haTot : 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={s.nota}>
                Indirectos repartidos con coeficiente {n2(coef * 100)}% ({n1(haCultivo)} de {n1(haEstivales)} ha
                estivales). Arrendamiento asignado por campo según ocupación: los campos con un solo ciclo
                cargan el total, los de doble ciclo la mitad.
              </div>
            </>
          )
        )}

        {/* ── FÍSICO ── */}
        {tab === 'fisico' && (
          lotes.length === 0 ? (
            <div style={s.empty}>Importá el plan de siembra y la cosecha de {cultivo}.</div>
          ) : (
            <>
              <div style={s.kpis}>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>KG DE CAMPO</div>
                  <div style={s.kpiVal}>{n0(kgCampoT)}</div>
                  <div style={s.kpiNota}>{n1(kgCampoT / 1000)} toneladas</div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>KG NETOS</div>
                  <div style={s.kpiVal}>{n0(kgNetoT)}</div>
                  <div style={s.kpiNota}>{n1(kgNetoT / 1000)} toneladas</div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>MERMA</div>
                  <div style={{ ...s.kpiVal, color: COLOR.alerta }}>
                    {n0(kgCampoT - kgNetoT)}
                  </div>
                  <div style={s.kpiNota}>
                    {kgCampoT > 0 ? n2((1 - kgNetoT / kgCampoT) * 100) : '—'}% del campo
                  </div>
                </div>
                <div style={s.kpi}>
                  <div style={s.kpiLabel}>RINDE NETO</div>
                  <div style={s.kpiVal}>{n1(haTot > 0 ? kgNetoT / haTot / 100 : 0)}</div>
                  <div style={s.kpiNota}>qq/ha · campo {n1(haTot > 0 ? kgCampoT / haTot / 100 : 0)}</div>
                </div>
              </div>

              <div style={s.tableCard}>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Campo / Lote</th>
                        <th style={s.thR}>ha sembr.</th>
                        <th style={s.thR}>ha cosech.</th>
                        <th style={s.thR}>kg campo</th>
                        <th style={s.thR}>kg netos</th>
                        <th style={s.thR}>merma kg</th>
                        <th style={s.thR}>merma %</th>
                        <th style={s.thR}>qq/ha campo</th>
                        <th style={s.thR}>qq/ha neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.map((l, i) => (
                        <tr key={l.campo + l.lote}
                          style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
                          <td style={s.tdL}>
                            <span style={s.campoTag}>{l.campo}</span> {l.lote}
                            {l.haCos < l.haSem && (
                              <span style={s.badgeImprod}>
                                {n1(l.haSem - l.haCos)} ha sin cosechar
                              </span>
                            )}
                          </td>
                          <td style={s.tdR}>{n1(l.haSem)}</td>
                          <td style={s.tdR}>{n1(l.haCos)}</td>
                          <td style={s.tdR}>{n0(l.kgCampo)}</td>
                          <td style={s.tdR}>{n0(l.kgNeto)}</td>
                          <td style={{ ...s.tdR, color: COLOR.alerta }}>
                            {n0(l.kgCampo - l.kgNeto)}
                          </td>
                          <td style={s.tdR}>
                            {l.kgCampo > 0 ? n2((1 - l.kgNeto / l.kgCampo) * 100) : '—'}
                          </td>
                          <td style={s.tdR}>{n1(l.ha > 0 ? l.kgCampo / l.ha / 100 : 0)}</td>
                          <td style={s.tdR}>{n1(l.ha > 0 ? l.kgNeto / l.ha / 100 : 0)}</td>
                        </tr>
                      ))}
                      <tr style={s.trDestaca}>
                        <td style={s.tdDestacaL}>TOTAL {cultivo}</td>
                        <td style={s.tdDestacaR}>{n1(calc.reduce((a, l) => a + l.haSem, 0))}</td>
                        <td style={s.tdDestacaR}>{n1(calc.reduce((a, l) => a + l.haCos, 0))}</td>
                        <td style={s.tdDestacaR}>{n0(kgCampoT)}</td>
                        <td style={s.tdDestacaR}>{n0(kgNetoT)}</td>
                        <td style={s.tdDestacaR}>{n0(kgCampoT - kgNetoT)}</td>
                        <td style={s.tdDestacaR}>
                          {kgCampoT > 0 ? n2((1 - kgNetoT / kgCampoT) * 100) : '—'}
                        </td>
                        <td style={s.tdDestacaR}>{n1(haTot > 0 ? kgCampoT / haTot / 100 : 0)}</td>
                        <td style={s.tdDestacaR}>{n1(haTot > 0 ? kgNetoT / haTot / 100 : 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={s.card}>
                <div style={s.cardTitle}>Insumos aplicados · cantidades físicas</div>
                <div style={s.cardSub}>
                  Totales por producto sobre los lotes de {cultivo}. Las unidades son las que
                  registra MacroGest: kilos para sólidos, litros para líquidos.
                </div>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Producto</th>
                        <th style={s.thR}>Cantidad</th>
                        <th style={s.thR}>Por ha</th>
                        <th style={s.thR}>U$S</th>
                        <th style={s.thR}>U$S/ha</th>
                        <th style={s.thR}>Aplic.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const acum = {};
                        costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === 'producto')
                          .forEach(c => {
                            const k = c.detalle || '(sin nombre)';
                            if (!acum[k]) acum[k] = { cant: 0, usd: 0, n: 0 };
                            acum[k].cant += (c.cantidad || 0);
                            acum[k].usd += (c.usd || 0);
                            acum[k].n += 1;
                          });
                        const arr = Object.entries(acum).sort((a, b) => b[1].usd - a[1].usd);
                        if (!arr.length) return (
                          <tr><td colSpan={6} style={s.tdL}>Sin productos cargados.</td></tr>
                        );
                        return arr.map(([k, v], i) => (
                          <tr key={k} style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
                            <td style={s.tdL}>{k}</td>
                            <td style={s.tdR}>{n2(v.cant)}</td>
                            <td style={s.tdR}>{haTot > 0 ? n2(v.cant / haTot) : '—'}</td>
                            <td style={s.tdR}>{n0(v.usd)}</td>
                            <td style={s.tdR}>{haTot > 0 ? n2(v.usd / haTot) : '—'}</td>
                            <td style={s.tdR}>{v.n}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={s.card}>
                <div style={s.cardTitle}>Laboreos realizados</div>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.thL}>Laboreo</th>
                        <th style={s.thR}>Pasadas</th>
                        <th style={s.thR}>ha trabajadas</th>
                        <th style={s.thR}>U$S</th>
                        <th style={s.thR}>U$S/ha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const acum = {};
                        costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === 'laboreo')
                          .forEach(c => {
                            const k = c.detalle || '(sin detalle)';
                            if (!acum[k]) acum[k] = { ha: 0, usd: 0, n: 0 };
                            acum[k].ha += (c.cantidad || 0);
                            acum[k].usd += (c.usd || 0);
                            acum[k].n += 1;
                          });
                        const arr = Object.entries(acum).sort((a, b) => b[1].usd - a[1].usd);
                        if (!arr.length) return (
                          <tr><td colSpan={5} style={s.tdL}>Sin laboreos cargados.</td></tr>
                        );
                        return arr.map(([k, v], i) => (
                          <tr key={k} style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
                            <td style={s.tdL}>{k}</td>
                            <td style={s.tdR}>{v.n}</td>
                            <td style={s.tdR}>{n1(v.ha)}</td>
                            <td style={s.tdR}>{n0(v.usd)}</td>
                            <td style={s.tdR}>{v.ha > 0 ? n2(v.usd / v.ha) : '—'}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        )}

        {/* ── PARÁMETROS ── */}
        {tab === 'parametros' && (
          <>
            <div style={s.card}>
              <div style={s.cardTitle}>Parámetros económicos de {cultivo}</div>
              <div style={s.cardSub}>
                El precio valoriza la producción al momento de la cosecha, no cuando se vende.
                Modificar cualquier valor recalcula el margen al instante.
              </div>
              <div style={s.paramGrid}>
                {[
                  ['precio_usd_tn', 'Precio U$S/tn', 'number'],
                  ['comision_usd_tn', 'Comisión U$S/tn', 'number'],
                  ['flete_ars_tn', 'Flete AR$/tn', 'number'],
                  ['tc', 'Tipo de cambio', 'number'],
                  ['cosecha_pct', 'Cosecha (0,07 = 7%)', 'number'],
                  ['precio_fuente', 'Fuente del precio', 'text'],
                  ['precio_fecha', 'Fecha del precio', 'date'],
                ].map(([k, l, t]) => (
                  <div key={k} style={s.paramItem}>
                    <label style={s.paramLabel}>{l}</label>
                    <input style={s.input} type={t} step="any"
                      value={borrador[k] === null || borrador[k] === undefined ? '' : borrador[k]}
                      onChange={e => setBorrador(b => ({ ...b, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px' }}>
                <button style={s.btn} onClick={guardarParam}>Guardar parámetros</button>
                <span style={s.paramNota}>
                  Flete equivalente: {n2((parseFloat(borrador.flete_ars_tn) || 0) / (parseFloat(borrador.tc) || 1))} U$S/tn
                </span>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Gastos indirectos tomados del balance</div>
              <div style={s.cardSub}>
                Se leen de las cuentas configuradas en la tabla mb_cuentas_indirectas,
                sobre los meses de la campaña cargados en dólares.
              </div>
              <table style={s.tablaMini}>
                <tbody>
                  {[
                    ['Ing. agrónomo (423101)', indirectos.agronomo, agronCult],
                    ['Seguro agrícola (423103)', indirectos.seguro, seguroCult],
                    ['Arrendamiento (423102)', indirectos.arrendamiento, arrCult],
                    ['Estructura (44)', indirectos.estructura, estrucCult],
                  ].map(([l, tot, asig]) => (
                    <tr key={l}>
                      <td style={s.tdMini}>{l}</td>
                      <td style={s.tdMiniR}>{n0(tot)}</td>
                      <td style={s.tdMiniR}>
                        <span style={s.asignado}>{n0(asig)} a {cultivo}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── IMPORTAR ── */}
        {tab === 'datos' && (
          <>
            <div style={s.card}>
              <div style={s.cardTitle}>1 · Plan de siembra</div>
              <div style={s.cardSub}>
                Define qué lotes son de GDL y con qué superficie. Se lee la columna GDL de la solapa
                PLAN DE SIEMBRA DETALLADO. Es el primer archivo a cargar: el resto se filtra contra él.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impSiembra}
                style={{ display: 'none' }} id="f-siembra" />
              <label htmlFor="f-siembra" style={s.btn}>Subir plan de siembra</label>
              <span style={s.info}>{siembra.length} registros · {cultivosCargados.length} cultivos</span>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>2 · Cosecha de {cultivo}</div>
              <div style={s.cardSub}>
                Solapa RINDE X CAMPO. Toma los kilos de la columna GDL y prorratea los kilos de campo
                en la misma proporción.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impCosecha}
                style={{ display: 'none' }} id="f-cosecha" />
              <label htmlFor="f-cosecha" style={s.btn}>Subir cosecha</label>
              <span style={s.info}>
                {cosecha.filter(c => norm(c.cultivo) === cultivo).length} lotes cargados
              </span>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>3 · Laboreos de {cultivo}</div>
              <div style={s.cardSub}>
                Listado de Laboreos por Socios, en dólares. Se toma únicamente la sección del socio 1.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impLaboreos}
                style={{ display: 'none' }} id="f-laboreos" />
              <label htmlFor="f-laboreos" style={s.btn}>Subir laboreos</label>
              <span style={s.info}>
                {costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === 'laboreo').length} registros
                · {n0(sumLab)} U$S
              </span>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>4 · Productos aplicados de {cultivo}</div>
              <div style={s.cardSub}>
                Listado Total de Productos Aplicados. Trae lotes de todas las firmas: se filtran
                contra los lotes del plan de siembra de GDL.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impProductos}
                style={{ display: 'none' }} id="f-productos" />
              <label htmlFor="f-productos" style={s.btn}>Subir productos</label>
              <span style={s.info}>
                {costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === 'producto').length} registros
                · {n0(sumProd)} U$S
              </span>
            </div>
          </>
        )}

        <div style={s.pie}>{APP_NOMBRE} v{APP_VERSION}</div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: COLOR.fondo, fontFamily: FUENTE.ui },
  header: { background: COLOR.oscuro, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
  headerTitle: { fontSize: '17px', color: COLOR.bronceClaro, fontFamily: FUENTE.titulo },
  headerSub: { fontSize: '10px', color: '#A79883', marginTop: '2px', letterSpacing: '0.08em' },
  headerDer: { display: 'flex', alignItems: 'center', gap: '8px' },
  versionBtn: { padding: '4px 11px', fontSize: '10px', fontFamily: FUENTE.ui, background: 'transparent', color: COLOR.bronceClaro, border: '1px solid #4A3E32', borderRadius: '2px', cursor: 'pointer', letterSpacing: '0.08em' },
  tabs: { background: COLOR.medio, display: 'flex' },
  tab: { padding: '9px 22px', fontSize: '12px', color: '#8E8069', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: FUENTE.ui },
  tabActive: { padding: '9px 22px', fontSize: '12px', fontWeight: '600', color: COLOR.bronceClaro, background: 'none', border: 'none', borderBottom: `2px solid ${COLOR.bronce}`, cursor: 'pointer', fontFamily: FUENTE.ui },
  content: { padding: '20px 24px' },
  barra: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  label: { fontSize: '9px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.12em' },
  grupo: { display: 'flex', gap: '4px' },
  btnOff: { padding: '4px 12px', fontSize: '11px', background: '#F0EDE4', color: COLOR.textoSuave, border: `1px solid ${COLOR.borde}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  btnActive: { padding: '4px 12px', fontSize: '11px', fontWeight: '700', background: COLOR.oscuro, color: COLOR.bronceClaro, border: `1px solid ${COLOR.oscuro}`, borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  card: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', padding: '18px 22px', marginBottom: '14px' },
  cardTitle: { fontSize: '15px', color: COLOR.oscuro, fontFamily: FUENTE.titulo, marginBottom: '6px' },
  cardSub: { fontSize: '11.5px', color: COLOR.textoSuave, lineHeight: '1.7', marginBottom: '14px' },
  btn: { display: 'inline-block', padding: '8px 18px', background: COLOR.oscuro, color: COLOR.bronceClaro, borderRadius: '2px', fontSize: '11px', cursor: 'pointer', border: 'none', fontFamily: FUENTE.ui, letterSpacing: '0.1em' },
  info: { marginLeft: '12px', fontSize: '11px', color: COLOR.textoTenue },
  msgOk: { padding: '9px 13px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '2px', fontSize: '12px', marginBottom: '12px' },
  msgError: { padding: '9px 13px', background: COLOR.alertaFondo, color: COLOR.alerta, borderRadius: '2px', fontSize: '12px', marginBottom: '12px' },
  kpis: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' },
  kpi: { flex: '1 1 140px', background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', padding: '12px 14px', minWidth: '140px' },
  kpiLabel: { fontSize: '8.5px', color: COLOR.textoTenue, letterSpacing: '0.12em', marginBottom: '5px' },
  kpiVal: { fontSize: '22px', fontWeight: '600', color: COLOR.texto, fontVariantNumeric: 'tabular-nums' },
  kpiNota: { fontSize: '10px', color: COLOR.textoTenue, marginTop: '3px' },
  tableCard: { background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px', overflow: 'hidden' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
  thL: { background: COLOR.oscuro, color: '#FFF', padding: '8px 11px', textAlign: 'left', fontSize: '9.5px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '500' },
  thR: { background: COLOR.oscuro, color: '#FFF', padding: '8px 11px', textAlign: 'right', fontSize: '9.5px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '500' },
  thSub: { fontSize: '8.5px', color: '#A79883', fontWeight: '400', marginTop: '2px' },
  tdL: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, color: COLOR.texto, whiteSpace: 'nowrap' },
  tdR: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, textAlign: 'right', color: COLOR.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  trTotal: { background: '#EFE8DA' },
  tdTotalL: { padding: '6px 11px', color: COLOR.texto, fontWeight: '600', fontSize: '11px', borderTop: `1px solid ${COLOR.borde}`, whiteSpace: 'nowrap' },
  tdTotalR: { padding: '6px 11px', textAlign: 'right', color: COLOR.texto, fontWeight: '600', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${COLOR.borde}`, whiteSpace: 'nowrap' },
  trDestaca: { background: COLOR.medio },
  tdDestacaL: { padding: '8px 11px', color: '#FFF', fontWeight: '600', fontSize: '11.5px', whiteSpace: 'nowrap' },
  tdDestacaR: { padding: '8px 11px', textAlign: 'right', color: COLOR.bronceClaro, fontWeight: '600', fontSize: '11.5px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  nota: { fontSize: '10.5px', color: COLOR.textoTenue, marginTop: '10px', lineHeight: '1.6' },
  paramGrid: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  paramItem: { flex: '1 1 150px', minWidth: '150px' },
  paramLabel: { display: 'block', fontSize: '9px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.1em', marginBottom: '5px' },
  input: { width: '100%', padding: '7px 10px', fontSize: '12px', border: `1px solid ${COLOR.borde}`, borderRadius: '2px', fontFamily: FUENTE.ui, background: COLOR.papel, color: COLOR.texto, outline: 'none', boxSizing: 'border-box' },
  paramNota: { marginLeft: '12px', fontSize: '11px', color: COLOR.textoTenue },
  tablaMini: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  tdMini: { padding: '6px 0', borderBottom: `1px solid ${COLOR.linea}`, color: COLOR.texto },
  tdMiniR: { padding: '6px 0', borderBottom: `1px solid ${COLOR.linea}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  asignado: { fontSize: '10.5px', padding: '2px 9px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '999px', marginLeft: '10px' },
  loading: { textAlign: 'center', padding: '44px', color: COLOR.textoTenue, fontSize: '12px' },
  empty: { textAlign: 'center', padding: '44px', color: COLOR.textoTenue, fontSize: '12px', background: COLOR.papel, border: `1px solid ${COLOR.borde}`, borderRadius: '3px' },
  pie: { fontSize: '9px', color: COLOR.textoTenue, textAlign: 'center', letterSpacing: '0.2em', marginTop: '26px' },
  campoTag: { fontSize: '9.5px', color: COLOR.textoTenue, letterSpacing: '0.06em', marginRight: '7px' },
  badgeImprod: { marginLeft: '8px', fontSize: '9px', padding: '1px 7px', background: COLOR.alertaFondo, color: COLOR.alerta, borderRadius: '999px' },
  thU: { background: COLOR.oscuro, color: '#A79883', padding: '8px 11px', textAlign: 'left', fontSize: '9px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '400' },
  tdU: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, color: COLOR.textoTenue, fontSize: '10px', whiteSpace: 'nowrap' },
  tdRprecio: { padding: '5px 11px', borderBottom: `1px solid ${COLOR.linea}`, textAlign: 'center', color: COLOR.textoSuave, fontVariantNumeric: 'tabular-nums', fontStyle: 'italic' },
  seccion: { background: '#4A3520', color: '#E6C070', padding: '5px 11px', fontWeight: '600', fontSize: '9.5px', letterSpacing: '0.1em' },
};
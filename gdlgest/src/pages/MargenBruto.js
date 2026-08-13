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
  const [arriendos, setArriendos] = useState([]);
  const [manuales, setManuales] = useState({});
  const [bArr, setBArr] = useState({});
  const [bMan, setBMan] = useState({});

  const cargarIndirectosManual = useCallback(async () => {
    const [a, m] = await Promise.all([
      supabase.from('mb_arrendamiento').select('*').eq('campana', CAMPANA),
      supabase.from('mb_indirecto_manual').select('*')
        .eq('campana', CAMPANA).eq('cultivo', cultivo),
    ]);
    setArriendos(a.data || []);
    const mm = {};
    (m.data || []).forEach(x => { mm[x.concepto] = x; });
    setManuales(mm);
    setBMan({
      agronomo: (m.data || []).find(x => x.concepto === 'agronomo') || { importe: 0, excluido: true },
      seguro: (m.data || []).find(x => x.concepto === 'seguro') || { importe: 0, excluido: true },
      estructura: (m.data || []).find(x => x.concepto === 'estructura') || { importe: 0, excluido: true },
    });
  }, [cultivo]);

  const guardarArr = async (campo) => {
    const b = bArr[campo] || {};
    const { error: err } = await supabase.from('mb_arrendamiento').upsert({
      campana: CAMPANA, campo,
      propio: !!b.propio,
      importe_usd: parseFloat(b.importe_usd) || 0,
      modalidad: b.modalidad || null,
      nota: b.nota || null,
    }, { onConflict: 'campana,campo' });
    if (err) { setError('Error: ' + err.message); return; }
    setMsg(`Arrendamiento de ${campo} guardado.`);
    cargarIndirectosManual();
  };

  const guardarMan = async (concepto) => {
    const b = bMan[concepto] || {};
    const { error: err } = await supabase.from('mb_indirecto_manual').upsert({
      campana: CAMPANA, cultivo, concepto,
      importe: parseFloat(b.importe) || 0,
      excluido: !!b.excluido,
      nota: b.nota || null,
    }, { onConflict: 'campana,cultivo,concepto' });
    if (err) { setError('Error: ' + err.message); return; }
    setMsg(`${concepto} actualizado.`);
    cargarIndirectosManual();
  };

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
  useEffect(() => { cargarIndirectosManual(); }, [cargarIndirectosManual]);

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

  // arrendamiento por cultivo, según ocupación del campo
  const arrPorCultivo = {};
  Object.entries(fisicaPorCampo).forEach(([campo, haF]) => {
    const delCampo = siembra.filter(s => s.campo === campo);
    const hayE = delCampo.some(s => esEstival(s.cultivo));
    const hayI = delCampo.some(s => !esEstival(s.cultivo));
    const reg = arriendos.find(x => norm(x.campo) === norm(campo));
    const arr = reg ? Number(reg.importe_usd || 0) : 0;
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

  // Los lotes se arman con lo que hay cargado de este cultivo:
  // laboreos y productos (ya filtrados a GDL) más la cosecha.
  const lotes = (() => {
    const mapa = {};
    const clave = (campo, lote) => campo + '|' + lote;

    costos.filter(c => norm(c.cultivo) === cultivo).forEach(c => {
      const k = clave(c.campo, c.lote);
      if (!mapa[k]) mapa[k] = { campo: c.campo, lote: c.lote, haLab: 0,
        kgCampo: 0, kgNeto: 0, laboreos: 0, productos: 0 };
      if (c.concepto === 'laboreo') {
        mapa[k].laboreos += (c.usd || 0);
        mapa[k].haLab = Math.max(mapa[k].haLab, c.cantidad || 0);
      } else {
        mapa[k].productos += (c.usd || 0);
      }
    });

    cosecha.filter(c => norm(c.cultivo) === cultivo).forEach(c => {
      const k = clave(c.campo, c.lote);
      if (!mapa[k]) mapa[k] = { campo: c.campo, lote: c.lote, haLab: 0,
        kgCampo: 0, kgNeto: 0, laboreos: 0, productos: 0 };
      mapa[k].kgCampo += (c.kg_campo || 0);
      mapa[k].kgNeto += (c.kg_neto || 0);
    });

    return Object.values(mapa).map(l => {
      const s = siembra.find(x => x.campo === l.campo && x.lote === l.lote
        && norm(x.cultivo) === cultivo);
      const haSem = (s && s.ha_sembrada) || l.haLab || 0;
      const haCos = (s && s.ha_cosechada) || haSem;
      return { ...l, haSem, haCos,
        ha: baseHa === 'cosechada' ? haCos : haSem };
    }).sort((a, b) => (a.campo + a.lote).localeCompare(b.campo + b.lote));
  })();

  const P = param || {};
  const precio = P.precio_usd_tn || 0;
  const comision = P.comision_usd_tn || 0;
  const tc = P.tc || 1;
  const fleteUsd = (P.flete_ars_tn || 0) / tc;
  const cosPct = P.cosecha_pct || 0;

  const haTot = lotes.reduce((a, l) => a + l.ha, 0);
  const man = (c) => {
    const m = manuales[c];
    if (!m || m.excluido) return 0;
    return Number(m.importe || 0);
  };
  const agronCult = man('agronomo');
  const seguroCult = man('seguro');
  const estrucCult = man('estructura');
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
      const wb = await leerArchivo(file);

      // El mismo archivo trae la solapa de lotes: se carga de paso.
      let lista = [];
      const hojaLotes = wb.SheetNames.find(n => norm(n).includes('SIEMBRA'));
      if (hojaLotes) {
        const dl = XLSX.utils.sheet_to_json(wb.Sheets[hojaLotes], { header: 1, defval: '' });
        let fh = -1, cg = -1;
        for (let i = 0; i < Math.min(8, dl.length); i++) {
          const idx = dl[i].findIndex(c => norm(c) === 'GDL');
          if (idx >= 0) { fh = i; cg = idx; }
        }
        if (cg >= 0) {
          const rl = [];
          let campoL = '';
          for (let i = fh + 1; i < dl.length; i++) {
            if (dl[i][0] && String(dl[i][0]).trim()) campoL = String(dl[i][0]).trim();
            const lo = String(dl[i][8] || '').trim();
            const cu = String(dl[i][9] || '').trim();
            const ha = parseFloat(dl[i][cg]);
            if (!cu || !lo || !isFinite(ha) || ha <= 0 || !/[A-Z]/i.test(cu)) continue;
            rl.push({
              campana: CAMPANA, campo: campoL, lote: lo, cultivo: norm(cu),
              ciclo: ESTIVALES.includes(norm(cu)) ? 'estival' : 'invernal',
              ha_sembrada: ha, ha_cosechada: ha,
              nombre_archivo: file.name, importado_at: new Date().toISOString(),
            });
          }
          if (rl.length) {
            await supabase.from('mb_siembra').delete().eq('campana', CAMPANA);
            await supabase.from('mb_siembra').insert(rl);
            lista = rl;
          }
        }
      }
      if (!lista.length) {
        const { data: sdb } = await supabase
          .from('mb_siembra').select('*').eq('campana', CAMPANA);
        lista = sdb || [];
      }
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
        let loteRaw = String(d[i][iLote] || '').trim();
        // Algunas planillas usan esa columna para un estado, no para el lote
        if (!loteRaw || /^(CERRAD[OA]|ABIERT[OA]|LIQUIDAD[OA]|SI|NO)$/i.test(loteRaw)) {
          loteRaw = campo;
        }
        regs.push({
          campana: CAMPANA, campo,
          lote: emparejarLote(campo, loteRaw, lista),
          cultivo: cultivo,
          fecha_cosecha: null,
          kg_campo: Math.round(kgC * prop),
          kg_neto: Math.round(gdl),
          nombre_archivo: file.name, importado_at: new Date().toISOString(),
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
          nombre_archivo: file.name, importado_at: new Date().toISOString(),
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
    const lotesGdlPrevios = new Set([
      ...siembra.filter(s => norm(s.cultivo) === cultivo)
        .map(s => norm(s.campo) + '|' + norm(s.lote)),
      ...costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === 'laboreo')
        .map(c => norm(c.campo) + '|' + norm(c.lote)),
    ]);
    if (lotesGdlPrevios.size === 0) {
      setError('Importá primero los laboreos: definen qué lotes son de GDL para este cultivo.');
      return;
    }
    try {
      const wb = await leerArchivo(file);
      const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const lotesGdl = lotesGdlPrevios;
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
          nombre_archivo: file.name, importado_at: new Date().toISOString(),
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

  // Devuelve el archivo cargado para un paso, con sus filas y fecha
  const archivoDe = (origen) => {
    let filas = [];
    if (origen === 'siembra') filas = siembra.filter(s => norm(s.cultivo) === cultivo);
    else if (origen === 'cosecha') filas = cosecha.filter(c => norm(c.cultivo) === cultivo);
    else filas = costos.filter(c => norm(c.cultivo) === cultivo && c.concepto === origen);
    if (!filas.length) return null;
    const nom = filas.find(f => f.nombre_archivo);
    const fechas = filas.map(f => f.importado_at).filter(Boolean).sort();
    return {
      nombre: nom ? nom.nombre_archivo : '(cargado antes del registro de archivos)',
      filas: filas.length,
      fecha: fechas.length ? fechas[fechas.length - 1] : null,
      usd: filas.reduce((a, f) => a + (f.usd || 0), 0),
    };
  };

  const Cargado = ({ origen, unidad }) => {
    const a = archivoDe(origen);
    if (!a) return <div style={s.sinCargar}>Sin cargar</div>;
    return (
      <div style={s.cargado}>
        <span style={s.checkOk}>✓</span>
        <span style={s.archivoNom}>{a.nombre}</span>
        <span style={s.archivoMeta}>
          {a.filas} {unidad}
          {a.usd ? ` · ${n0(a.usd)} U$S` : ''}
          {a.fecha ? ` · ${new Date(a.fecha).toLocaleDateString('es-AR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>
    );
  };

  const archivos = (() => {
    const g = {};
    const sumar = (origen, filas, extra) => {
      filas.forEach(f => {
        const nom = f.nombre_archivo || '(sin registro de archivo)';
        const k = origen + '|' + nom + '|' + (extra ? f.cultivo : '');
        if (!g[k]) g[k] = {
          origen, nombre: nom, cultivo: extra ? f.cultivo : null,
          filas: 0, fecha: f.importado_at || null,
        };
        g[k].filas += 1;
        if (f.importado_at && (!g[k].fecha || f.importado_at > g[k].fecha)) {
          g[k].fecha = f.importado_at;
        }
      });
    };
    sumar('Plan de siembra', siembra, false);
    sumar('Cosecha', cosecha, true);
    sumar('Laboreos', costos.filter(c => c.concepto === 'laboreo'), true);
    sumar('Productos aplicados', costos.filter(c => c.concepto === 'producto'), true);
    return Object.values(g).sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || ''));
  })();

  const borrarOrigen = async (a) => {
    if (!window.confirm(`¿Eliminar los datos de ${a.nombre}${a.cultivo ? ' · ' + a.cultivo : ''}?`)) return;
    if (a.origen === 'Plan de siembra') {
      await supabase.from('mb_siembra').delete().eq('campana', CAMPANA);
    } else if (a.origen === 'Cosecha') {
      await supabase.from('mb_cosecha').delete()
        .eq('campana', CAMPANA).eq('cultivo', a.cultivo);
    } else {
      const con = a.origen === 'Laboreos' ? 'laboreo' : 'producto';
      await supabase.from('mb_costo_lote').delete()
        .eq('campana', CAMPANA).eq('cultivo', a.cultivo).eq('concepto', con);
    }
    setMsg(`Se eliminaron los datos de ${a.nombre}.`);
    cargarTodo();
  };

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
          ['indirectos', 'Indirectos'], ['parametros', 'Parámetros'],
          ['datos', 'Importar datos']]
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

        {/* ── INDIRECTOS ── */}
        {tab === 'indirectos' && (
          <>
            <div style={s.card}>
              <div style={s.cardTitle}>Arrendamiento por campo</div>
              <div style={s.cardSub}>
                Cada campo tiene su propio valor. El sistema lo reparte según la ocupación:
                si el campo tuvo un solo ciclo, ese cultivo carga el total; si tuvo invierno
                y verano, se divide por mitades. Dentro del ciclo, por hectárea.
              </div>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.thL}>Campo</th>
                      <th style={s.thC}>Propio</th>
                      <th style={s.thR}>ha físicas</th>
                      <th style={s.thL}>Cultivos del año</th>
                      <th style={s.thR}>Arrendamiento U$S</th>
                      <th style={s.thL}>Modalidad</th>
                      <th style={s.thL}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(fisicaPorCampo).sort().map(([campo, haF], i) => {
                      const reg = arriendos.find(x => norm(x.campo) === norm(campo)) || {};
                      const b = bArr[campo] || {
                        propio: reg.propio || false,
                        importe_usd: reg.importe_usd ?? '',
                        modalidad: reg.modalidad || '',
                      };
                      const cul = siembra.filter(x => x.campo === campo).map(x => x.cultivo);
                      const ciclos = new Set(cul.map(c => esEstival(c) ? 'V' : 'I'));
                      return (
                        <tr key={campo} style={{ background: i % 2 === 0 ? COLOR.papel : COLOR.fila }}>
                          <td style={s.tdL}>{campo}</td>
                          <td style={s.tdC}>
                            <input type="checkbox" checked={!!b.propio}
                              onChange={e => setBArr(x => ({ ...x, [campo]: { ...b, propio: e.target.checked } }))} />
                          </td>
                          <td style={s.tdR}>{n1(haF)}</td>
                          <td style={s.tdL}>
                            {Array.from(new Set(cul)).join(' · ')}
                            <span style={ciclos.size > 1 ? s.pillDoble : s.pillSimple}>
                              {ciclos.size > 1 ? '2 ciclos · 50/50' : '1 ciclo · 100%'}
                            </span>
                          </td>
                          <td style={s.tdR}>
                            <input style={s.inputMini} type="number" step="any"
                              disabled={b.propio}
                              value={b.propio ? '' : b.importe_usd}
                              onChange={e => setBArr(x => ({ ...x, [campo]: { ...b, importe_usd: e.target.value } }))} />
                          </td>
                          <td style={s.tdL}>
                            <input style={s.inputMini} placeholder="qq/ha, fijo…"
                              value={b.modalidad}
                              onChange={e => setBArr(x => ({ ...x, [campo]: { ...b, modalidad: e.target.value } }))} />
                          </td>
                          <td style={s.tdL}>
                            <button style={s.btnMini2} onClick={() => guardarArr(campo)}>guardar</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={s.trDestaca}>
                      <td style={s.tdDestacaL} colSpan={4}>TOTAL CARGADO</td>
                      <td style={s.tdDestacaR}>
                        {n0(arriendos.reduce((a, x) => a + Number(x.importe_usd || 0), 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={s.nota}>
                Control contable: la cuenta 423102 del balance acumula {n0(indirectos.arrendamiento)} U$S
                en los meses cargados. Si la suma de arriba difiere mucho, revisar.
                Asignado a {cultivo}: <strong>{n0(arrCult)} U$S</strong>.
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Otros indirectos de {cultivo}</div>
              <div style={s.cardSub}>
                Importes cargados a mano mientras se define el criterio. Marcados como excluidos
                no impactan en el margen.
              </div>
              {[['agronomo', 'Ing. agrónomo', indirectos.agronomo],
                ['seguro', 'Seguro agrícola', indirectos.seguro],
                ['estructura', 'Estructura', indirectos.estructura]].map(([k, l, ref]) => {
                const b = bMan[k] || {};
                return (
                  <div key={k} style={s.manFila}>
                    <span style={s.manLabel}>{l}</span>
                    <label style={s.check}>
                      <input type="checkbox" checked={!!b.excluido}
                        onChange={e => setBMan(x => ({ ...x, [k]: { ...b, excluido: e.target.checked } }))}
                        style={{ marginRight: '5px' }} />
                      Excluir
                    </label>
                    <input style={s.inputMini} type="number" step="any" disabled={!!b.excluido}
                      value={b.excluido ? '' : (b.importe ?? '')}
                      onChange={e => setBMan(x => ({ ...x, [k]: { ...b, importe: e.target.value } }))} />
                    <input style={{ ...s.inputMini, flex: 1 }} placeholder="Nota"
                      value={b.nota || ''}
                      onChange={e => setBMan(x => ({ ...x, [k]: { ...b, nota: e.target.value } }))} />
                    <span style={s.manRef}>balance: {n0(ref)}</span>
                    <button style={s.btnMini2} onClick={() => guardarMan(k)}>guardar</button>
                  </div>
                );
              })}
            </div>
          </>
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
            <div style={s.avisoCultivo}>
              Estás cargando datos de <strong>{cultivo}</strong>. Los pasos 2, 3 y 4 guardan
              en ese cultivo: cambialo arriba antes de subir archivos de otro.
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>1 · Cosecha de {cultivo}</div>
              <div style={s.cardSub}>
                Archivo de cosecha del cultivo. Toma los kilos de la columna GDL de la solapa
                RINDE X CAMPO, y de paso actualiza el listado de lotes y superficies desde la
                solapa de siembra del mismo archivo.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impCosecha}
                style={{ display: 'none' }} id="f-cosecha" />
              <label htmlFor="f-cosecha" style={s.btn}>
                {archivoDe('cosecha') ? 'Reemplazar cosecha' : 'Subir cosecha'}
              </label>
              <Cargado origen="cosecha" unidad="lotes" />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>2 · Laboreos de {cultivo}</div>
              <div style={s.cardSub}>
                Listado de Laboreos por Socios, en dólares. Se toma únicamente la sección del socio 1.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impLaboreos}
                style={{ display: 'none' }} id="f-laboreos" />
              <label htmlFor="f-laboreos" style={s.btn}>
                {archivoDe('laboreo') ? 'Reemplazar laboreos' : 'Subir laboreos'}
              </label>
              <Cargado origen="laboreo" unidad="registros" />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>3 · Productos aplicados de {cultivo}</div>
              <div style={s.cardSub}>
                Listado Total de Productos Aplicados. Trae lotes de todas las firmas: se filtran
                contra los lotes del plan de siembra de GDL.
              </div>
              <input type="file" accept=".xls,.xlsx" onChange={impProductos}
                style={{ display: 'none' }} id="f-productos" />
              <label htmlFor="f-productos" style={s.btn}>
                {archivoDe('producto') ? 'Reemplazar productos' : 'Subir productos'}
              </label>
              <Cargado origen="producto" unidad="registros" />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Archivos importados</div>
              <div style={s.cardSub}>
                Cada carga reemplaza por completo los datos anteriores de ese origen y cultivo.
              </div>
              {archivos.length === 0 ? (
                <div style={s.vacio}>Todavía no importaste ningún archivo.</div>
              ) : archivos.map((a, i) => (
                <div key={i} style={s.archivoItem}>
                  <span style={s.origenPill}>{a.origen}</span>
                  <span style={s.archivoNombre}>{a.nombre}</span>
                  {a.cultivo && <span style={s.cultivoPill}>{a.cultivo}</span>}
                  <span style={s.archivoDato}>{a.filas} filas</span>
                  <span style={s.archivoDato}>
                    {a.fecha ? new Date(a.fecha).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    }) : '—'}
                  </span>
                  <button style={s.archivoEliminar} onClick={() => borrarOrigen(a)}
                    title="Eliminar estos datos">×</button>
                </div>
              ))}
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
  archivoItem: { display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 11px', background: COLOR.fila, border: `1px solid ${COLOR.linea}`, borderRadius: '2px', marginBottom: '5px', fontSize: '12px' },
  origenPill: { fontSize: '9.5px', fontWeight: '600', padding: '2px 9px', background: COLOR.oscuro, color: COLOR.bronceClaro, borderRadius: '999px', flexShrink: 0, minWidth: '96px', textAlign: 'center' },
  cultivoPill: { fontSize: '9.5px', fontWeight: '600', padding: '2px 9px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '999px', flexShrink: 0 },
  archivoNombre: { flex: 1, color: COLOR.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  archivoDato: { fontSize: '10.5px', color: COLOR.textoTenue, flexShrink: 0 },
  archivoEliminar: { background: 'none', border: 'none', color: COLOR.textoTenue, fontSize: '17px', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 },
  vacio: { fontSize: '11.5px', color: COLOR.textoTenue, padding: '8px 0' },
  cargado: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '7px 11px', background: COLOR.okFondo, borderLeft: `3px solid ${COLOR.ok}`, borderRadius: '2px', fontSize: '11.5px', flexWrap: 'wrap' },
  checkOk: { color: COLOR.ok, fontWeight: '700', flexShrink: 0 },
  archivoNom: { color: COLOR.ok, fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  archivoMeta: { color: COLOR.textoSuave, fontSize: '10.5px' },
  sinCargar: { marginTop: '10px', padding: '7px 11px', background: '#F4EFE3', borderLeft: '3px solid #D8CDB6', borderRadius: '2px', fontSize: '11.5px', color: COLOR.textoTenue },
  avisoCultivo: { padding: '9px 13px', background: '#FBEBCB', borderLeft: '3px solid #C08A23', borderRadius: '2px', fontSize: '11.5px', color: '#7E5A12', marginBottom: '14px' },
  inputMini: { padding: '4px 8px', fontSize: '11px', border: `1px solid ${COLOR.borde}`, borderRadius: '2px', fontFamily: FUENTE.ui, background: COLOR.papel, color: COLOR.texto, outline: 'none', width: '110px', textAlign: 'right' },
  btnMini2: { padding: '3px 10px', fontSize: '10px', background: COLOR.oscuro, color: COLOR.bronceClaro, border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: FUENTE.ui },
  pillDoble: { marginLeft: '8px', fontSize: '9px', padding: '1px 7px', background: '#FBEBCB', color: '#7E5A12', borderRadius: '999px' },
  pillSimple: { marginLeft: '8px', fontSize: '9px', padding: '1px 7px', background: COLOR.okFondo, color: COLOR.ok, borderRadius: '999px' },
  manFila: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${COLOR.linea}`, flexWrap: 'wrap' },
  manLabel: { width: '130px', fontSize: '12px', color: COLOR.texto, flexShrink: 0 },
  manRef: { fontSize: '10px', color: COLOR.textoTenue, flexShrink: 0 },
};
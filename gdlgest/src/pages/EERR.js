import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { APP_NOMBRE, APP_VERSION, CAMBIOS } from '../version';
import Conciliacion from './Conciliacion';

const CAMPANA = '2025-2026';

const CRITERIOS = [
  { key: 'directo',    label: 'Directo',    desc: 'Va entero a una unidad de negocio' },
  { key: 'prorrateo',  label: 'Prorrateo',  desc: 'Se reparte según ingresos de campaña' },
  { key: 'excluir',    label: 'Excluir',    desc: 'No forma parte del resultado' },
];

const ETIQUETAS = [
  { key: 'GVD',   label: 'GVD',   desc: 'Gastos variables directos', color: '#7C8460', fondo: '#E4EAD6' },
  { key: 'GFD',   label: 'GFD',   desc: 'Gastos fijos directos',     color: '#4A5A5C', fondo: '#DCE6E7' },
  { key: 'GI',    label: 'GI',    desc: 'Gastos indirectos',         color: '#7E5A12', fondo: '#FBEBCB' },
  { key: 'GC',    label: 'GC',    desc: 'Gastos de comercialización', color: '#7A3A1F', fondo: '#F6DED2' },
  { key: 'RF',    label: 'RF',    desc: 'Resultados financieros',    color: '#5F4B8B', fondo: '#EAE5F5' },
  { key: 'AMORT', label: 'AMORT', desc: 'Amortizaciones',            color: '#6B6257', fondo: '#EDE9E1' },
];

const MONEDAS = [
  { key: 'USD', label: 'U$S' },
  { key: 'ARS', label: 'AR$' },
];

const COLOR = {
  fondo:      '#EDE4D2',
  papel:      '#FFFFFF',
  fila:       '#F7F1E4',
  linea:      '#E9E0CE',
  borde:      '#DDD2BC',
  oscuro:     '#241D17',
  medio:      '#33291F',
  bronce:     '#D9A441',
  texto:      '#2E2519',
  textoSuave: '#7D6E56',
  textoTenue: '#9A8A6E',
};

const COLOR_UDN = {
  agricultura:     { base: '#7C8460', claro: '#E4EAD6', texto: '#4C5735', num: '#B7C48F' },
  granja_cerdos:   { base: '#A9542F', claro: '#F6DED2', texto: '#7A3A1F', num: '#E8A882' },
  serv_transporte: { base: '#4A5A5C', claro: '#DCE6E7', texto: '#334042', num: '#A9BCBE' },
  serv_agricolas:  { base: '#C08A23', claro: '#FBEBCB', texto: '#7E5A12', num: '#E6C070' },
};

const FUENTE = {
  titulo: "'Cormorant Garamond', Georgia, serif",
  ui:     "'Inter', -apple-system, sans-serif",
};

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
// Busca la regla más específica: cuenta exacta, luego prefijos de 5, 4, 3 y 2 dígitos
const getUdnPorCodigo = (codigo, reglas) => {
  for (let largo = codigo.length; largo >= 2; largo--) {
    const p = codigo.slice(0, largo);
    if (reglas[p]) return reglas[p];
  }
  return null;
};

export default function EERR() {
  const navigate = useNavigate();
  const [verCambios, setVerCambios] = useState(false);

  const cerrarSesion = async () => {
    if (!window.confirm('¿Cerrar sesión?')) return;
    await supabase.auth.signOut();
    navigate('/');
  };

  const [tab, setTab] = useState('importar');
  const [mesesPorMoneda, setMesesPorMoneda] = useState({ USD: [], ARS: [] });
  const [monedaVista, setMonedaVista] = useState('USD');
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
  const [monedaArchivo, setMonedaArchivo] = useState('USD');
  const mesesCargados = mesesPorMoneda[monedaVista] || [];

  // Edición de reglas
  const [editandoRegla, setEditandoRegla] = useState(null);
  const [borradorRegla, setBorradorRegla] = useState({});
  const [filtroReglas, setFiltroReglas] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroDestino, setFiltroDestino] = useState('todos');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [nuevaRegla, setNuevaRegla] = useState(false);

  const abrirRegla = (r) => {
    setNuevaRegla(false);
    setEditandoRegla(r.cuenta_codigo);
    setBorradorRegla({
      cuenta_codigo: r.cuenta_codigo,
      cuenta_desc: r.cuenta_desc || '',
      criterio: (r.criterio || '').replace('prefijo_', ''),
      udn_destino: r.udn_destino || '',
      clasificacion: r.clasificacion || '',
      nota: r.nota || '',
    });
  };

  const abrirNueva = () => {
    setEditandoRegla(null);
    setNuevaRegla(true);
    setBorradorRegla({ cuenta_codigo: '', cuenta_desc: '', criterio: '', udn_destino: '', clasificacion: '', nota: '' });
  };

  const guardarRegla = async () => {
    const b = borradorRegla;
    if (!b.cuenta_codigo || !/^\d{3}$|^\d{6}$/.test(b.cuenta_codigo.trim())) {
      setError('El código debe tener 3 dígitos (prefijo) o 6 dígitos (cuenta).');
      return;
    }
    if (!b.criterio) { setError('Elegí un criterio.'); return; }
    if (b.criterio === 'directo' && !b.udn_destino) {
      setError('El criterio directo necesita una unidad de negocio destino.');
      return;
    }
    setError('');
    const esPrefijo = b.cuenta_codigo.trim().length === 3;
    const criterioFinal = esPrefijo && b.criterio !== 'excluir'
      ? `prefijo_${b.criterio}` : b.criterio;

    const { error: err } = await supabase.from('reglas_cuentas').upsert({
      cuenta_codigo: b.cuenta_codigo.trim(),
      cuenta_desc: b.cuenta_desc || null,
      criterio: criterioFinal,
      udn_destino: b.criterio === 'directo' ? b.udn_destino : null,
      clasificacion: b.clasificacion || null,
      nota: b.nota || null,
    }, { onConflict: 'cuenta_codigo' });

    if (err) { setError('Error al guardar: ' + err.message); return; }
    setEditandoRegla(null);
    setNuevaRegla(false);
    setBorradorRegla({});
    await cargarReglas();
    await cargarIngCampana();
    if (tab === 'visualizar') cargarRegistros();
  };

  const borrarRegla = async (cod) => {
    if (!window.confirm(`¿Eliminar la regla de ${cod}?`)) return;
    await supabase.from('reglas_cuentas').delete().eq('cuenta_codigo', cod);
    setEditandoRegla(null);
    await cargarReglas();
    await cargarIngCampana();
    if (tab === 'visualizar') cargarRegistros();
  };

  // Filtros visualización
  const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
  const [vistaDetalle, setVistaDetalle] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [ocultarCeros, setOcultarCeros] = useState(true);
  const [seleccionPrevia, setSeleccionPrevia] = useState([]);

  const informeRef = useRef(null);
  const [exportando, setExportando] = useState('');

  const nombreInforme = () => {
    const ms = [...mesesSeleccionados].sort();
    const rango = ms.length === 1 ? ms[0] : `${ms[0]}_a_${ms[ms.length - 1]}`;
    return `EERR_GDL_${rango}_${monedaVista}`;
  };

  const capturar = async () => {
    return await html2canvas(informeRef.current, {
      scale: 2,
      backgroundColor: '#FFFFFF',
      useCORS: true,
      scrollX: 0,
      scrollY: -window.scrollY,
    });
  };

  const descargarPNG = async () => {
    if (!informeRef.current) return;
    setExportando('png');
    try {
      const canvas = await capturar();
      const link = document.createElement('a');
      link.download = `${nombreInforme()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      setError('No se pudo generar la imagen.');
    }
    setExportando('');
  };

  const descargarPDF = async () => {
    if (!informeRef.current) return;
    setExportando('pdf');
    try {
      const canvas = await capturar();
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margen = 8;
      const anchoUtil = pw - margen * 2;
      const altoImg = (canvas.height * anchoUtil) / canvas.width;

      if (altoImg <= ph - margen * 2) {
        pdf.addImage(img, 'PNG', margen, margen, anchoUtil, altoImg);
      } else {
        let restante = altoImg;
        let offset = 0;
        while (restante > 0) {
          pdf.addImage(img, 'PNG', margen, margen - offset, anchoUtil, altoImg);
          restante -= (ph - margen * 2);
          offset += (ph - margen * 2);
          if (restante > 0) pdf.addPage();
        }
      }
      pdf.save(`${nombreInforme()}.pdf`);
    } catch (e) {
      setError('No se pudo generar el PDF.');
    }
    setExportando('');
  };

  // Ingresos campaña completa para prorrateo
  const [ingCampana, setIngCampana] = useState({});
  const [archivos, setArchivos] = useState([]);

  useEffect(() => { cargarMeses(); cargarReglas(); cargarArchivos(); cargarCatalogo(); }, []);

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
      .eq('mes', archivo.mes)
      .eq('moneda', archivo.moneda || 'USD');
    await supabase.from('archivos_importados')
      .delete()
      .eq('id', archivo.id);
    await cargarArchivos();
    await cargarMeses();
    await cargarIngCampana();
    setRegistros([]);
    setMesesSeleccionados(prev => prev.filter(m => m !== archivo.mes));
  };

  const cargarMeses = async () => {
    const { data } = await supabase
      .from('archivos_importados').select('mes, moneda')
      .eq('campana', CAMPANA).order('mes');
    if (data) {
      const m = { USD: [], ARS: [] };
      data.forEach(d => {
        const mo = d.moneda || 'USD';
        if (m[mo] && !m[mo].includes(d.mes)) m[mo].push(d.mes);
      });
      setMesesPorMoneda(m);
    }
  };

  const [catalogo, setCatalogo] = useState([]);

  const cargarCatalogo = async () => {
    let todas = [];
    let from = 0;
    while (true) {
      const { data, error: e } = await supabase
        .from('balance_mensual')
        .select('cuenta_codigo, cuenta_desc, tipo, total')
        .eq('campana', CAMPANA)
        .range(from, from + 999);
      if (e || !data || data.length === 0) break;
      todas = todas.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const mapa = {};
    todas.forEach(r => {
      if (!mapa[r.cuenta_codigo]) {
        mapa[r.cuenta_codigo] = {
          cuenta_codigo: r.cuenta_codigo,
          cuenta_desc: r.cuenta_desc,
          tipo: r.tipo,
          monto: 0,
        };
      }
      mapa[r.cuenta_codigo].monto += Math.abs(r.total || 0);
    });
    setCatalogo(Object.values(mapa).sort((a, b) =>
      a.cuenta_codigo.localeCompare(b.cuenta_codigo)));
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
      .eq('campana', CAMPANA).eq('tipo', 'INGRESO')
      .eq('moneda', monedaVista);
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
  }, [reglas, monedaVista]);

  useEffect(() => {
    if (Object.keys(reglas).length > 0) cargarIngCampana();
  }, [reglas, cargarIngCampana]);

const cargarRegistros = useCallback(async () => {
    const disponibles = mesesPorMoneda[monedaVista] || [];
    const mesesVisibles = mesesSeleccionados.filter(m => disponibles.includes(m));
    if (mesesVisibles.length === 0) { setRegistros([]); setCargando(false); return; }
    setCargando(true);

    // Supabase pagina de a 1000 — necesitamos traer todo
    let allData = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('balance_mensual').select('*')
        .eq('campana', CAMPANA)
        .eq('moneda', monedaVista)
        .in('mes', mesesVisibles)
        .order('cuenta_codigo')
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }

    setRegistros(allData);
    setCargando(false);
  }, [mesesSeleccionados, monedaVista, mesesPorMoneda]);
  
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

    const tokens = nombreLimpio.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
    const moneda = /\b(ARS|AR|PESOS)\b/.test(tokens) ? 'ARS'
      : /\b(USD|DOLARES|DOLAR)\b/.test(tokens) ? 'USD' : null;
    if (!moneda) {
      setError('No se detectó la moneda. El nombre del archivo debe incluir "usd" o "ar$".');
      return;
    }
    setNombreArchivoActual(file.name);
    setMonedaArchivo(moneda);

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
            cuenta_codigo: codigo, cuenta_desc: desc, tipo, moneda,
          };
          TODAS_COLUMNAS.forEach(col => {
            const idx = colMap[col.key];
            reg[col.key] = idx !== undefined ? (parseFloat(r[idx]) || 0) : 0;
          });
          cuentasProcesadas.push(reg);
        });

        // Detectar cuentas nuevas sin regla
        const nuevasSinRegla = cuentasProcesadas.filter(
          c => !getUdnPorCodigo(c.cuenta_codigo, reglas)
        );

        setDatosMes(cuentasProcesadas);
        setMesActual(mes);

        if (nuevasSinRegla.length > 0) {
          setCuentasPendientes(nuevasSinRegla);
          setCuentaActual(0);
          setDecisionesTemp({});
          setEtapa('revisando');
        } else {
          await guardarMes(cuentasProcesadas, mes, file.name, moneda);
        }
      } catch (err) {
        setError('Error al leer el archivo.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const guardarMes = async (datos, mes, nombreArchivo, moneda) => {
    setEtapa('guardando');
    const mon = moneda || monedaArchivo;
    await supabase.from('balance_mensual')
      .delete()
      .eq('campana', CAMPANA)
      .eq('mes', mes)
      .eq('moneda', mon);
    const { error: err } = await supabase
      .from('balance_mensual')
      .insert(datos);
    if (err) setError('Error al guardar: ' + err.message);
    else {
      const nombreFinal = nombreArchivo || nombreArchivoActual || mes;
      const simbolo = MONEDAS.find(m => m.key === mon)?.label || mon;
      setMsg(`✓ ${nombreFinal} — ${MESES_CAMPANA.find(m => m.key === mes)?.label || mes} — ${simbolo} — ${datos.length} cuentas guardadas`);
      await supabase.from('archivos_importados').upsert({
        campana: CAMPANA,
        mes,
        moneda: mon,
        nombre_archivo: nombreFinal,
        importado_at: new Date().toISOString(),
      }, { onConflict: 'campana,mes,moneda' });
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
      await guardarMes(datosMes, mesActual, nombreArchivoActual, monedaArchivo);
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

  function renderEditorRegla(codExistente) {
    const b = borradorRegla;
    return (
      <>
        <div style={s.editorGrupo}>
          <span style={s.editorLabel}>CRITERIO</span>
          {CRITERIOS.map(c => (
            <button key={c.key} title={c.desc}
              style={b.criterio === c.key ? s.opcionActive : s.opcion}
              onClick={() => setBorradorRegla(x => ({ ...x, criterio: c.key }))}>
              {c.label}
            </button>
          ))}
        </div>

        {b.criterio === 'directo' && (
          <div style={s.editorGrupo}>
            <span style={s.editorLabel}>DESTINO</span>
            {UDN.map(u => (
              <button key={u.key}
                style={b.udn_destino === u.key ? s.opcionActive : s.opcion}
                onClick={() => setBorradorRegla(x => ({ ...x, udn_destino: u.key }))}>
                {u.label}
              </button>
            ))}
          </div>
        )}

        <div style={s.editorGrupo}>
          <span style={s.editorLabel}>ETIQUETA</span>
          {ETIQUETAS.map(e => (
            <button key={e.key} title={e.desc}
              style={b.clasificacion === e.key
                ? { ...s.opcionActive, background: e.color, borderColor: e.color, color: '#FFF' }
                : s.opcion}
              onClick={() => setBorradorRegla(x => ({
                ...x, clasificacion: x.clasificacion === e.key ? '' : e.key
              }))}>
              {e.label}
            </button>
          ))}
        </div>

        <input style={s.notaInput} placeholder="Nota: por qué se eligió este criterio"
          value={b.nota || ''}
          onChange={e => setBorradorRegla(x => ({ ...x, nota: e.target.value }))} />

        <div style={s.editorAcc}>
          <button style={s.btn} onClick={guardarRegla}>Guardar</button>
          <button style={s.btnSec}
            onClick={() => { setEditandoRegla(null); setNuevaRegla(false); setBorradorRegla({}); setError(''); }}>
            Cancelar
          </button>
          {codExistente && (
            <button style={s.btnSec} onClick={() => borrarRegla(codExistente)}>Eliminar regla</button>
          )}
        </div>
      </>
    );
  }

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
        <div style={s.headerDer}>
          <button style={s.versionBtn} onClick={() => navigate('/inicio')} title="Volver a la portada">
            ← Inicio
          </button>
          <button style={s.versionBtn} onClick={() => setVerCambios(true)} title="Ver novedades">
            v{APP_VERSION}
          </button>
          <button style={s.salirBtn} onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
        <div style={s.mesesBadges}>
          {MONEDAS.map(mon => (
            <span key={mon.key} style={s.mesBadge}>
              {mon.label} {(mesesPorMoneda[mon.key] || []).length}/12
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
          { key: 'conciliacion', label: '⚖️ Conciliación' },
        ].map(t => (
          <button key={t.key}
            style={tab === t.key ? s.tabActive : s.tab}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {verCambios && (
        <div style={s.modalFondo} onClick={() => setVerCambios(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={s.modalHead}>
              <div>
                <div style={s.modalTitulo}>{APP_NOMBRE}</div>
                <div style={s.modalSub}>Versión {APP_VERSION} · historial de mejoras</div>
              </div>
              <button style={s.modalCerrar} onClick={() => setVerCambios(false)}>×</button>
            </div>
            <div style={s.modalBody}>
              {CAMBIOS.map(c => (
                <div key={c.version} style={s.cambioBloque}>
                  <div style={s.cambioHead}>
                    <span style={c.version === APP_VERSION ? s.cambioVerActual : s.cambioVer}>
                      v{c.version}
                    </span>
                    <span style={s.cambioFecha}>{c.fecha}</span>
                  </div>
                  <ul style={s.cambioLista}>
                    {c.items.map((it, i) => <li key={i} style={s.cambioItem}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

            <div style={{ marginTop: '22px' }}>
              <div style={s.subTitle}>Estado campaña {CAMPANA}</div>
              {MONEDAS.map(mon => (
                <div key={mon.key} style={s.estadoFila}>
                  <span style={s.estadoLabel}>{mon.label}</span>
                  <div style={s.mesesGrid}>
                    {MESES_CAMPANA.map(m => {
                      const ok = (mesesPorMoneda[mon.key] || []).includes(m.key);
                      return (
                        <div key={m.key} style={ok ? s.mesOk : s.mesPendiente} title={m.label}>
                          {m.label.replace(' 20', "'")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

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
                      <span style={s.archivoMoneda}>
                        {MONEDAS.find(m => m.key === (a.moneda || 'USD'))?.label || a.moneda}
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

              <div style={s.filaSelector}>
                <span style={s.selectorLabel}>MONEDA</span>
                <div style={s.grupoBtns}>
                  {MONEDAS.map(mon => (
                    <button key={mon.key}
                      style={monedaVista === mon.key ? s.monedaActive : s.monedaBtn}
                      onClick={() => setMonedaVista(mon.key)}>
                      {mon.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={s.filaSelector}>
                <span style={s.selectorLabel}>PERÍODO</span>
                <div style={s.periodoBloque}>
                  <div style={s.mesesSelector} onMouseLeave={() => setDragging(false)}>
                    {MESES_CAMPANA.map(m => {
                      const disponible = mesesCargados.includes(m.key);
                      const sel = mesesSeleccionados.includes(m.key);
                      const estilo = sel
                        ? (disponible ? s.mesSelActive : s.mesSelSinDatos)
                        : (disponible ? s.mesSel : s.mesNA);
                      return (
                        <div key={m.key}
                          style={estilo}
                          title={disponible ? m.label : `${m.label} — sin datos en ${MONEDAS.find(x => x.key === monedaVista)?.label}`}
                          onMouseDown={() => onMesMouseDown(m.key)}
                          onMouseEnter={() => onMesMouseEnter(m.key)}
                          onMouseUp={() => setDragging(false)}
                          onClick={() => toggleMes(m.key)}>
                          {m.label.replace(' 20', "'")}
                        </div>
                      );
                    })}
                  </div>
                  <button style={s.btnMini}
                    onClick={() => setMesesSeleccionados(prev => [...new Set([...prev, ...mesesCargados])])}>
                    Todos
                  </button>
                  <button style={s.btnMini} onClick={() => setMesesSeleccionados([])}>Ninguno</button>
                  {(() => {
                    const conDatos = mesesSeleccionados.filter(m => mesesCargados.includes(m)).length;
                    const sinDatos = mesesSeleccionados.length - conDatos;
                    if (mesesSeleccionados.length === 0) return <span style={s.selectorCount}>Sin selección</span>;
                    return (
                      <span style={s.selectorCount}>
                        {conDatos} mes{conDatos !== 1 ? 'es' : ''}
                        {sinDatos > 0 && <span style={s.avisoSinDatos}> · {sinDatos} sin datos</span>}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div style={s.filaSelector}>
                <span style={s.selectorLabel}>VISTA</span>
                <div style={s.grupoBtns}>
                  <button style={vistaDetalle ? s.vistaActive : s.vistaBtn}
                    onClick={() => setVistaDetalle(true)}>Detalle</button>
                  <button style={!vistaDetalle ? s.vistaActive : s.vistaBtn}
                    onClick={() => setVistaDetalle(false)}>Rubro</button>
                </div>
                <label style={s.checkLabel}>
                  <input type="checkbox" checked={ocultarCeros}
                    onChange={e => setOcultarCeros(e.target.checked)}
                    style={{ marginRight: '5px' }} />
                  Ocultar filas en cero
                </label>
                <div style={{ flex: 1 }} />
                <select
                  style={s.descargaSelect}
                  value=""
                  disabled={!!exportando || mesesSeleccionados.length === 0}
                  onChange={e => {
                    const v = e.target.value;
                    e.target.value = '';
                    if (v === 'png') descargarPNG();
                    if (v === 'pdf') descargarPDF();
                  }}>
                  <option value="" disabled hidden>
                    {exportando ? 'Generando…' : 'Descargar'}
                  </option>
                  <option value="png">PNG — imagen</option>
                  <option value="pdf">PDF — A4 apaisado</option>
                </select>
              </div>

            </div>

            {mesesSeleccionados.length === 0 ? (
              <div style={s.empty}>Seleccioná al menos un mes para ver el estado de resultados.</div>
            ) : cargando ? (
              <div style={s.loading}>Cargando...</div>
            ) : (
              <>

                <div ref={informeRef} style={s.informeWrap}>
                <div style={s.informeHead}>
                  <div>
                    <div style={s.informeTitulo}>Ganados Don Luis S.A.</div>
                    <div style={s.informeSub}>
                      Estado de resultados · Campaña {CAMPANA} · Expresado en {MONEDAS.find(m => m.key === monedaVista)?.label}
                    </div>
                  </div>
                  <div style={s.informeMeses}>
                    {[...mesesSeleccionados].sort().map(m =>
                      MESES_CAMPANA.find(mc => mc.key === m)?.label || m
                    ).join(' · ')}
                  </div>
                </div>
                <div style={s.tableCard}>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.thCuenta}>Cuenta</th>
                          {UDN.map(u => (
                            <th key={u.key} style={{ ...s.th, borderBottom: `3px solid ${COLOR_UDN[u.key].base}` }}>
                              {u.label}
                            </th>
                          ))}
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
                </div>
              </>
            )}
          </>
        )}

        {/* ── TAB CONCILIACIÓN ── */}
        {tab === 'conciliacion' && (
          <Conciliacion moneda={monedaVista} onMoneda={setMonedaVista} />
        )}

        {/* ── TAB REGLAS ── */}
        {tab === 'reglas' && (
          <div style={s.card}>
            <div style={s.cardTitle}>Reglas de imputación</div>
            <div style={s.cardSub}>
              Cada cuenta tiene un criterio (a dónde va) y una etiqueta (qué tipo de gasto es).
              Los cambios se aplican al instante sobre el estado de resultados: podés modificar
              un criterio, ir a Visualizar y ver el impacto.
            </div>

            <div style={s.reglasBar}>
              <input style={s.buscador} placeholder="Buscar por código o descripción…"
                value={filtroReglas} onChange={e => setFiltroReglas(e.target.value)} />
              <button style={s.btn} onClick={abrirNueva}>+ Nueva regla</button>
            </div>

            <div style={s.filtrosReglas}>
              <div style={s.filtroFila}>
                <span style={s.filtroLabel}>ESTADO</span>
                {[
                  { k: 'todas', l: 'Todas' },
                  { k: 'propia', l: 'Con regla propia' },
                  { k: 'heredada', l: 'Heredan del prefijo' },
                  { k: 'sin', l: 'Sin regla' },
                ].map(o => (
                  <button key={o.k} style={filtroEstado === o.k ? s.chipActive : s.chip}
                    onClick={() => setFiltroEstado(o.k)}>{o.l}</button>
                ))}
              </div>
              <div style={s.filtroFila}>
                <span style={s.filtroLabel}>DESTINO</span>
                <button style={filtroDestino === 'todos' ? s.chipActive : s.chip}
                  onClick={() => setFiltroDestino('todos')}>Todos</button>
                {UDN.map(u => (
                  <button key={u.key} style={filtroDestino === u.key ? s.chipActive : s.chip}
                    onClick={() => setFiltroDestino(u.key)}>{u.label}</button>
                ))}
                <button style={filtroDestino === 'prorrateo' ? s.chipActive : s.chip}
                  onClick={() => setFiltroDestino('prorrateo')}>÷ Prorrateo</button>
                <button style={filtroDestino === 'excluir' ? s.chipActive : s.chip}
                  onClick={() => setFiltroDestino('excluir')}>✕ Excluidas</button>
              </div>
              <div style={s.filtroFila}>
                <span style={s.filtroLabel}>ETIQUETA</span>
                <button style={filtroEtiqueta === 'todas' ? s.chipActive : s.chip}
                  onClick={() => setFiltroEtiqueta('todas')}>Todas</button>
                {ETIQUETAS.map(e => (
                  <button key={e.key} title={e.desc}
                    style={filtroEtiqueta === e.key
                      ? { ...s.chipActive, background: e.color, borderColor: e.color }
                      : s.chip}
                    onClick={() => setFiltroEtiqueta(e.key)}>{e.label}</button>
                ))}
                <button style={filtroEtiqueta === 'sin' ? s.chipActive : s.chip}
                  onClick={() => setFiltroEtiqueta('sin')}>Sin etiqueta</button>
                <div style={{ flex: 1 }} />
                <button style={filtroTipo === 'todos' ? s.chipActive : s.chip}
                  onClick={() => setFiltroTipo('todos')}>Ingresos y gastos</button>
                <button style={filtroTipo === 'INGRESO' ? s.chipActive : s.chip}
                  onClick={() => setFiltroTipo('INGRESO')}>Solo ingresos</button>
                <button style={filtroTipo === 'GASTO' ? s.chipActive : s.chip}
                  onClick={() => setFiltroTipo('GASTO')}>Solo gastos</button>
              </div>
            </div>

            {error && <div style={s.msgError}>{error}</div>}

            {nuevaRegla && (
              <div style={s.editorRegla}>
                <div style={s.editorHead}>Nueva regla</div>
                <div style={s.editorFila}>
                  <input style={{ ...s.inputChico, maxWidth: '130px' }} placeholder="Código"
                    value={borradorRegla.cuenta_codigo}
                    onChange={e => setBorradorRegla(b => ({ ...b, cuenta_codigo: e.target.value }))} />
                  <input style={s.inputChico} placeholder="Descripción"
                    value={borradorRegla.cuenta_desc}
                    onChange={e => setBorradorRegla(b => ({ ...b, cuenta_desc: e.target.value }))} />
                </div>
                {renderEditorRegla()}
              </div>
            )}

            {(() => {
              const codigos = new Set([
                ...catalogo.map(c => c.cuenta_codigo),
                ...Object.keys(reglas),
              ]);

              const items = Array.from(codigos).sort().map(cod => {
                const cat = catalogo.find(c => c.cuenta_codigo === cod);
                const propia = reglas[cod] || null;
                const efectiva = propia || (cod.length === 6 ? getUdnPorCodigo(cod, reglas) : null);
                return {
                  cod,
                  desc: (propia && propia.cuenta_desc) || (cat && cat.cuenta_desc) || '',
                  tipo: cat ? cat.tipo : (cod.startsWith('5') ? 'INGRESO' : 'GASTO'),
                  monto: cat ? cat.monto : 0,
                  propia,
                  efectiva,
                  estado: propia ? 'propia' : efectiva ? 'heredada' : 'sin',
                };
              });

              const visibles = items.filter(it => {
                if (filtroEstado !== 'todas' && it.estado !== filtroEstado) return false;
                if (filtroTipo !== 'todos' && it.tipo !== filtroTipo) return false;

                if (filtroDestino !== 'todos') {
                  const cr = (it.efectiva && it.efectiva.criterio) || '';
                  if (filtroDestino === 'prorrateo' && !cr.includes('prorrateo')) return false;
                  else if (filtroDestino === 'excluir' && cr !== 'excluir') return false;
                  else if (UDN.some(u => u.key === filtroDestino)
                    && (!it.efectiva || it.efectiva.udn_destino !== filtroDestino)) return false;
                }

                if (filtroEtiqueta !== 'todas') {
                  const et = it.propia ? it.propia.clasificacion : null;
                  if (filtroEtiqueta === 'sin' ? !!et : et !== filtroEtiqueta) return false;
                }

                if (filtroReglas.trim()) {
                  const q = filtroReglas.toLowerCase();
                  if (!it.cod.includes(q) && !it.desc.toLowerCase().includes(q)) return false;
                }
                return true;
              });

              return (
                <>
                  <div style={s.contadorReglas}>
                    {visibles.length} de {items.length} cuentas
                    {' · '}
                    {items.filter(i => i.estado === 'propia').length} con regla propia
                    {' · '}
                    {items.filter(i => i.estado === 'heredada').length} heredadas
                    {items.filter(i => i.estado === 'sin').length > 0 && (
                      <span style={s.avisoSinRegla}>
                        {' · '}{items.filter(i => i.estado === 'sin').length} sin regla
                      </span>
                    )}
                  </div>

                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.thCuenta}>Código</th>
                          <th style={s.th2}>Descripción</th>
                          <th style={s.th2}>Criterio</th>
                          <th style={s.th2}>Unidad destino</th>
                          <th style={s.th2}>Etiqueta</th>
                          <th style={s.th2}>Origen</th>
                          <th style={s.th2}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibles.map((it, i) => {
                          const abierto = editandoRegla === it.cod;
                          const et = it.propia
                            ? ETIQUETAS.find(x => x.key === it.propia.clasificacion) : null;
                          const cr = (it.efectiva && it.efectiva.criterio) || '';
                          return (
                            <React.Fragment key={it.cod}>
                              <tr style={{ background: i % 2 === 0 ? '#FFF' : '#F7F1E4' }}>
                                <td style={s.tdCuenta}>
                                  <span style={s.cod}>{it.cod}</span>
                                  {it.cod.length === 3 && <span style={s.prefijoBadge}>prefijo</span>}
                                </td>
                                <td style={s.tdCuenta}>{it.desc || '—'}</td>
                                <td style={s.tdCuenta}>
                                  {cr.includes('directo') ? '→ directo'
                                    : cr.includes('prorrateo') ? '÷ prorrateo'
                                    : cr === 'excluir' ? '✕ excluir'
                                    : <span style={s.avisoSinRegla}>⚠ sin regla</span>}
                                </td>
                                <td style={s.tdCuenta}>
                                  {UDN.find(u => u.key === (it.efectiva && it.efectiva.udn_destino))?.label || '—'}
                                </td>
                                <td style={s.tdCuenta}>
                                  {et ? (
                                    <span style={{ ...s.etiquetaPill, background: et.fondo, color: et.color }}
                                      title={et.desc}>{et.label}</span>
                                  ) : <span style={s.sinEtiqueta}>—</span>}
                                </td>
                                <td style={s.tdCuenta}>
                                  {it.estado === 'propia' ? <span style={s.origenPropia}>propia</span>
                                    : it.estado === 'heredada' ? <span style={s.origenHeredada}>del prefijo</span>
                                    : <span style={s.origenSin}>ninguna</span>}
                                </td>
                                <td style={s.tdCuenta}>
                                  <button style={s.btnMini} onClick={() => abrirRegla(
                                    it.propia || {
                                      cuenta_codigo: it.cod, cuenta_desc: it.desc,
                                      criterio: (it.efectiva && it.efectiva.criterio) || '',
                                      udn_destino: (it.efectiva && it.efectiva.udn_destino) || '',
                                      clasificacion: '', nota: '',
                                    }
                                  )}>
                                    {it.estado === 'propia' ? 'editar' : 'asignar'}
                                  </button>
                                </td>
                              </tr>
                              {abierto && (
                                <tr>
                                  <td colSpan={7} style={s.editorCelda}>
                                    <div style={s.editorRegla}>
                                      <div style={s.editorHead}>
                                        {it.cod} · {it.desc || 'sin descripción'}
                                        {it.estado === 'heredada' && (
                                          <span style={s.avisoHereda}>
                                            {' '}— hoy hereda del prefijo; al guardar tendrá regla propia
                                          </span>
                                        )}
                                      </div>
                                      {renderEditorRegla(it.propia ? it.cod : null)}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: COLOR.fondo, fontFamily: FUENTE.ui, userSelect: 'none', position: 'relative' },
  header: { background: COLOR.oscuro, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
  headerTitle: { fontSize: '16px', fontWeight: '700', color: COLOR.bronce, fontFamily: 'Georgia, serif' },
  headerSub: { fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' },
  mesesBadges: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  headerDer: { display: 'flex', alignItems: 'center', gap: '8px', order: 3 },
  versionBtn: { padding: '3px 10px', fontSize: '10px', fontWeight: '600', fontFamily: FUENTE.ui, background: 'transparent', color: '#A79883', border: '1px solid #4A3E32', borderRadius: '3px', cursor: 'pointer', letterSpacing: '0.06em' },
  salirBtn: { padding: '4px 12px', fontSize: '10px', fontWeight: '600', fontFamily: FUENTE.ui, background: 'transparent', color: '#D9A441', border: '1px solid #B8873B', borderRadius: '3px', cursor: 'pointer', letterSpacing: '0.08em' },
  modalFondo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(36,29,23,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '70px', zIndex: 50 },
  modalCard: { background: '#FFFFFF', border: '1px solid #D8CDB6', borderRadius: '3px', width: '440px', maxWidth: '92vw', maxHeight: '72vh', display: 'flex', flexDirection: 'column' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 22px 14px', borderBottom: '1px solid #E9E0CE' },
  modalTitulo: { fontSize: '20px', fontWeight: '500', color: '#241D17', fontFamily: FUENTE.titulo },
  modalSub: { fontSize: '10px', color: '#8A7B62', letterSpacing: '0.08em', marginTop: '2px' },
  modalCerrar: { background: 'none', border: 'none', fontSize: '22px', color: '#A2947B', cursor: 'pointer', lineHeight: 1, padding: 0 },
  modalBody: { padding: '16px 22px 20px', overflowY: 'auto' },
  cambioBloque: { marginBottom: '18px' },
  cambioHead: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' },
  cambioVer: { fontSize: '11px', fontWeight: '700', color: '#7D6E56', fontFamily: FUENTE.ui, letterSpacing: '0.05em' },
  cambioVerActual: { fontSize: '11px', fontWeight: '700', color: '#4C5735', background: '#E4EAD6', padding: '2px 8px', borderRadius: '999px', fontFamily: FUENTE.ui, letterSpacing: '0.05em' },
  cambioFecha: { fontSize: '10px', color: '#A2947B' },
  cambioLista: { margin: 0, paddingLeft: '16px' },
  cambioItem: { fontSize: '12px', color: '#2E2519', lineHeight: '1.75', fontFamily: FUENTE.ui },
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
  mesesGrid: { display: 'flex', gap: '3px', flex: 1, minWidth: 0 },
  mesOk: { flex: 1, textAlign: 'center', padding: '5px 2px', background: '#E4EAD6', color: '#4C5735', borderRadius: '3px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden' },
  mesPendiente: { flex: 1, textAlign: 'center', padding: '5px 2px', background: '#F4EFE3', color: '#B0A288', borderRadius: '3px', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden' },
  estadoFila: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' },
  estadoLabel: { width: '30px', fontSize: '10px', fontWeight: '700', color: '#7D6E56', letterSpacing: '0.08em', textAlign: 'right', flexShrink: 0 },
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
  mesNA: { padding: '8px 14px', fontSize: '12px', background: '#F6F1E7', color: '#C4B89A', border: '1px dashed #D6D0C4', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' },
  mesSelSinDatos: { padding: '8px 14px', fontSize: '12px', fontWeight: '700', background: '#F4EFE3', color: '#8A7B62', border: '1px dashed #B8873B', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' },
  avisoSinDatos: { color: '#A9542F', fontWeight: '400' },
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
  selectorBar: { background: '#FFFFFF', border: '1px solid #D8CDB6', borderRadius: '3px', padding: '12px 16px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  filaSelector: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  selectorLabel: { width: '58px', fontSize: '9px', fontWeight: '700', color: '#7D6E56', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 },
  periodoBloque: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 },
  grupoBtns: { display: 'flex', gap: '4px' },
  descargaSelect: { padding: '5px 26px 5px 10px', fontSize: '11px', fontWeight: '600', fontFamily: FUENTE.ui, background: '#241D17', color: '#D9A441', border: '1px solid #241D17', borderRadius: '3px', cursor: 'pointer', outline: 'none', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'><path d=\'M0 0l5 6 5-6z\' fill=\'%23D9A441\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center' },
  selectorCount: { fontSize: '11px', color: '#8E7E62', fontWeight: '600', minWidth: '60px', textAlign: 'right' },
  btnMini: { padding: '3px 9px', fontSize: '11px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '5px', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  checkLabel: { fontSize: '11px', color: '#5E4E36', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  vistaBtns: { display: 'flex', gap: '0' },
  vistaBtn: { padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', cursor: 'pointer', fontFamily: 'Arial, sans-serif' },
  vistaActive: { padding: '4px 10px', fontSize: '11px', fontWeight: '700', background: '#1A3317', color: '#A8CC90', border: '1px solid #3E6E34', cursor: 'pointer', fontFamily: FUENTE.ui },
  descargaBtns: { display: 'flex', gap: '4px' },
  informeWrap: { background: '#FFFFFF', padding: '16px 18px', borderRadius: '3px' },
  informeHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '10px', marginBottom: '12px', borderBottom: '1px solid #D8CDB6', gap: '16px', flexWrap: 'wrap' },
  informeTitulo: { fontSize: '19px', fontWeight: '500', color: '#241D17', fontFamily: FUENTE.titulo },
  informeSub: { fontSize: '10px', color: '#7D6E56', marginTop: '3px', letterSpacing: '0.06em' },
  informeMeses: { fontSize: '10px', color: '#7D6E56', textAlign: 'right', maxWidth: '340px', lineHeight: '1.5' },
  archivosList: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' },
  archivoItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#F6F1E7', border: '1px solid #E6DEC8', borderRadius: '6px', fontSize: '12px' },
  archivoIcon: { fontSize: '14px', flexShrink: 0 },
  archivoNombre: { flex: 1, color: '#2A1E10', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  archivoMes: { fontSize: '11px', padding: '2px 8px', background: '#EAF3DE', color: '#274F22', borderRadius: '10px', fontWeight: '700', flexShrink: 0 },
  archivoEliminar: { background: 'none', border: 'none', color: '#8E7E62', fontSize: '16px', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, fontWeight: '700' },
  archivoMoneda: { fontSize: '10px', padding: '2px 8px', background: '#FEF0E0', color: '#7E5A12', borderRadius: '10px', fontWeight: '700', flexShrink: 0 },
  monedaBtn: { padding: '3px 11px', fontSize: '11px', fontWeight: '600', background: '#F0EDE4', color: '#5E4E36', border: '1px solid #D6D0C4', borderRadius: '5px', cursor: 'pointer', fontFamily: FUENTE.ui },
  monedaActive: { padding: '3px 11px', fontSize: '11px', fontWeight: '700', background: '#241D17', color: '#D9A441', border: '1px solid #241D17', borderRadius: '5px', cursor: 'pointer', fontFamily: FUENTE.ui },
  th2: { background: COLOR.oscuro, color: '#FFF', padding: '8px 11px', textAlign: 'left', fontSize: '9.5px', letterSpacing: '0.06em', whiteSpace: 'nowrap', fontWeight: '500' },
  reglasBar: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' },
  buscador: { flex: 1, padding: '8px 12px', fontSize: '12px', border: `1px solid ${COLOR.borde}`, borderRadius: '3px', fontFamily: FUENTE.ui, background: '#FFF', color: COLOR.texto, outline: 'none' },
  editorCelda: { padding: 0, background: '#F7F1E4', borderBottom: `1px solid ${COLOR.linea}` },
  editorRegla: { padding: '14px 18px', background: '#F7F1E4', border: `1px solid ${COLOR.linea}`, borderRadius: '3px', marginBottom: '12px' },
  editorHead: { fontSize: '12px', fontWeight: '600', color: COLOR.texto, marginBottom: '12px' },
  editorFila: { display: 'flex', gap: '8px', marginBottom: '10px' },
  editorGrupo: { display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginBottom: '9px' },
  editorLabel: { width: '68px', fontSize: '9px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.12em', flexShrink: 0 },
  editorAcc: { display: 'flex', gap: '7px', marginTop: '10px' },
  inputChico: { flex: 1, padding: '7px 11px', fontSize: '12px', border: `1px solid ${COLOR.borde}`, borderRadius: '3px', fontFamily: FUENTE.ui, background: '#FFF', color: COLOR.texto, outline: 'none' },
  etiquetaPill: { fontSize: '10px', fontWeight: '700', padding: '2px 9px', borderRadius: '999px', letterSpacing: '0.04em' },
  sinEtiqueta: { fontSize: '10px', color: '#B0A288' },
  filtrosReglas: { background: '#F7F1E4', border: `1px solid ${COLOR.linea}`, borderRadius: '3px', padding: '10px 14px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '7px' },
  filtroFila: { display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' },
  filtroLabel: { width: '62px', fontSize: '8.5px', fontWeight: '700', color: COLOR.textoSuave, letterSpacing: '0.12em', flexShrink: 0 },
  chip: { padding: '3px 10px', fontSize: '10.5px', fontWeight: '500', background: '#FFF', color: COLOR.textoSuave, border: `1px solid ${COLOR.borde}`, borderRadius: '999px', cursor: 'pointer', fontFamily: FUENTE.ui },
  chipActive: { padding: '3px 10px', fontSize: '10.5px', fontWeight: '600', background: COLOR.oscuro, color: '#D9A441', border: `1px solid ${COLOR.oscuro}`, borderRadius: '999px', cursor: 'pointer', fontFamily: FUENTE.ui },
  contadorReglas: { fontSize: '11px', color: COLOR.textoSuave, marginBottom: '10px' },
  avisoSinRegla: { color: '#A9542F', fontWeight: '600' },
  avisoHereda: { fontSize: '10.5px', color: '#8A7B62', fontWeight: '400' },
  origenPropia: { fontSize: '10px', padding: '2px 8px', background: '#E4EAD6', color: '#4C5735', borderRadius: '999px' },
  origenHeredada: { fontSize: '10px', padding: '2px 8px', background: '#F4EFE3', color: '#8A7B62', borderRadius: '999px' },
  origenSin: { fontSize: '10px', padding: '2px 8px', background: '#F9E7E2', color: '#A9542F', borderRadius: '999px' },
};
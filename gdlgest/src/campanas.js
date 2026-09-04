// Campañas disponibles y utilidades multi-campaña
export const CAMPANAS_DISPONIBLES = [
  { id: '2023-2024', label: 'Campaña 2023-2024' },
  { id: '2024-2025', label: 'Campaña 2024-2025' },
  { id: '2025-2026', label: 'Campaña 2025-2026' },
  { id: '2026-2027', label: 'Campaña 2026-2027' },
  { id: '2027-2028', label: 'Campaña 2027-2028' },
];

export const CAMPANA_DEFAULT = '2025-2026';

// Generar los 12 meses de una campaña (de Junio del año inicial a Mayo del año siguiente)
export const getMesesCampana = (campana) => {
  const anioInicio = parseInt((campana || CAMPANA_DEFAULT).split('-')[0], 10) || 2025;
  
  return [
    { key: `${anioInicio}-06`, label: `Jun ${anioInicio}` },
    { key: `${anioInicio}-07`, label: `Jul ${anioInicio}` },
    { key: `${anioInicio}-08`, label: `Ago ${anioInicio}` },
    { key: `${anioInicio}-09`, label: `Sep ${anioInicio}` },
    { key: `${anioInicio}-10`, label: `Oct ${anioInicio}` },
    { key: `${anioInicio}-11`, label: `Nov ${anioInicio}` },
    { key: `${anioInicio}-12`, label: `Dic ${anioInicio}` },
    { key: `${anioInicio + 1}-01`, label: `Ene ${anioInicio + 1}` },
    { key: `${anioInicio + 1}-02`, label: `Feb ${anioInicio + 1}` },
    { key: `${anioInicio + 1}-03`, label: `Mar ${anioInicio + 1}` },
    { key: `${anioInicio + 1}-04`, label: `Abr ${anioInicio + 1}` },
    { key: `${anioInicio + 1}-05`, label: `May ${anioInicio + 1}` },
  ];
};

// Tipo de cambio oficial utilizado por el Contador en la campaña 25-26
export const TC_CONTADOR_CAMPANA = {
  '2025-2026': 1376.17,
  '2024-2025': 980.00,
  '2026-2027': 1550.00,
};

export const getTcContador = (campana) => {
  return TC_CONTADOR_CAMPANA[campana] || 1376.17;
};

// Catálogo y Gobernanza de Fuentes de Información
export const FUENTES_INFORMACION = [
  {
    id: 'macrogest',
    nombre: 'MacroGest (Sistema Interno)',
    tipo: 'Software ERP / Gestión Agropecuaria',
    responsable: 'Administración & Operaciones',
    color: '#7C8460',
    icono: '💻',
    archivos: [
      {
        nombre: 'Balance por Sector mensual',
        formato: 'XLS / XLSX',
        patron: 'Balance_por_Sector_YYYY_MM_moneda.xls',
        destino: 'Estado de Resultados (EERR)',
        frecuencia: 'Mensual',
        descripcion: 'Detalle de cuentas 4 (Gastos) y 5 (Ingresos) por sector / unidad de negocio.'
      },
      {
        nombre: 'Cosecha por Lote',
        formato: 'XLS / XLSX',
        patron: 'Cosecha_[Cultivo].xlsx (solapa RINDE X CAMPO)',
        destino: 'Margen Bruto Agrícola',
        frecuencia: 'Por campaña',
        descripcion: 'Kilos de cosecha campo y neto, superficie sembrada y cosechada por lote de GDL.'
      },
      {
        nombre: 'Laboreos por Socios',
        formato: 'XLS / XLSX',
        patron: 'Laboreos_[Cultivo].xlsx',
        destino: 'Margen Bruto Agrícola',
        frecuencia: 'Por campaña',
        descripcion: 'Costos de labores en U$S imputables a la firma (Socio 1).'
      },
      {
        nombre: 'Listado Total de Productos Aplicados',
        formato: 'XLS / XLSX',
        patron: 'Productos_Aplicados_[Cultivo].xlsx',
        destino: 'Margen Bruto Agrícola',
        frecuencia: 'Por campaña',
        descripcion: 'Cantidades físicas de insumos (herbicidas, fertilizantes, curasemillas, etc.).'
      },
    ],
  },
  {
    id: 'excels_internos',
    nombre: 'Planillas Internas de Gestión',
    tipo: 'Excels de Planificación y Control',
    responsable: 'Gerencia Técnica & Agronómica',
    color: '#4A5A5C',
    icono: '📑',
    archivos: [
      {
        nombre: 'Plan de Siembra y Lotes Maestro',
        formato: 'XLS / XLSX',
        patron: 'Plan_Siembra_Campana.xlsx',
        destino: 'Margen Bruto (Superficies)',
        frecuencia: 'Anual',
        descripcion: 'Hectáreas asignadas por campo, lote y cultivo para la campaña activa.'
      },
      {
        nombre: 'Asignación de Gastos de Estructura e Indirectos',
        formato: 'XLS / Carga Manual',
        patron: 'Indirectos_Estructura.xlsx',
        destino: 'Margen Bruto & EERR',
        frecuencia: 'Mensual / Campaña',
        descripcion: 'Honorarios agronómicos, seguros, arriendos y estructura no operativa.'
      },
      {
        nombre: 'Parámetros Económicos de Comercialización',
        formato: 'Carga en Sistema',
        patron: 'Precios pizarra, comisiones y fletes',
        destino: 'Margen Bruto',
        frecuencia: 'Dinámica',
        descripcion: 'Precios U$S/tn a cosecha, fletes en pesos y tipo de cambio de liquidación.'
      },
    ],
  },
  {
    id: 'estudio_contable',
    nombre: 'Estudio Contable Externo',
    tipo: 'Planilla de Cierre & Conciliación',
    responsable: 'Contador General',
    color: '#B8873B',
    icono: '⚖️',
    archivos: [
      {
        nombre: 'EERR CONSOLIDADO CAMP (Total Anual)',
        formato: 'XLS / XLSX',
        patron: 'EERR CONSOLIDADO CAMP 25-26.xlsx',
        destino: 'Módulo de Conciliación',
        frecuencia: 'Anual / Cierre',
        descripcion: 'Planilla de gestión elaborada por el contador. Solapa TOTAL ANUAL en pesos (TC 1.376,17 AR$/USD).'
      },
    ],
  },
];

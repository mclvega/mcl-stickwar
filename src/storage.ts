import { DEFAULT_LOOK, LOOK_OPTIONS, type Look } from './game/characters';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

export interface Record_ {
  nombre: string;
  nivel: number;
  fecha: string;
}

export interface Guardado {
  v: 1;
  nombre: string | null;
  /** Nivel más alto alcanzado (se puede seguir desde él). */
  nivelMax: number;
  records: Record_[];
  /** Apariencia del jugador (mismo sistema de personajes que el Arcade). */
  look: Look;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-stickwar:v1';
const MAX_RECORDS = 10;

export const guardadoNuevo = (): Guardado => ({ v: 1, nombre: null, nivelMax: 1, records: [], look: { ...DEFAULT_LOOK, shirt: 0x1e88e5, hat: 'helmet' }, config: configPorDefecto() });

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return { nombre: v.nombre.slice(0, 20), nivel: entero(v.nivel, 1, 1e6, 1), fecha: v.fecha };
}

const comparar = (a: Record_, b: Record_) => b.nivel - a.nivel;

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarLook(entrada: unknown, porDefecto: Look): Look {
  if (!esObjeto(entrada)) return { ...porDefecto };
  const look = { ...porDefecto } as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(LOOK_OPTIONS)) {
    const valor = entrada[clave];
    const validos = (opciones as readonly unknown[]).map((o) => (typeof o === 'object' && o ? (o as { id: string }).id : o));
    if (validos.includes(valor)) look[clave] = valor;
  }
  return look as unknown as Look;
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const records = Array.isArray(entrada.records)
    ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
    : [];
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    nivelMax: entero(entrada.nivelMax, 1, 1e6, 1),
    records,
    look: normalizarLook(entrada.look, base.look),
    config: normalizarConfig(entrada.config),
  };
}

export function agregarRecord(g: Guardado, r: Record_): boolean {
  g.records.push(r);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return g.records.includes(r);
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}

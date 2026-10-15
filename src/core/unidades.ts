export type TipoUnidad = 'minero' | 'espadachin' | 'arquero' | 'lancero' | 'mago' | 'gigante';

export interface DatosUnidad {
  nombre: string;
  icono: string;
  coste: number;
  /** Segundos de entrenamiento. */
  tiempo: number;
  poblacion: number;
  vida: number;
  /** Daño por golpe y segundos entre golpes. */
  dano: number;
  espera: number;
  alcance: number;
  velocidad: number;
  /** Reducción del daño recibido (0 a 1). */
  armadura: number;
  /** Radio del daño en área (0 = un solo objetivo). */
  area: number;
  /** Lanza un proyectil en vez de golpear cuerpo a cuerpo. */
  distancia: boolean;
  /** Nivel a partir del cual se puede entrenar. */
  desde: number;
  tecla: string;
}

export const UNIDADES: Record<TipoUnidad, DatosUnidad> = {
  minero: { nombre: 'Minero', icono: '⛏️', coste: 150, tiempo: 3, poblacion: 1, vida: 70, dano: 4, espera: 1, alcance: 1.2, velocidad: 3.2, armadura: 0, area: 0, distancia: false, desde: 1, tecla: '1' },
  espadachin: { nombre: 'Espadachín', icono: '🗡️', coste: 125, tiempo: 3, poblacion: 1, vida: 130, dano: 14, espera: 0.8, alcance: 1.3, velocidad: 4.2, armadura: 0, area: 0, distancia: false, desde: 1, tecla: '2' },
  arquero: { nombre: 'Arquero', icono: '🏹', coste: 300, tiempo: 4, poblacion: 1, vida: 90, dano: 12, espera: 1.3, alcance: 14, velocidad: 3.6, armadura: 0, area: 0, distancia: true, desde: 1, tecla: '3' },
  lancero: { nombre: 'Lancero', icono: '🛡️', coste: 500, tiempo: 5, poblacion: 2, vida: 420, dano: 22, espera: 1.2, alcance: 1.8, velocidad: 2.8, armadura: 0.35, area: 0, distancia: false, desde: 2, tecla: '4' },
  mago: { nombre: 'Mago', icono: '🔮', coste: 900, tiempo: 7, poblacion: 3, vida: 120, dano: 38, espera: 3, alcance: 12, velocidad: 2.8, armadura: 0, area: 3, distancia: true, desde: 3, tecla: '5' },
  gigante: { nombre: 'Gigante', icono: '🗿', coste: 1500, tiempo: 10, poblacion: 4, vida: 1500, dano: 70, espera: 2, alcance: 2.6, velocidad: 1.7, armadura: 0.2, area: 2.2, distancia: false, desde: 4, tecla: '6' },
};

export const ORDEN_UNIDADES = Object.keys(UNIDADES) as TipoUnidad[];

export const POBLACION_MAX = 40;
export const ORO_POR_VIAJE = 30;
export const SEGUNDOS_MINANDO = 3;

/** Daño final tras la armadura. */
export const danoTrasArmadura = (dano: number, armadura: number) => dano * (1 - armadura);

export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Multiplicador del oro que gana el enemigo. */
  oroEnemigo: number;
  /** Multiplicador de la vida de las unidades enemigas. */
  vidaEnemigo: number;
  /** Oro con el que empiezas cada nivel. */
  oroInicial: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', oroEnemigo: 0.55, vidaEnemigo: 0.7, oroInicial: 900 },
  facil: { nombre: 'Fácil', oroEnemigo: 0.75, vidaEnemigo: 0.85, oroInicial: 700 },
  normal: { nombre: 'Normal', oroEnemigo: 1, vidaEnemigo: 1, oroInicial: 500 },
  desafio: { nombre: 'Desafío', oroEnemigo: 1.25, vidaEnemigo: 1.15, oroInicial: 400 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

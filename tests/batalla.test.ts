import { describe, expect, it } from 'vitest';
import { MODOS } from '../src/core/difficulty';
import { PASO } from '../src/core/loop';
import { danoTrasArmadura, POBLACION_MAX, UNIDADES } from '../src/core/unidades';
import { Batalla } from '../src/game/batalla';
import { normalizarConfig } from '../src/settings';
import { agregarRecord, guardadoNuevo, normalizarGuardado } from '../src/storage';

const nada = { victoria: () => undefined, derrota: () => undefined };

describe('economía', () => {
  it('los mineros traen oro', () => {
    const b = new Batalla(1, () => MODOS.normal, nada, 1);
    b.jugador.oro = 0;
    for (let i = 0; i < 60 * 20; i++) b.actualizar(PASO);
    // 20 s: ingreso pasivo (40) + varios viajes de los 2 mineros.
    expect(b.jugador.oro).toBeGreaterThan(100);
  });

  it('entrenar cuesta oro, respeta la población y las unidades bloqueadas', () => {
    const b = new Batalla(1, () => MODOS.normal, nada, 2);
    b.jugador.oro = 10000;
    expect(b.entrenar('espadachin')).toBe(true);
    expect(b.jugador.oro).toBe(10000 - UNIDADES.espadachin.coste);
    expect(b.entrenar('gigante')).toBe(false); // se desbloquea en el nivel 4
    b.jugador.oro = 1e6;
    while (b.entrenar('espadachin')) b.jugador.cola = [];
    expect(b.poblacion('jugador')).toBeLessThanOrEqual(POBLACION_MAX);
  });

  it('la armadura reduce el daño', () => {
    expect(danoTrasArmadura(100, 0.35)).toBeCloseTo(65);
  });
});

describe('batalla simulada', () => {
  /** Jugador automático: mineros al principio, luego tropas y ataque cuando tiene ejército. */
  function jugarAuto(b: Batalla, segundos: number) {
    for (let i = 0; i < 60 * segundos && !b.terminada; i++) {
      if (i % 30 === 0) {
        const mineros = b.unidades.filter((u) => u.viva && u.lado === 'jugador' && u.tipo === 'minero').length;
        if (mineros < 5) b.entrenar('minero');
        else b.entrenar(i % 90 === 0 ? 'arquero' : 'espadachin');
        const soldados = b.unidades.filter((u) => u.viva && u.lado === 'jugador' && u.tipo !== 'minero').length;
        b.ordenar(soldados >= 10 ? 'atacar' : 'defender');
      }
      b.actualizar(PASO);
    }
  }

  it('se puede ganar el nivel 1', () => {
    let gano = 0;
    const b = new Batalla(1, () => MODOS.muyFacil, { victoria: (n) => (gano = n), derrota: () => undefined }, 5);
    jugarAuto(b, 600);
    expect(gano).toBe(1);
  });

  it('sin hacer nada, un nivel alto se pierde', () => {
    let perdio = 0;
    const b = new Batalla(8, () => MODOS.desafio, { victoria: () => undefined, derrota: (n) => (perdio = n) }, 6);
    for (let i = 0; i < 60 * 600 && !b.terminada; i++) b.actualizar(PASO);
    expect(perdio).toBe(8);
  });

  it('los niveles crecen sin fin', () => {
    const a = new Batalla(1, () => MODOS.normal, nada, 1);
    const z = new Batalla(30, () => MODOS.normal, nada, 1);
    expect(z.enemigo.estatua.vidaMax).toBeGreaterThan(a.enemigo.estatua.vidaMax);
    expect(z.largo).toBeGreaterThan(a.largo);
  });
});

describe('guardado', () => {
  it('normaliza', () => {
    const g = normalizarGuardado({ nivelMax: -1, records: [{ nombre: 'a', nivel: 3, fecha: 'x' }, { nombre: 'b', nivel: 9, fecha: 'x' }] });
    expect(g.nivelMax).toBe(1);
    expect(g.records[0].nombre).toBe('b');
    expect(normalizarConfig({}).pantallaCompleta).toBe(true);
    expect(agregarRecord(guardadoNuevo(), { nombre: 'c', nivel: 1, fecha: 'x' })).toBe(true);
  });
});

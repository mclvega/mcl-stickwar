import type { Modo } from '../core/difficulty';
import { crearRng, type Rng } from '../core/rng';
import { danoTrasArmadura, ORDEN_UNIDADES, ORO_POR_VIAJE, POBLACION_MAX, SEGUNDOS_MINANDO, UNIDADES, type TipoUnidad } from '../core/unidades';

export type Lado = 'jugador' | 'enemigo';
export type Orden = 'defender' | 'atacar' | 'guarnicion';

export interface Unidad {
  id: number;
  tipo: TipoUnidad;
  lado: Lado;
  x: number;
  /** Profundidad (para que no se amontonen en una línea). */
  z: number;
  vida: number;
  vidaMax: number;
  cd: number;
  estado: 'caminar' | 'quieto' | 'atacar' | 'minar' | 'volver';
  carga: number;
  minando: number;
  /** Segundos desde el último golpe (para animar). */
  golpe: number;
  moviendose: boolean;
  muerteT: number;
  viva: boolean;
}

export interface Estatua {
  lado: Lado;
  x: number;
  vida: number;
  vidaMax: number;
  cd: number;
}

export interface Proyectil {
  lado: Lado;
  x: number;
  y: number;
  z: number;
  desdeX: number;
  objetivo: Unidad | Estatua;
  dano: number;
  area: number;
  /** 0 a 1: avance del vuelo (en arco). */
  t: number;
  duracion: number;
  magia: boolean;
}

export interface Ejercito {
  lado: Lado;
  oro: number;
  orden: Orden;
  cola: Array<{ tipo: TipoUnidad; t: number }>;
  estatua: Estatua;
  minas: number[];
}

export interface EventosBatalla {
  golpe?: (u: Unidad | Estatua) => void;
  muerte?: (u: Unidad) => void;
  entrenada?: (u: Unidad) => void;
  victoria: (nivel: number) => void;
  derrota: (nivel: number) => void;
}

const esUnidad = (o: Unidad | Estatua): o is Unidad => 'tipo' in o;

export class Batalla {
  readonly largo: number;
  unidades: Unidad[] = [];
  proyectiles: Proyectil[] = [];
  jugador: Ejercito;
  enemigo: Ejercito;
  tiempo = 0;
  terminada = false;
  pausada = false;
  private rng: Rng;
  private siguienteId = 1;
  private decisionIA = 0;
  private modoNivel: Modo;

  constructor(readonly nivel: number, modo: () => Modo, private eventos: EventosBatalla, semilla = Date.now()) {
    this.rng = crearRng(semilla);
    this.modoNivel = modo();
    this.largo = 110 + Math.min(nivel, 10) * 4;
    const vidaEstatuaEnemiga = 2500 * (1 + (nivel - 1) * 0.15);
    this.jugador = { lado: 'jugador', oro: this.modoNivel.oroInicial, orden: 'defender', cola: [], estatua: { lado: 'jugador', x: 6, vida: 2500, vidaMax: 2500, cd: 0 }, minas: [14, 19] };
    this.enemigo = {
      lado: 'enemigo', oro: 300 + nivel * 120, orden: 'defender', cola: [],
      estatua: { lado: 'enemigo', x: this.largo - 6, vida: vidaEstatuaEnemiga, vidaMax: vidaEstatuaEnemiga, cd: 0 },
      minas: [this.largo - 14, this.largo - 19],
    };
    for (const lado of ['jugador', 'enemigo'] as const) {
      this.crear('minero', lado);
      this.crear('minero', lado);
      this.crear('espadachin', lado);
    }
    // En niveles altos el enemigo empieza con más tropas.
    for (let i = 0; i < Math.min(6, Math.floor(nivel / 2)); i++) this.crear(i % 2 ? 'arquero' : 'espadachin', 'enemigo');
  }

  ejercito(lado: Lado): Ejercito {
    return lado === 'jugador' ? this.jugador : this.enemigo;
  }

  /** Hacia dónde avanza cada lado. */
  static direccion(lado: Lado) {
    return lado === 'jugador' ? 1 : -1;
  }

  poblacion(lado: Lado): number {
    const e = this.ejercito(lado);
    return this.unidades.filter((u) => u.viva && u.lado === lado).reduce((a, u) => a + UNIDADES[u.tipo].poblacion, 0) + e.cola.reduce((a, c) => a + UNIDADES[c.tipo].poblacion, 0);
  }

  disponible(tipo: TipoUnidad): boolean {
    return UNIDADES[tipo].desde <= this.nivel;
  }

  /** Encarga una unidad si hay oro y sitio. */
  entrenar(tipo: TipoUnidad, lado: Lado = 'jugador'): boolean {
    const e = this.ejercito(lado);
    const d = UNIDADES[tipo];
    if (lado === 'jugador' && !this.disponible(tipo)) return false;
    if (e.oro < d.coste || this.poblacion(lado) + d.poblacion > POBLACION_MAX || e.cola.length >= 8) return false;
    e.oro -= d.coste;
    e.cola.push({ tipo, t: d.tiempo });
    return true;
  }

  ordenar(orden: Orden, lado: Lado = 'jugador') {
    this.ejercito(lado).orden = orden;
  }

  private crear(tipo: TipoUnidad, lado: Lado): Unidad {
    const d = UNIDADES[tipo];
    const e = this.ejercito(lado);
    const vida = d.vida * (lado === 'enemigo' ? this.modoNivel.vidaEnemigo * (1 + (this.nivel - 1) * 0.06) : 1);
    const u: Unidad = {
      id: this.siguienteId++, tipo, lado, x: e.estatua.x + Batalla.direccion(lado) * 2, z: (this.rng.siguiente() - 0.5) * 3.2,
      vida, vidaMax: vida, cd: this.rng.siguiente(), estado: 'caminar', carga: 0, minando: 0, golpe: 9, moviendose: false, muerteT: 0, viva: true,
    };
    this.unidades.push(u);
    return u;
  }

  /* ---------- Actualización ---------- */

  actualizar(dt: number) {
    if (this.pausada || this.terminada) return;
    this.tiempo += dt;
    for (const e of [this.jugador, this.enemigo]) {
      // Ingreso pasivo pequeño para que nunca te quedes sin poder hacer nada.
      e.oro += dt * (e.lado === 'enemigo' ? (2 + this.nivel * 0.4) * this.modoNivel.oroEnemigo : 2);
      if (e.cola.length) {
        e.cola[0].t -= dt;
        if (e.cola[0].t <= 0) {
          const nueva = this.crear(e.cola.shift()!.tipo, e.lado);
          this.eventos.entrenada?.(nueva);
        }
      }
      this.actualizarEstatua(e.estatua, dt);
    }
    this.decisionIA -= dt;
    if (this.decisionIA <= 0) {
      this.decisionIA = 1;
      this.pensarEnemigo();
    }
    for (const u of this.unidades) {
      if (!u.viva) {
        u.muerteT += dt;
        continue;
      }
      u.cd -= dt;
      u.golpe += dt;
      if (u.tipo === 'minero') this.actualizarMinero(u, dt);
      else this.actualizarSoldado(u, dt);
    }
    this.actualizarProyectiles(dt);
    // Los cuerpos desaparecen al rato.
    this.unidades = this.unidades.filter((u) => u.viva || u.muerteT < 4);

    if (this.enemigo.estatua.vida <= 0 && !this.terminada) {
      this.terminada = true;
      this.eventos.victoria(this.nivel);
    } else if (this.jugador.estatua.vida <= 0 && !this.terminada) {
      this.terminada = true;
      this.eventos.derrota(this.nivel);
    }
  }

  private enemigosDe(lado: Lado) {
    return this.unidades.filter((u) => u.viva && u.lado !== lado);
  }

  private actualizarEstatua(s: Estatua, dt: number) {
    if (s.vida <= 0) return;
    s.cd -= dt;
    if (s.cd > 0) return;
    // La estatua se defiende con flechas.
    let objetivo: Unidad | null = null;
    let d = 13;
    for (const u of this.enemigosDe(s.lado)) {
      const dist = Math.abs(u.x - s.x);
      if (dist < d) {
        d = dist;
        objetivo = u;
      }
    }
    if (!objetivo) return;
    s.cd = 1.4;
    this.disparar(s.lado, s.x, 6, objetivo, 16, 0, false);
  }

  private actualizarMinero(u: Unidad, dt: number) {
    const e = this.ejercito(u.lado);
    const casa = e.estatua.x + Batalla.direccion(u.lado) * 1.5;
    const peligro = this.enemigosDe(u.lado).some((o) => Math.abs(o.x - u.x) < 5);
    if (e.orden === 'guarnicion' || peligro) {
      this.caminarHacia(u, casa, dt);
      return;
    }
    const mina = e.minas[u.id % e.minas.length];
    if (u.carga === 0) {
      if (this.caminarHacia(u, mina, dt)) {
        u.estado = 'minar';
        u.minando += dt;
        u.golpe = u.minando % 0.8 < dt ? 0 : u.golpe;
        if (u.minando >= SEGUNDOS_MINANDO) {
          u.carga = ORO_POR_VIAJE;
          u.minando = 0;
        }
      }
    } else if (this.caminarHacia(u, casa, dt)) {
      e.oro += u.carga * (u.lado === 'enemigo' ? this.modoNivel.oroEnemigo : 1);
      u.carga = 0;
    }
  }

  /** Devuelve true al llegar. */
  private caminarHacia(u: Unidad, x: number, dt: number, margen = 0.3): boolean {
    const dx = x - u.x;
    if (Math.abs(dx) <= margen) {
      u.moviendose = false;
      return true;
    }
    const paso = Math.sign(dx) * Math.min(Math.abs(dx), UNIDADES[u.tipo].velocidad * dt);
    u.x += paso;
    u.moviendose = true;
    u.estado = 'caminar';
    return false;
  }

  private actualizarSoldado(u: Unidad, dt: number) {
    const d = UNIDADES[u.tipo];
    const e = this.ejercito(u.lado);
    const rival = this.ejercito(u.lado === 'jugador' ? 'enemigo' : 'jugador');
    const dir = Batalla.direccion(u.lado);

    if (e.orden === 'guarnicion') {
      // Se refugian detrás de la estatua y se curan poco a poco.
      if (this.caminarHacia(u, e.estatua.x - dir * 2, dt, 0.8)) u.vida = Math.min(u.vidaMax, u.vida + u.vidaMax * 0.05 * dt);
      return;
    }

    // Objetivo: el enemigo más cercano dentro del radio de alerta, o la estatua rival si atacamos.
    const linea = e.estatua.x + dir * 24;
    const alerta = d.alcance + 7;
    let objetivo: Unidad | Estatua | null = null;
    let dist = Infinity;
    for (const o of this.enemigosDe(u.lado)) {
      const dd = Math.abs(o.x - u.x);
      // Defendiendo, no persiguen más allá de unos metros de la línea.
      if (e.orden === 'defender' && (o.x - linea) * dir > 10) continue;
      if (dd < alerta && dd < dist) {
        dist = dd;
        objetivo = o;
      }
    }
    const distEstatua = Math.abs(rival.estatua.x - u.x);
    if (!objetivo && e.orden === 'atacar') {
      objetivo = rival.estatua;
      dist = distEstatua;
    } else if (objetivo && distEstatua < dist) {
      objetivo = rival.estatua;
      dist = distEstatua;
    }

    if (objetivo && dist <= d.alcance + (esUnidad(objetivo) ? 0 : 2.5)) {
      u.moviendose = false;
      u.estado = 'atacar';
      if (u.cd <= 0) {
        u.cd = d.espera;
        u.golpe = 0;
        if (d.distancia) this.disparar(u.lado, u.x, u.tipo === 'mago' ? 2.2 : 1.6, objetivo, d.dano, d.area, u.tipo === 'mago', u.z);
        else this.golpear(u.lado, objetivo, d.dano, d.area);
      }
      return;
    }
    if (objetivo) {
      this.caminarHacia(u, objetivo.x - dir * d.alcance * 0.8, dt, 0.1);
      return;
    }
    // Sin objetivo: a la línea de defensa (escalonada según el alcance: los de distancia, detrás).
    const puesto = linea - dir * (d.distancia ? 5 : 0) - dir * (u.id % 4) * 0.8;
    if (this.caminarHacia(u, puesto, dt, 0.5)) u.estado = 'quieto';
  }

  private golpear(lado: Lado, objetivo: Unidad | Estatua, dano: number, area: number) {
    if (area > 0) {
      for (const o of this.enemigosDe(lado)) if (Math.abs(o.x - objetivo.x) <= area) this.herir(o, dano);
      const estatua = this.ejercito(lado === 'jugador' ? 'enemigo' : 'jugador').estatua;
      if (Math.abs(estatua.x - objetivo.x) <= area + 2.5) this.herir(estatua, dano);
    } else this.herir(objetivo, dano);
  }

  private disparar(lado: Lado, x: number, y: number, objetivo: Unidad | Estatua, dano: number, area: number, magia: boolean, z = 0) {
    const distancia = Math.abs(objetivo.x - x);
    this.proyectiles.push({ lado, x, y, z, desdeX: x, objetivo, dano, area, t: 0, duracion: Math.max(0.25, distancia / (magia ? 14 : 26)), magia });
  }

  private actualizarProyectiles(dt: number) {
    this.proyectiles = this.proyectiles.filter((p) => {
      p.t += dt / p.duracion;
      p.x = p.desdeX + (p.objetivo.x - p.desdeX) * Math.min(1, p.t);
      p.y = 1.5 + Math.sin(Math.min(1, p.t) * Math.PI) * (p.magia ? 1 : 2.5);
      if (p.t < 1) return true;
      const vivo = esUnidad(p.objetivo) ? p.objetivo.viva : p.objetivo.vida > 0;
      if (vivo || p.area > 0) this.golpear(p.lado, p.objetivo, p.dano, p.area);
      return false;
    });
  }

  private herir(o: Unidad | Estatua, dano: number) {
    if (esUnidad(o)) {
      if (!o.viva) return;
      o.vida -= danoTrasArmadura(dano, UNIDADES[o.tipo].armadura);
      this.eventos.golpe?.(o);
      if (o.vida <= 0) {
        o.vida = 0;
        o.viva = false;
        o.muerteT = 0;
        this.eventos.muerte?.(o);
      }
      return;
    }
    if (o.vida <= 0) return;
    o.vida = Math.max(0, o.vida - dano);
    this.eventos.golpe?.(o);
  }

  /** Fuerza militar aproximada (vida × daño por segundo) de un lado. */
  fuerza(lado: Lado, cerca?: { x: number; radio: number }): number {
    return this.unidades
      .filter((u) => u.viva && u.lado === lado && u.tipo !== 'minero' && (!cerca || Math.abs(u.x - cerca.x) < cerca.radio))
      .reduce((a, u) => a + Math.sqrt(u.vida * (UNIDADES[u.tipo].dano / UNIDADES[u.tipo].espera)), 0);
  }

  /* ---------- IA enemiga ---------- */

  private pensarEnemigo() {
    const e = this.enemigo;
    const mineros = this.unidades.filter((u) => u.viva && u.lado === 'enemigo' && u.tipo === 'minero').length + e.cola.filter((c) => c.tipo === 'minero').length;
    if (mineros < Math.min(8, 3 + Math.floor(this.nivel / 2))) {
      this.entrenar('minero', 'enemigo');
    } else {
      const opciones = ORDEN_UNIDADES.filter((t) => t !== 'minero' && UNIDADES[t].desde <= this.nivel);
      // A veces ahorra para una unidad cara.
      const deseo = this.rng.elegir(opciones);
      if (!this.entrenar(deseo, 'enemigo') && this.rng.siguiente() < 0.3) this.entrenar(this.rng.elegir(opciones.slice(0, 2)), 'enemigo');
    }

    const propia = this.fuerza('enemigo');
    const delJugador = this.fuerza('jugador');
    const amenaza = this.fuerza('jugador', { x: e.estatua.x, radio: 30 });
    if (e.orden !== 'atacar' && propia > Math.max(40 + this.nivel * 12, delJugador * 1.3)) e.orden = 'atacar';
    else if (e.orden === 'atacar' && propia < delJugador * 0.6) e.orden = 'defender';
    // Si su base está en peligro y no puede con ello, se refugia un momento.
    if (amenaza > propia * 2 && e.estatua.vida < e.estatua.vidaMax * 0.3) e.orden = 'guarnicion';
    else if (e.orden === 'guarnicion' && amenaza < propia) e.orden = 'defender';
  }
}

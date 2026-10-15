import * as THREE from 'three';
import type { TipoUnidad } from '../core/unidades';
import { animateWalk, createAvatar, DEFAULT_LOOK, type Look } from './characters';
import { Batalla, type Estatua, type Lado, type Unidad } from './batalla';

const cacheMat = new Map<string, THREE.Material>();
function mat(color: number, basico = false, emisivo = 0): THREE.Material {
  const clave = `${color}|${basico}|${emisivo}`;
  let m = cacheMat.get(clave);
  if (!m) {
    m = basico ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, emissive: emisivo });
    cacheMat.set(clave, m);
  }
  return m;
}

function malla(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const COLOR_EQUIPO: Record<Lado, number> = { jugador: 0x1e88e5, enemigo: 0xc62828 };

/** Apariencia de cada unidad: las tuyas usan tu personaje; las enemigas, ropa roja y oscura. */
function lookUnidad(tipo: TipoUnidad, lado: Lado, propio: Look, id: number): Look {
  const base: Look = lado === 'jugador' ? { ...propio } : { ...DEFAULT_LOOK, skin: [0xe0ac69, 0xc68642, 0x8d5524][id % 3], hairColor: 0x212121, facialHair: id % 2 ? 'beard' : 'stubble', bottomColor: 0x212121 };
  const color = lado === 'jugador' ? propio.shirt : COLOR_EQUIPO.enemigo;
  switch (tipo) {
    case 'minero':
      return { ...base, shirt: lado === 'jugador' ? 0x8d6e63 : 0x5d4037, hat: 'helmet', accessory: 'none' };
    case 'espadachin':
      return { ...base, shirt: color, hat: lado === 'jugador' ? base.hat : 'none', accessory: 'none' };
    case 'arquero':
      return { ...base, shirt: lado === 'jugador' ? 0x43a047 : 0x6d2a2a, hat: 'cap', hatColor: lado === 'jugador' ? 0x2e7d32 : 0x3e2723 };
    case 'lancero':
      return { ...base, shirt: color, body: 'strong', hat: 'helmet', accessory: 'none' };
    case 'mago':
      return { ...base, shirt: lado === 'jugador' ? 0x5e35b1 : 0x4a148c, bottom: 'skirt', bottomColor: lado === 'jugador' ? 0x311b92 : 0x1a0033, hat: 'none', hair: 'long', hairColor: 0xbdbdbd, facialHair: 'beard' };
    case 'gigante':
      return { ...base, shirt: color, body: 'chubby', height: 'tall', hat: 'none', hair: 'bald', facialHair: 'beard', accessory: 'none' };
  }
}

/** Arma o herramienta en la mano derecha según el tipo. */
function herramienta(tipo: TipoUnidad): THREE.Group {
  const g = new THREE.Group();
  const madera = mat(0x6d4c41);
  const metal = mat(0xb0bec5);
  switch (tipo) {
    case 'minero': {
      g.add(malla(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), madera, 0, 0, 0.25).rotateX(Math.PI / 2));
      const pico = malla(new THREE.BoxGeometry(0.4, 0.05, 0.05), metal, 0, 0, 0.58);
      g.add(pico);
      break;
    }
    case 'espadachin':
      g.add(malla(new THREE.BoxGeometry(0.05, 0.12, 0.8), metal, 0, 0, 0.45));
      g.add(malla(new THREE.BoxGeometry(0.2, 0.04, 0.05), mat(0xffb300), 0, 0, 0.05));
      break;
    case 'arquero': {
      const arco = malla(new THREE.TorusGeometry(0.3, 0.025, 6, 16, Math.PI), madera);
      arco.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      arco.position.z = 0.1;
      g.add(arco);
      break;
    }
    case 'lancero':
      g.add(malla(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), madera, 0, 0, 0.5).rotateX(Math.PI / 2));
      g.add(malla(new THREE.ConeGeometry(0.06, 0.2, 6), metal, 0, 0, 1.35).rotateX(Math.PI / 2));
      break;
    case 'mago':
      g.add(malla(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), madera, 0, 0.2, 0.1));
      g.add(malla(new THREE.SphereGeometry(0.1, 10, 8), mat(0xce93d8, true), 0, 0.82, 0.1));
      break;
    case 'gigante':
      g.add(malla(new THREE.CylinderGeometry(0.08, 0.16, 1.1, 8), madera, 0, 0, 0.5).rotateX(Math.PI / 2));
      break;
  }
  return g;
}

interface Modelo {
  grupo: THREE.Group;
  cuerpo: THREE.Group;
  saco?: THREE.Mesh;
}

class Reserva {
  private lista: THREE.Object3D[] = [];
  private usadas = 0;
  constructor(private padre: THREE.Object3D, private crear: () => THREE.Object3D) {}
  inicio() {
    this.usadas = 0;
  }
  tomar(): THREE.Object3D {
    if (this.usadas >= this.lista.length) {
      const o = this.crear();
      this.lista.push(o);
      this.padre.add(o);
    }
    const o = this.lista[this.usadas++];
    o.visible = true;
    return o;
  }
  fin() {
    for (let i = this.usadas; i < this.lista.length; i++) this.lista[i].visible = false;
  }
}

export class Escena3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private escena = new THREE.Scene();
  private modelos = new Map<Unidad, Modelo>();
  private estatuas = new Map<Lado, THREE.Group>();
  private flechas: Reserva;
  private orbes: Reserva;
  private batallaActual: Batalla | null = null;
  private mundo = new THREE.Group();
  private estrellas: THREE.Points;
  private lookActual = '';
  private vector = new THREE.Vector3();

  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x556b2f, 1.4));
    const sol = new THREE.DirectionalLight(0xfff1d6, 1.7);
    sol.position.set(30, 40, 30);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 1024);
    Object.assign(sol.shadow.camera, { left: -80, right: 80, top: 20, bottom: -20, near: 1, far: 150 });
    this.escena.add(sol, sol.target, this.mundo);
    this.sol = sol;

    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 300 - 80;
      pos[i * 3 + 1] = 10 + Math.random() * 60;
      pos[i * 3 + 2] = -60 - Math.random() * 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.estrellas = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35 }));
    this.escena.add(this.estrellas);

    this.flechas = new Reserva(this.escena, () => {
      const g = new THREE.Group();
      g.add(malla(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), mat(0xd7ccc8)).rotateZ(Math.PI / 2));
      g.add(malla(new THREE.ConeGeometry(0.05, 0.14, 5), mat(0x90a4ae), 0.4, 0, 0).rotateZ(-Math.PI / 2));
      return g;
    });
    this.orbes = new Reserva(this.escena, () => malla(new THREE.SphereGeometry(0.22, 12, 10), mat(0xb388ff, true)));
  }

  private sol: THREE.DirectionalLight;

  ajustar(ancho: number, alto: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  private construir(b: Batalla, look: Look) {
    this.mundo.clear();
    for (const m of this.modelos.values()) this.escena.remove(m.grupo);
    this.modelos.clear();
    this.estatuas.clear();
    const L = b.largo;

    const suelo = malla(new THREE.BoxGeometry(L + 80, 1, 16), mat(0x5b8c3a), L / 2, -0.5, 0);
    this.mundo.add(suelo);
    // Camino de tierra por el que marchan los ejércitos.
    this.mundo.add(malla(new THREE.BoxGeometry(L + 20, 0.02, 4.6), mat(0x8d7650), L / 2, 0.01, 0));
    // Colinas y árboles al fondo.
    for (let x = -30; x < L + 40; x += 9) {
      const alto = 5 + ((x * 37) % 9);
      this.mundo.add(malla(new THREE.ConeGeometry(9 + ((x * 13) % 5), alto, 7), mat(0x3f6b2a), x, alto / 2 - 0.5, -22 - ((x * 7) % 6)));
    }
    for (let x = -10; x < L + 10; x += 6.5) {
      const z = -8 - ((x * 11) % 4);
      this.mundo.add(malla(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 6), mat(0x5d4037), x, 0.7, z));
      this.mundo.add(malla(new THREE.ConeGeometry(1.2, 2.6, 7), mat(0x2e5d2a), x, 2.4, z));
    }

    // Minas de oro.
    for (const x of [...b.jugador.minas, ...b.enemigo.minas]) {
      const roca = malla(new THREE.DodecahedronGeometry(1.2, 0), mat(0x6d6d6d), x, 0.7, -3.2);
      roca.scale.set(1.2, 0.8, 1);
      this.mundo.add(roca);
      for (let k = 0; k < 5; k++) {
        const oro = malla(new THREE.OctahedronGeometry(0.28), mat(0xffd54f, false, 0x8a6d00), x - 0.9 + k * 0.45, 1.1 + (k % 2) * 0.3, -2.4);
        oro.rotation.y = k;
        this.mundo.add(oro);
      }
    }

    // Estatuas: un avatar enorme sobre un pedestal, mirando al campo de batalla.
    for (const e of [b.jugador, b.enemigo]) {
      const g = new THREE.Group();
      g.add(malla(new THREE.BoxGeometry(3.4, 1.6, 3.4), mat(0x9e9e9e), 0, 0.8, 0));
      g.add(malla(new THREE.BoxGeometry(3.8, 0.3, 3.8), mat(0x757575), 0, 1.75, 0));
      const piedra: Look = e.lado === 'jugador'
        ? { ...look, skin: 0xcfcfcf, hairColor: 0x9e9e9e, shirt: look.shirt, bottomColor: 0xbdbdbd }
        : { ...DEFAULT_LOOK, skin: 0xbdbdbd, hairColor: 0x757575, shirt: COLOR_EQUIPO.enemigo, bottomColor: 0x9e9e9e, hat: 'crown', facialHair: 'beard' };
      const a = createAvatar(piedra);
      a.group.scale.setScalar(4);
      a.group.position.y = 1.9;
      a.group.rotation.y = Batalla.direccion(e.lado) > 0 ? Math.PI / 2 : -Math.PI / 2;
      const brazos = a.body.userData.arms as THREE.Object3D[];
      const espada = malla(new THREE.BoxGeometry(0.05, 0.1, 0.9), mat(0xe0e0e0), 0, -0.38, 0.45);
      brazos[1].add(espada);
      brazos[1].rotation.x = -1.2;
      g.add(a.group);
      const bandera = malla(new THREE.BoxGeometry(0.05, 1.2, 1.6), mat(COLOR_EQUIPO[e.lado]), -Batalla.direccion(e.lado) * 1.8, 4.2, 1.2);
      g.add(malla(new THREE.CylinderGeometry(0.05, 0.05, 5, 6), mat(0x5d4037), -Batalla.direccion(e.lado) * 1.8, 2.5, 2), bandera);
      bandera.position.z = 2.8;
      g.position.set(e.estatua.x, 0, -1);
      this.mundo.add(g);
      this.estatuas.set(e.lado, g);
    }
    this.batallaActual = b;
  }

  private modelo(u: Unidad, look: Look): Modelo {
    let m = this.modelos.get(u);
    if (!m) {
      const a = createAvatar(lookUnidad(u.tipo, u.lado, look, u.id));
      const brazos = a.body.userData.arms as THREE.Object3D[];
      const h = herramienta(u.tipo);
      h.position.set(0, -0.38, 0);
      brazos[1].add(h);
      if (u.tipo === 'lancero') {
        const escudo = malla(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), mat(u.lado === 'jugador' ? 0xffb300 : 0x424242), 0, -0.3, 0.12);
        escudo.rotation.x = Math.PI / 2;
        brazos[0].add(escudo);
      }
      if (u.tipo === 'mago') a.body.add(malla(new THREE.ConeGeometry(0.26, 0.55, 12), mat(u.lado === 'jugador' ? 0x4527a0 : 0x311b92), 0, 1.68, 0));
      let saco: THREE.Mesh | undefined;
      if (u.tipo === 'minero') {
        saco = malla(new THREE.SphereGeometry(0.2, 8, 6), mat(0xffd54f, false, 0x5a4500), 0, 0.85, -0.3);
        a.body.add(saco);
      }
      a.group.scale.setScalar(u.tipo === 'gigante' ? 2.8 : 1.25);
      m = { grupo: a.group, cuerpo: a.body, saco };
      this.modelos.set(u, m);
      this.escena.add(a.group);
    }
    return m;
  }

  /** `camX` es el centro de la vista; `oscuro` usa cielo negro con estrellas (AMOLED). */
  dibujar(b: Batalla, look: Look, camX: number, oscuro: boolean, efectos: boolean) {
    const clave = JSON.stringify(look);
    if (b !== this.batallaActual || clave !== this.lookActual) {
      this.lookActual = clave;
      this.construir(b, look);
    }
    this.escena.background = new THREE.Color(oscuro ? 0x000000 : 0x9fd3f5);
    this.estrellas.visible = oscuro;
    this.renderer.shadowMap.enabled = efectos;

    this.camara.position.set(camX, 7.5, 24);
    this.camara.lookAt(camX, 1.8, 0);
    this.sol.position.set(camX + 25, 40, 30);
    this.sol.target.position.set(camX, 0, 0);

    const vivas = new Set(b.unidades);
    for (const [u, m] of this.modelos) {
      if (!vivas.has(u)) {
        this.escena.remove(m.grupo);
        this.modelos.delete(u);
      }
    }
    for (const u of b.unidades) {
      const m = this.modelo(u, look);
      const dir = Batalla.direccion(u.lado);
      m.grupo.position.set(u.x, 0, u.z);
      if (u.viva) {
        // Mira hacia donde camina; los mineros que vuelven a casa miran atrás.
        const haciaCasa = u.tipo === 'minero' && u.carga > 0;
        m.grupo.rotation.set(0, (haciaCasa ? -dir : dir) > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        animateWalk(m.cuerpo, b.tiempo * 1.2 + u.id, u.moviendose);
        const brazos = m.cuerpo.userData.arms as THREE.Object3D[];
        const golpe = Math.max(0, 1 - u.golpe * 4);
        if (u.estado === 'atacar' || u.estado === 'minar') brazos[1].rotation.x = -2.2 + golpe * 2;
        else if (u.tipo === 'arquero' || u.tipo === 'mago') brazos[1].rotation.x = u.moviendose ? brazos[1].rotation.x : -0.4;
        if (m.saco) m.saco.visible = u.carga > 0;
      } else {
        const k = Math.min(1, u.muerteT * 3);
        m.grupo.rotation.z = dir * (Math.PI / 2) * k;
        m.grupo.position.y = -Math.max(0, u.muerteT - 2.5) * 0.6;
      }
    }

    // Estatuas: se inclinan un poco al perder vida y se hunden al caer.
    for (const e of [b.jugador, b.enemigo]) {
      const g = this.estatuas.get(e.lado)!;
      const dano = 1 - e.estatua.vida / e.estatua.vidaMax;
      g.rotation.z = -Batalla.direccion(e.lado) * dano * 0.12;
      g.position.y = e.estatua.vida <= 0 ? -3 : 0;
    }

    this.flechas.inicio();
    this.orbes.inicio();
    for (const p of b.proyectiles) {
      if (p.magia) {
        this.orbes.tomar().position.set(p.x, p.y, p.z);
        continue;
      }
      const f = this.flechas.tomar();
      f.position.set(p.x, p.y, p.z);
      const sube = Math.cos(Math.min(1, p.t) * Math.PI);
      f.rotation.set(0, Math.sign(p.objetivo.x - p.desdeX) > 0 ? 0 : Math.PI, sube * 0.6);
    }
    this.flechas.fin();
    this.orbes.fin();

    this.renderer.render(this.escena, this.camara);
  }

  proyectar(x: number, y: number, z: number, ancho: number, alto: number) {
    this.vector.set(x, y * 1.25, z).project(this.camara);
    return { x: ((this.vector.x + 1) / 2) * ancho, y: ((1 - this.vector.y) / 2) * alto, visible: this.vector.z < 1 };
  }
}

export type { Estatua };

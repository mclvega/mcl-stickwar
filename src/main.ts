import './styles.css';

import { app } from './app';
import { audio } from './audio';
import { MODOS } from './core/difficulty';
import { iniciarBucle } from './core/loop';
import { ORDEN_UNIDADES, POBLACION_MAX, UNIDADES, type TipoUnidad } from './core/unidades';
import { iniciarPantallaCompleta } from './fullscreen';
import { Batalla, type Orden } from './game/batalla';
import type { Escena3D } from './game/escena3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { agregarRecord, limpiarNombre } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
let escena: Escena3D | null = null;
/** El motor 3D (three.js) se descarga aparte: el menú aparece sin esperarlo. */
let modulo3d: Promise<typeof import('./game/escena3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/escena3d'));
/** Calidad automática, límite de FPS y monitor `?perf`. */
const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());

let batalla: Batalla | null = null;
let camX = 20;

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta);
app.aplicarConfig();

let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  escena?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

/* ---------- Barra de mando (unidades y órdenes) ---------- */

const barra = h('div', { class: 'barra-mando' });
document.body.append(barra, h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));
const botonesUnidad = new Map<TipoUnidad, HTMLButtonElement>();
const botonesOrden = new Map<Orden, HTMLButtonElement>();

function montarBarra() {
  const unidades = h('div', { class: 'fila-unidades' });
  for (const t of ORDEN_UNIDADES) {
    const d = UNIDADES[t];
    const b = h('button', { type: 'button', class: 'boton-unidad', title: `${d.nombre} (${d.tecla})`, onclick: () => entrenar(t) },
      h('span', { class: 'icono', text: d.icono }), h('span', { class: 'coste', text: `${d.coste}` }), h('span', { class: 'cola' }));
    botonesUnidad.set(t, b);
    unidades.append(b);
  }
  const ordenes = h('div', { class: 'fila-ordenes' });
  for (const [o, texto] of [['guarnicion', '🏰 Refugio'], ['defender', '🛡️ Defender'], ['atacar', '⚔️ Atacar']] as Array<[Orden, string]>) {
    const b = h('button', { type: 'button', class: 'boton-orden', text: texto, onclick: () => ordenar(o) });
    botonesOrden.set(o, b);
    ordenes.append(b);
  }
  barra.replaceChildren(unidades, ordenes);
}
montarBarra();

function entrenar(t: TipoUnidad) {
  if (!batalla) return;
  if (batalla.entrenar(t)) audio.efecto('recoger');
  else audio.efecto('dano');
}

function ordenar(o: Orden) {
  if (!batalla) return;
  batalla.ordenar(o);
  audio.efecto('boton');
}

function refrescarBarra() {
  if (!batalla) return;
  for (const [t, b] of botonesUnidad) {
    const d = UNIDADES[t];
    const bloqueada = !batalla.disponible(t);
    b.disabled = bloqueada || batalla.jugador.oro < d.coste || batalla.poblacion('jugador') + d.poblacion > POBLACION_MAX;
    b.classList.toggle('bloqueada', bloqueada);
    (b.querySelector('.coste') as HTMLElement).textContent = bloqueada ? `Nv ${d.desde}` : `${d.coste}`;
    const enCola = batalla.jugador.cola.filter((c) => c.tipo === t).length;
    (b.querySelector('.cola') as HTMLElement).textContent = enCola ? `${enCola}` : '';
  }
  for (const [o, b] of botonesOrden) b.setAttribute('aria-pressed', String(batalla.jugador.orden === o));
}

/* ---------- Cámara: arrastrar, teclas, rueda o tocar el minimapa ---------- */

const teclas = new Set<string>();
addEventListener('keydown', (e) => {
  teclas.add(e.code);
  if (!batalla || batalla.pausada) return;
  const t = ORDEN_UNIDADES.find((u) => UNIDADES[u].tecla === e.key);
  if (t) entrenar(t);
  if (e.code === 'KeyQ') ordenar('guarnicion');
  if (e.code === 'KeyW') ordenar('defender');
  if (e.code === 'KeyE') ordenar('atacar');
  if (e.code === 'Escape' || e.code === 'KeyP') pausar();
});
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());

let arrastre: { id: number; x: number; cam: number } | null = null;
lienzo3d.addEventListener('pointerdown', (e) => {
  if (!batalla) return;
  // Toque en el minimapa: salta a ese punto.
  if (e.clientY > minimapa().y - 6 && e.clientY < minimapa().y + minimapa().h + 6) {
    const m = minimapa();
    camX = ((e.clientX - m.x) / m.w) * batalla.largo;
  }
  lienzo3d.setPointerCapture(e.pointerId);
  arrastre = { id: e.pointerId, x: e.clientX, cam: camX };
});
lienzo3d.addEventListener('pointermove', (e) => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  camX = arrastre.cam - ((e.clientX - arrastre.x) / ancho) * 34;
});
const soltar = () => (arrastre = null);
lienzo3d.addEventListener('pointerup', soltar);
lienzo3d.addEventListener('pointercancel', soltar);
lienzo3d.addEventListener('wheel', (e) => {
  camX += (e.deltaX || e.deltaY) * 0.04;
  e.preventDefault();
}, { passive: false });

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
}

const AYUDA = 'Los mineros traen oro. Entrena soldados (teclas 1 a 6) y da órdenes: Refugio (Q), Defender (W) o Atacar (E). Mueve la vista arrastrando, con A/D o con la rueda. Derriba la estatua enemiga para pasar de nivel.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '⚔️ McL Stick War' }),
      h('p', { class: 'texto-suave', text: 'Mina oro, entrena tu ejército y derriba la estatua enemiga. Cada nivel el enemigo es más fuerte y los niveles no se acaban.' }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  batalla = null;
  const max = app.g.nivelMax;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '⚔️ McL Stick War' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · Nivel más alto: ${max}` }),
      boton(max > 1 ? `Continuar en el nivel ${max}` : 'Jugar', () => jugar(max), { variante: 'primario', icono: '▶' }),
      max > 1 ? boton('Empezar desde el nivel 1', () => jugar(1), { icono: '⏮' }) : null,
      boton(`Dificultad: ${MODOS[app.g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Personaje', () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(menu)), { icono: '👕' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: AYUDA }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

function records() {
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `Nivel ${r.nivel}` })))
    : [h('p', { class: 'texto-suave', text: 'Aún no hay récords. ¡Juega una partida!' })];
  mostrarPanel(h('div', { class: 'tarjeta' }, h('h2', { text: '🏆 Récords' }), ...filas, boton('Volver', menu, { icono: '←' })));
}

async function jugar(nivel: number) {
  audio.iniciar();
  if (!escena) {
    const { Escena3D } = await cargar3d();
    escena = new Escena3D(lienzo3d);
    ajustar();
  }
  batalla = new Batalla(nivel, () => MODOS[app.g.config.dificultad], {
    golpe: () => undefined,
    muerte: (u) => u.lado === 'enemigo' && audio.efecto('golpe'),
    entrenada: (u) => u.lado === 'jugador' && audio.efecto('recoger'),
    victoria,
    derrota,
  });
  camX = 17;
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  if (!batalla || batalla.terminada || batalla.pausada) return;
  batalla.pausada = true;
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `Nivel ${batalla.nivel}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Configuración', () => configuracion(volverAPausa, true), { icono: '⚙️' }),
      boton('Salir al menú', menu, { icono: '🚪' }),
    ),
  );
}

function volverAPausa() {
  if (!batalla) return menu();
  batalla.pausada = false;
  pausar();
}

function continuar() {
  if (!batalla) return;
  batalla.pausada = false;
  mostrarPanel(null);
  jugando(true);
}

function victoria(nivel: number) {
  jugando(false);
  audio.efecto('nivel');
  app.g.nivelMax = Math.max(app.g.nivelMax, nivel + 1);
  app.guardar();
  setTimeout(() => mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: `🏆 ¡Nivel ${nivel} superado!` }),
      h('p', { class: 'texto-suave', text: siguientePista(nivel + 1) }),
      boton('Siguiente nivel', () => jugar(nivel + 1), { variante: 'primario', icono: '▶' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  ), 1200);
}

function siguientePista(nivel: number) {
  const nueva = ORDEN_UNIDADES.find((t) => UNIDADES[t].desde === nivel);
  return nueva ? `Nueva unidad: ${UNIDADES[nueva].icono} ${UNIDADES[nueva].nombre}. El enemigo será más fuerte.` : 'El enemigo será más fuerte.';
}

function derrota(nivel: number) {
  jugando(false);
  audio.efecto('muerte');
  const entra = agregarRecord(app.g, { nombre: app.nombre(), nivel, fecha: new Date().toISOString().slice(0, 10) });
  app.guardar();
  setTimeout(() => mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: 'Tu estatua ha caído' }),
      h('p', { class: 'texto-suave', text: `Llegaste al nivel ${nivel}.${entra ? ' Está en tus récords.' : ''}` }),
      boton('Reintentar el nivel', () => jugar(nivel), { variante: 'primario', icono: '↻' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  ), 1200);
}

document.addEventListener('visibilitychange', () => document.hidden && pausar());
addEventListener('pointerdown', () => audio.iniciar());

/* ---------- HUD ---------- */

const minimapa = () => {
  const w = Math.min(520, ancho - 40);
  return { x: (ancho - w) / 2, y: 58, w, h: 12 };
};

function dibujarHud(b: Batalla) {
  ctx.clearRect(0, 0, ancho, alto);
  ctx.textBaseline = 'middle';
  const sombra = (texto: string, x: number, y: number, color = '#fff') => {
    ctx.fillStyle = '#000b';
    ctx.fillText(texto, x + 1.5, y + 1.5);
    ctx.fillStyle = color;
    ctx.fillText(texto, x, y);
  };

  // Barras de vida de las estatuas, oro y población.
  const barraVida = (x: number, y: number, w: number, valor: number, color: string) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, 10);
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, valor), 8);
  };
  const w = Math.min(220, ancho * 0.3);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  sombra('🏛️ Tu estatua', 16, 16);
  barraVida(16, 28, w, b.jugador.estatua.vida / b.jugador.estatua.vidaMax, '#4ab0ff');
  ctx.textAlign = 'right';
  sombra(`Estatua enemiga · Nivel ${b.nivel}`, ancho - 70, 16);
  barraVida(ancho - 70 - w, 28, w, b.enemigo.estatua.vida / b.enemigo.estatua.vidaMax, '#ff5a5a');
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, sans-serif';
  sombra(`🪙 ${Math.floor(b.jugador.oro)}   👥 ${b.poblacion('jugador')}/${POBLACION_MAX}`, ancho / 2, 24, '#ffd27a');

  // Minimapa con la ventana de la cámara.
  const m = minimapa();
  ctx.fillStyle = '#000c';
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeStyle = '#444';
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  for (const u of b.unidades) {
    if (!u.viva) continue;
    ctx.fillStyle = u.lado === 'jugador' ? '#4ab0ff' : '#ff5a5a';
    ctx.fillRect(m.x + (u.x / b.largo) * m.w - 1, m.y + 3, 2, m.h - 6);
  }
  const visible = 34;
  ctx.strokeStyle = '#ffd27a';
  ctx.strokeRect(m.x + ((camX - visible / 2) / b.largo) * m.w, m.y - 2, (visible / b.largo) * m.w, m.h + 4);

  // Vida de las unidades heridas.
  for (const u of b.unidades) {
    if (!u.viva || u.vida >= u.vidaMax) continue;
    const p = escena!.proyectar(u.x, u.tipo === 'gigante' ? 4.4 : 2.1, u.z, ancho, alto);
    if (!p.visible || p.x < -20 || p.x > ancho + 20) continue;
    ctx.fillStyle = '#000';
    ctx.fillRect(p.x - 13, p.y - 1, 26, 5);
    ctx.fillStyle = u.lado === 'jugador' ? '#58e07a' : '#ff5a5a';
    ctx.fillRect(p.x - 12, p.y, 24 * (u.vida / u.vidaMax), 3);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ---------- Bucle ---------- */

let fps = 60;
let ultimo = performance.now();
let refresco = 0;
iniciarBucle(
  (dt) =>
    rend.medir('logica', () => {
      if (!batalla || batalla.pausada) return;
      const v = (teclas.has('KeyA') || teclas.has('ArrowLeft') ? -1 : 0) + (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0);
      camX += v * 28 * dt;
      camX = Math.max(12, Math.min(batalla.largo - 12, camX));
      batalla.actualizar(dt);
    }),
  () => {
    const ahora = performance.now();
    if (!rend.debeDibujar(ahora, !batalla || batalla.pausada)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (batalla && escena) {
      const e = escena;
      const b = batalla;
      e.sombras(app.g.config.animacionesReducidas ? 0 : tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => e.dibujar(b, app.g.look, camX, app.g.config.tema === 'oscuro'));
      dibujarHud(batalla);
      refresco -= dt;
      if (refresco <= 0) {
        refresco = 0.15;
        refrescarBarra();
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(escena?.renderer ?? null);
  },
);

if (import.meta.env.DEV && location.search.includes('demo')) void jugar(Number(new URLSearchParams(location.search).get('nivel')) || 4);
else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

// Con el menú ya visible, se descarga el motor 3D en segundo plano para que «Jugar» sea instantáneo.
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));

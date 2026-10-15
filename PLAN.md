# Plan: McL Stick War

## Referencia

Stick War (Max Games): dos estatuas, una en cada extremo de un campo lateral. Los mineros extraen oro y con él se entrenan unidades: Swordwrath, Archidon, Spearton, Magikill y Giant. Se dan órdenes globales de refugio, defensa y ataque. Gana quien derriba la estatua rival.

## Qué hacemos

- Simulación en 1D (eje x del campo, más profundidad visual) separada del render 3D (`src/game/batalla.ts`).
- 6 unidades con coste, población, vida, daño, alcance, armadura y daño en área. Las unidades a distancia lanzan proyectiles en arco.
- Las estatuas se defienden disparando flechas. Con la orden de refugio, las tropas se curan detrás de su estatua.
- IA enemiga: mantiene sus mineros, entrena según el nivel y ataca cuando su fuerza supera a la tuya.
- Niveles infinitos: más oro y más vida para el enemigo, una estatua más resistente, un campo más largo y unidades que se desbloquean por nivel.
- Reglas comunes de netlify/CLAUDE.md.

## Ideas siguientes

- Controlar una unidad a mano (como en el original).
- Mejoras de investigación (armaduras, flechas de fuego).
- Hechizos del mago (congelar, explosión en cadena).

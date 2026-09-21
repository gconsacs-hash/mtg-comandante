# MTG Comandante

PWA (app web instalable en el celular) para:

- **Ver tu colección** de Magic exportada desde ManaBox, con **nombre, tipo y texto en español** (texto impreso oficial, vía Scryfall) o en inglés, con un botón ES/EN.
- **Armar mazos Commander** eligiendo un comandante de tu colección: la app filtra las cartas que encajan en su identidad de color, marca sinergias (tribu y temas del comandante), roles (rampa, robo, remoción…) y puede **sugerir un mazo completo de 100 cartas** solo con lo que tienes.
- Validar el mazo (100 cartas, singleton, identidad de color, legalidad, copias disponibles, cartas compartidas con otros mazos) y **exportar** la lista a ManaBox / Moxfield / Archidekt.

Funciona sin conexión una vez abierta (las imágenes se guardan a medida que se ven). No depende de ningún servicio externo salvo Scryfall para imágenes y para importar una colección nueva.

## Usar

### En el celular (recomendado: GitHub Pages)

1. Sube la carpeta a un repositorio y activa GitHub Pages (igual que las otras apps).
2. Abre la URL en el celular → menú del navegador → **Agregar a pantalla de inicio**.

### En el PC

Cualquier servidor estático sirve, por ejemplo:

```
cd mtg-comandante
npx serve .
```

y abre `http://localhost:3000`. (Abrir `index.html` directo con doble clic también funciona, pero sin modo sin conexión.)

## Actualizar la colección

**Opción A — desde la app (celular o PC):** Ajustes → *Importar CSV de ManaBox* → elige el archivo exportado por ManaBox (Colección → ⋯ → Exportar → CSV). La app descarga los datos de Scryfall (unos minutos) y guarda la colección en el propio navegador.

**Opción B — regenerar los datos incluidos (PC):**

```
node scripts/enriquecer.js "C:\Users\gcont\Downloads\ManaBox_Collection.csv"
```

Esto reescribe `data/coleccion.js`, que es la colección que viene "de fábrica" en la app. Vuelve a subirla a GitHub Pages después.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `app.js` | La app (UI, filtros, constructor, sugerencias, análisis) |
| `scryfall.js` | Lectura del CSV de ManaBox y descarga de datos de Scryfall (lo usan la app y el script) |
| `scripts/enriquecer.js` | Genera `data/coleccion.js` desde el CSV |
| `data/coleccion.js` | Colección enriquecida incluida en la app |
| `data/mazos-iniciales.js` | Los 6 mazos armados anteriormente, cargables desde Ajustes |
| `data/basicas.js`, `scripts/basicas.js` | Tierras básicas (EN/ES) y el script que las descarga |
| `sw.js`, `manifest.json`, `icon*` | PWA (sin conexión, instalable) |

## Armado automático

Al crear un mazo, el selector de comandante tiene dos fuentes: **Mi colección** (tus legendarias) y **Todo Magic (Scryfall)** (cualquier comandante legal, por popularidad, con búsqueda por nombre/tipo/texto). Un comandante que no tienes se guarda como «extra» y entra en la lista de compras.

Al elegir un comandante (o desde el menú ⋯ del mazo) la app pregunta cómo armarlo:

- **Solo con las cartas que ya tengo** — algoritmo local descrito abajo.
- **Con todas las cartas que existen** — consulta Scryfall por popularidad en Commander (EDHREC) para la identidad del comandante: ~30 de sinergia (tribu/temas), 10 rampa, 10 robo, 8 remoción, 3 barridas, contrahechizos si hay azul, 3 de protección, el resto las más populares, ~8-18 tierras no básicas y básicas repartidas por símbolos. Opción de **precio máximo por carta** (usa el precio USD de Scryfall). Las cartas que no tienes quedan marcadas y en la Lista de compras.
- **Lo armo yo a mano.**

## Cómo sugiere un mazo (solo colección)

1. Detecta la **tribu** (subtipos del comandante, p. ej. *Elf*, *Vampire*) y los **temas** de su texto (landfall, fichas, contadores, sacrificio, hechizos, cementerio, etc.).
2. Puntúa cada carta de la colección que cabe en la identidad de color: rareza, coste, rol (rampa, robo, remoción, barrida, contrahechizo, tutor) y sinergia con la tribu/temas.
3. Llena cuotas mínimas (≈9 rampa, 9 robo, 9 remoción), luego el resto por puntaje cuidando que haya criaturas, y por último ~37 tierras: no básicas útiles primero y básicas repartidas según los símbolos de maná del mazo.

**Tierras básicas:** ManaBox no suele registrarlas, así que la app asume que tienes básicas ilimitadas (se puede desactivar en Ajustes). `data/basicas.js` trae las 6 básicas en inglés y español.

**Más cartas que las de tu colección:** en el constructor, pestaña *Disponibles* → «Todas las cartas (Scryfall)» busca entre todas las cartas legales para la identidad del comandante, ordenadas por popularidad en Commander (EDHREC), con filtros por tipo, rol (`otag:` de Scryfall) y sinergia con la tribu. Las que no tienes se agregan al mazo marcadas «No la tienes» y aparecen en la **Lista de compras** (menú ⋯). Necesita internet.

**Cartas que no tienes:** si un mazo importado incluye una carta fuera de la colección (p. ej. un comandante por comprar), la app la busca en Scryfall al abrir el mazo y la muestra marcada en rojo con «No la tienes».

Los mazos se guardan en el navegador (`localStorage`); en Ajustes puedes exportarlos/importarlos como JSON.

Datos e imágenes: [Scryfall](https://scryfall.com). Magic: The Gathering es marca de Wizards of the Coast. Uso personal, sin fines comerciales.

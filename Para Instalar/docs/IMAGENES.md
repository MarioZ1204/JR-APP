# Imágenes y fuentes

## Dónde está cada cosa

| Carpeta | Qué contiene | ¿Se edita a mano? |
|---|---|---|
| `assets-src/` | Los **originales** en PNG, JPEG y TTF | Sí, aquí se agregan imágenes nuevas |
| `public/` | Las versiones optimizadas que sirve la app | No, se generan con los scripts |

La regla es simple: **nunca se edita nada dentro de `public/icons/` ni de
`public/fonts/`**. Esos archivos se regeneran. Si se sobrescriben a mano, el
siguiente `python scripts/optimizar-assets.py` los reemplaza.

## Agregar un ingrediente nuevo

1. Consiga la imagen cuadrada del ingrediente, mínimo 160×160 px (mejor 400×400
   o más, el script la reduce).
2. Guárdela en `assets-src/icons/ings/` con el **nombre de la variedad** que usa
   el sistema, en minúsculas y sin acentos. Por ejemplo `queso-azul.png`.
   El nombre es el que devuelve `layerKind()` en `public/js/burger-pick.js`.
3. Ejecute:

   ```bat
   python scripts\optimizar-assets.py
   ```

4. Suba el número de versión (`?v=`) en `public/js/burger-pick.js` y en
   `public/sw.js`, para que los celulares que ya tienen la app abierta bajen la
   imagen nueva en vez de usar la vieja de su caché.

Si un ingrediente no tiene imagen propia, el sistema muestra `extra.webp`
automáticamente; no queda un hueco en blanco.

## Categorías

Igual que los ingredientes, pero en `assets-src/icons/cats/`. Los nombres válidos
son los de `SHAPE_PHOTO` en `public/js/burger-pick.js`. Las categorías sí están
en la lista de precarga del service worker, así que al agregar una hay que
añadirla también a `SHELL` en `public/sw.js`.

## Por qué WebP

Los iconos venían en PNG de 192 y 256 px pesando entre 70 y 170 KB cada uno,
para dibujarse en cuadros de 40 y 64 px en pantalla. Los 68 iconos sumaban
6,3 MB, que cada celular del salón bajaba por WiFi.

En WebP con calidad 95 y al tamaño correcto pesan entre 5 y 25 KB, sin
diferencia visible a la vista. El recorrido completo (entrar, vender, armar una
hamburguesa) pasó de **7,5 MB a 1,2 MB**.

Las fuentes pasaron de TTF a WOFF2: de 277 KB a 103 KB, con el mismo dibujo de
letra.

## Logo de la impresora térmica

`server/escpos-logo.js` trae su propio decodificador de PNG y **no entiende
WebP**. Por eso el script genera además `public/logo-print.png` a 384 px, que es
el ancho de raster de un ticket de 80 mm. Si ese archivo desaparece, el ticket
sale sin logo (no falla el cobro, pero se pierde la marca).

## Iconos de la app instalada

El manifest declaraba `logo.png` como si midiera 192×192 cuando en realidad era
859×860, y no había ningún icono `maskable`. Ahora el script genera:

- `icon-192.png` y `icon-512.png` — icono normal
- `icon-maskable-512.png` — con margen de seguridad, para que Android lo recorte
  a círculo o cuadro redondeado sin comerse el logo
- `apple-touch-icon.png` — 180×180 para iPhone y iPad

## Fuentes

```bat
python scripts\optimizar-fuentes.py
```

Lee los TTF de `assets-src/fonts/` y escribe los WOFF2 en `public/fonts/`.

## Contraste de colores

```bat
python scripts\revisar-contraste.py
```

Mide los colores de texto contra sus fondos según WCAG. Conviene correrlo si se
cambia algún color en `:root` dentro de `public/css/app.css`. El mínimo para
texto normal es 4,5:1.

## Requisitos de los scripts

```bat
python -m pip install pillow fonttools brotli
```

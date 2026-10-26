# WINRATE

PWA instalable para llevar el control de inversiones de **Coins**: calculadora por *bullets*, registro WIN/LOSE, límite diario de 2 pérdidas (el día de juego va de 06:00 a 05:59:59) y estadísticas. Es HTML, CSS y JS puro, sin build, y funciona 100 % offline.

```
index.html  styles.css  app.js  manifest.webmanifest  sw.js
js/        logic.js (lógica pura) · storage.js · audio.js · icons.js · fx.js · charts.js
vendor/    chart.umd.4.4.1.min.js · fonts/ (Press Start 2P, VT323 — OFL)
icons/     192, 512, maskable, apple-touch-icon
tests/     logic.test.mjs · e2e.cjs · pwa-offline.cjs · screenshots.cjs
tools/     make_icons.py (regenera los iconos)
```

## Probar en local

```bash
python3 -m http.server 8765        # luego abre http://localhost:8765
TZ=America/Mexico_City node tests/logic.test.mjs
node tests/e2e.cjs && node tests/pwa-offline.cjs && node tests/screenshots.cjs
```

## Publicar gratis en GitHub Pages

1. Entra a <https://github.com/new>. Nombre del repo: `winrate`, visibilidad **Public** (Pages gratis requiere repo público). Clic en **Create repository**.
2. Sube los archivos:
   - **Desde el navegador:** en el repo vacío, clic en **uploading an existing file**. Arrastra **todo el contenido** de la carpeta `winrate/` (no la carpeta en sí; `index.html` tiene que quedar en la raíz) y clic en **Commit changes**.
   - **Con git:**
     ```bash
     cd winrate
     git init && git add . && git commit -m "WinRate v1.0.0"
     git branch -M main
     git remote add origin https://github.com/<TU_USUARIO>/winrate.git
     git push -u origin main
     ```
3. En el repo ve a **Settings → Pages**. En *Build and deployment* elige **Source: Deploy from a branch**, **Branch: `main`** y carpeta **`/ (root)`**, y clic en **Save**.
4. Espera de 1 a 2 minutos. La URL será `https://<TU_USUARIO>.github.io/winrate/`. Pages sirve por HTTPS, que es obligatorio para el service worker.
5. **Para publicar cambios después:** sube los archivos nuevos y **cambia `CACHE_VERSION` en `sw.js`** (por ejemplo `winrate-v1.0.1`). Al abrir la app aparecerá *NUEVA VERSION DISPONIBLE → ACTUALIZAR*.

> Todas las rutas son relativas, así que funciona en la subcarpeta `/winrate/` sin tocar nada.

## Instalar en iPhone (Safari)

1. Abre la URL en **Safari**. En iOS, solo Safari puede instalar PWAs.
2. Toca **Compartir** (el cuadro con la flecha hacia arriba).
3. Desliza y toca **Agregar a pantalla de inicio**, luego **Agregar**.
4. Abre WinRate desde el icono: se ve a pantalla completa, sin barra de Safari, y funciona sin conexión.

## Instalar en Android (Brave)

1. Abre la URL en **Brave** y espera a que cargue por completo.
2. Toca el menú **⋮** (abajo a la derecha o arriba, según tu versión).
3. Toca **Instalar app**. Si no aparece, usa **Agregar a pantalla principal → Instalar**.
4. Confirma con **Instalar**. El icono aparece en el cajón de apps.

## Abonos y retiros

En **Calculator**, debajo del capital, hay dos botones:
- **+ ABONAR**: Coins que compraste y agregas a tu capital.
- **- RETIRAR**: Coins que sacas para comprar en la tienda. No puedes retirar más de tu capital.

Los movimientos cambian el capital, pero **no cuentan para el win rate, las rachas ni las vidas del día** (se pueden hacer incluso con el sistema bloqueado). Aparecen en el historial de **Win-Rate** (filtros TODO / RONDAS / ABON/RET), se deshacen con UNDO si son lo más reciente, y en **Stats → BANCO** hay métricas: total retirado y abonado, lo del mes, balance del banco, ganancia de juego, mayor retiro y una gráfica mensual. El drawdown ignora los retiros.

## Datos

- Todo se guarda **solo en el celular** (`localStorage`, clave `winrate.v1`, `schemaVersion: 2`; los datos de la v1 se migran solos). Borrar los datos del navegador o desinstalar la app los elimina.
- Haz respaldos con **⚙ → EXPORTAR .JSON** (`winrate-<jugador>-<YYYY-MM-DD>.json`) y restáuralos con **IMPORTAR .JSON**.
- En iPhone, la app instalada y Safari tienen almacenamientos **separados**: registra siempre desde la app instalada.

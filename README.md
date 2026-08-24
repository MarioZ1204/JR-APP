# JR Burger — sistema local de gestión

Sistema web para un **solo local**: mesas, comandas, cocina en tiempo real, facturación, inventario con recetas, caja y reportes. Corre en un PC del restaurante y se usa desde el navegador de PCs, tablets y celulares conectados al mismo WiFi. **No requiere hosting ni servidor en internet.**

## Stack elegido (y por qué)

| Capa | Tecnología | Motivo |
|------|------------|--------|
| Backend | **Node.js 22+ y Express** | Un solo proceso, fácil de arrancar en Windows. Usa el SQLite integrado de Node (sin instalar MySQL). |
| Tiempo real | **Socket.IO (WebSockets)** | Cocina ve la comanda en cuanto el mesero la envía, sin recargar. |
| Base de datos | **SQLite** (archivo `data/restaurante.db`) | Cero instalación de MySQL/PostgreSQL, un archivo para copiar y respaldar. Estable para un local con varios dispositivos en LAN. |
| Frontend | HTML/CSS/JS (SPA, sin build) | No hay paso de compilar. Se sirve desde el mismo Node. Responsivo para móvil. |
| Impresión | Ticket HTML (58 mm y 80 mm) + ESC/POS USB opcional | Si la impresora USB falla, el cobro **no se bloquea**: se imprime desde el navegador. |

No se usó XAMPP/PHP para el sistema en sí: WebSockets y un arranque con un `.bat` son más simples en Node. XAMPP puede seguir instalado; este proyecto no lo necesita.

## Arranque en Windows (un clic)

1. Instale [Node.js LTS](https://nodejs.org) **versión 22 o superior** (en este equipo se probó con Node 24).
2. Doble clic en **`iniciar.bat`**.
3. La primera vez instala dependencias y abre `http://localhost:3000`.
4. Deje esa ventana abierta durante el servicio.

En la consola verá la IP de la red local, por ejemplo `http://192.168.1.20:3000`. Esa URL es la que abren tablets y celulares en el WiFi del restaurante.

Inicio manual:

```bat
npm install
npm start
```

## Usuarios iniciales (cámbielos)

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin` | `admin123` | Administrador |
| `mesero` | `mesero123` | Mesas y comandas |
| `cocina` | `cocina123` | Pantalla de cocina |
| `cajero` | `cajero123` | Facturación y caja |

## Qué incluye

- **Mesas:** 2 por defecto; el admin puede añadir o quitar. Estados: libre, ocupada, por cobrar, reservada. Unir, separar y transferir comandas.
- **Comandas:** productos, cantidades, notas (ej. sin cebolla), envío a cocina, anulación con registro de quién lo hizo.
- **Cocina:** actualización en vivo (pendiente → preparación → listo → entregado).
- **Facturación:** ticket 58 mm u 80 mm (configurable). Pagos en **efectivo, Nequi y Daviplata**, también combinados.
- **Inventario:** insumos + receta por producto. Al facturar se descuenta el consumo. Alerta o bloqueo si no hay stock.
- **Caja:** apertura/cierre de turno, egresos menores, historial y descuadre.
- **Roles fijos** (no se inventan roles nuevos; sí se crean usuarios): Administrador, Mesero, Cocina, Cajero. El admin tiene todos los permisos.
- **Reportes:** ventas, productos más vendidos, consumo de insumos, rendimiento por mesero.
- **Respaldo:** automático al iniciar (uno por día) y botón manual. Archivos en `backups/`.

## Documentación

- [Instalación en Windows](docs/INSTALACION.md)
- [Uso por rol](docs/USO.md)
- [Impresora térmica USB](docs/IMPRESORA.md)
- [Base de datos](docs/BASE_DE_DATOS.md)

## Firewall

Si un celular no abre el sistema, en Windows permita Node.js en redes privadas o abra el puerto **3000** TCP en el firewall.

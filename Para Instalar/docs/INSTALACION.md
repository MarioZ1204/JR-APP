# Instalación y ejecución (Windows)

El sistema corre 100% en el PC del restaurante. No hay que contratar hosting.

## Requisitos

- Windows 10/11
- [Node.js **22 o superior**](https://nodejs.org) (LTS). Compruebe con `node -v` en una terminal.
- Red WiFi o LAN del local. Los celulares deben usar ese WiFi, no datos móviles.

No se necesita XAMPP, MySQL ni Apache para esta aplicación.

## Primer arranque

1. Copie la carpeta `JR-APP` al PC que hará de servidor (puede quedar en `C:\xampp\htdocs\JR-APP` o en el escritorio).
2. Doble clic en **`iniciar.bat`**.
3. La primera vez ejecuta `npm install` (unos minutos) y abre el navegador en `http://localhost:3000`.
4. Entre con `admin` / `admin123` y cambie las claves en **Usuarios**.
5. En **Ajustes**, ponga el nombre del negocio, NIT y datos del ticket. Añada mesas si necesita más de 2.

Deje la ventana negra de `iniciar.bat` abierta todo el servicio. Si la cierra, el sistema deja de responder en los demás dispositivos.

## Tablets y celulares

En la ventana de inicio aparece una línea del estilo:

```
En la red:    http://192.168.0.102:3000
```

Abra esa URL en Chrome o Edge de cada dispositivo. Si no carga:

- Confirme que están en el mismo WiFi.
- En Windows, permita Node.js en el firewall de redes privadas (puerto TCP 3000).
- No use `localhost` en el celular: eso apunta al teléfono, no al PC.

## Arranque manual (opcional)

```bat
cd C:\xampp\htdocs\JR-APP
npm install
npm start
```

## Apagado

Cierre la ventana de `iniciar.bat` o pulse Ctrl+C. Antes de apagar el PC, cierre caja si hay un turno abierto.

## Respaldos

Quedan en la carpeta `backups`. Copie esa carpeta a un USB de vez en cuando. Detalle en [BASE_DE_DATOS.md](BASE_DE_DATOS.md).

## Impresora USB

Vea [IMPRESORA.md](IMPRESORA.md).

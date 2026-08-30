# Impresora térmica POS (USB)

El sistema imprime **tickets de 58 mm y 80 mm**. El ancho se elige en **Ajustes**. Por defecto: **80 mm** (más habitual en restaurantes). El contenido del ticket incluye: datos del negocio, detalle, subtotal, IVA si aplica, total, forma de pago y fecha/hora.

Hay dos modos. El cobro **nunca se cancela** si falla la impresora.

## Modo recomendado: imprimir desde el navegador (USB)

Sirve con cualquier impresora térmica USB que Windows ya reconozca (Epson, Star, Xprinter, Rongta, etc.).

1. Conecte la impresora por USB al **mismo PC que corre `iniciar.bat`** (o a un equipo de caja que vaya a pulsar “imprimir”).
2. Windows → Configuración → Impresoras: instale el driver de la marca o el genérico “Generic / Text Only”.
3. En la impresora: **Establecer como predeterminada** si este PC solo imprime tickets.
4. En JR Burger → Ajustes:
   - Ancho 80 o 58 mm según el papel.
   - Impresión USB directa: **No**.
5. Al cobrar se abre una ventana. En el diálogo de impresión:
   - Elija la térmica.
   - Márgenes mínimos.
   - Desactive “Encabezados y pies” del navegador.
   - Escala 100%.
6. En Chrome puede marcar “Guardar como predeterminada”.

Prueba: Ajustes → **Probar ticket**.

Si la ventana no aparece, permita ventanas emergentes para `http://localhost:3000` (o la IP del local).

## Modo opcional: ESC/POS directo (impresora compartida)

Útil si quiere saltarse el diálogo del navegador. La impresora debe estar **compartida en Windows**.

1. Panel de control → Dispositivos e impresoras → clic derecho en la térmica → Propiedades de impresora → Compartir.
2. Active “Compartir esta impresora” y anote el **nombre para compartir** (ej. `POS-80`).
3. En JR → Ajustes:
   - Impresión USB directa: **Sí**.
   - Nombre de impresora: el nombre de recurso compartido (`POS-80`).
4. El sistema envía bytes ESC/POS con `copy /b` a `\\localhost\POS-80`.
5. Si falla (impresora apagada, nombre mal escrito), verá un aviso y se abrirá igual el ticket en el navegador.

No hace falta Bluetooth ni red de la impresora: el alcance de este proyecto es **USB**.

## Si no imprime

| Síntoma | Qué hacer |
|---------|-----------|
| No sale papel | Impresora encendida, papel bien puesto, USB en el PC servidor. |
| Sale en blanco o símbolos | Use el modo navegador, o driver “Generic / Text Only”. |
| Cortado a la mitad | Cambie 58/80 mm al ancho real del rollo. |
| Error USB directo | Compruebe el nombre de recurso compartido. El cobro ya está guardado: reimprima. |
| Reimprimir | Ajustes → Probar ticket usa la última factura. |

Marcas USB habituales (Epson TM-T20, Xprinter XP-58/80, etc.) funcionan con el modo navegador una vez instaladas en Windows.

# Impresora térmica POS (USB)

El sistema imprime **tickets de 58 mm y 80 mm**. El ancho se elige en **Ajustes**. Por defecto: **80 mm** (más habitual en restaurantes). El contenido del ticket incluye: datos del negocio, detalle, subtotal, IVA si aplica, total, forma de pago y fecha/hora.

Hay dos modos. El cobro **nunca se cancela** si falla la impresora.

## Modo recomendado: imprimir desde el navegador (USB)

Sirve con cualquier impresora térmica USB que Windows ya reconozca (Epson, Star, Xprinter, Rongta, etc.).

1. Conecte la impresora por USB al **mismo PC que corre `iniciar.bat`** (o a un equipo de caja que vaya a pulsar "imprimir").
2. Windows → Configuración → Impresoras: instale el driver de la marca o el genérico "Generic / Text Only".
3. En la impresora: **Establecer como predeterminada** si este PC solo imprime tickets.
4. En JR Burger → Ajustes:
   - Ancho 80 o 58 mm según el papel.
   - Impresión: **Desde el computador (elige la impresora)**.
5. Al cobrar se abre una ventana. En el diálogo de impresión:
   - Elija la térmica.
   - Márgenes mínimos.
   - Desactive "Encabezados y pies" del navegador.
   - Escala 100%.
6. En Chrome puede marcar "Guardar como predeterminada".

Prueba: Ajustes → **Probar recibo**.

Si la ventana no aparece, permita ventanas emergentes para `http://localhost:3000` (o la IP del local).

## Modo opcional: ESC/POS directo (sin diálogo del navegador)

Útil si quiere que el ticket salga solo al cobrar, sin ventana de impresión.

1. Conecte la térmica por USB al **mismo PC que corre `iniciar.bat`**.
2. Windows → Configuración → Impresoras: instale el driver (Epson, Xprinter, SAT, etc.).
3. Anote el **nombre exacto** de la impresora en Windows (ej. `SAT38TUSE`).
4. En JR → Ajustes:
   - Impresión: **Directo a la impresora del restaurante**.
   - Nombre de impresora: el nombre de Windows (no hace falta compartirla).
5. Prueba: Ajustes → **Probar recibo**.

El sistema envía bytes ESC/POS al spooler de Windows en modo RAW. Si falla (nombre mal escrito, impresora apagada), verá un aviso y se abrirá igual el ticket en el navegador. **El cobro no se cancela.**

No hace falta Bluetooth ni red de la impresora: el alcance de este proyecto es **USB**.

## Si no imprime

| Síntoma | Qué hacer |
|---------|-----------|
| No sale papel | Impresora encendida, papel bien puesto, USB en el PC servidor. |
| Sale en blanco o símbolos | Use el modo navegador, o driver "Generic / Text Only". |
| Cortado a la mitad | Cambie 58/80 mm al ancho real del rollo. |
| Error impresión directa | Compruebe el nombre exacto en Windows (ej. SAT38TUSE). El cobro ya está guardado: reimprima. |
| Reimprimir | Ajustes → Probar recibo usa la última factura. |

Marcas USB habituales (Epson TM-T20, Xprinter XP-58/80, SAT38TUSE, etc.) funcionan con el modo navegador una vez instaladas en Windows.

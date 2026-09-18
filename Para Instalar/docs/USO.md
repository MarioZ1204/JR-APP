# Uso por rol

Interfaz pensada para servicio: botones grandes, poco texto. El menú inferior (en PC, a la izquierda) solo muestra lo que su rol puede hacer.

## Administrador (`admin`)

Acceso total. Además de lo de mesero/cajero/cocina:

1. **Ajustes:** nombre del negocio, NIT, dirección, teléfono, IVA, pie de ticket, ancho 58/80 mm, impresora, si se bloquea la venta sin stock.
2. **Mesas:** añadir, editar o quitar (no se puede quitar una mesa ocupada o unida). Empieza con Mesa 1 y Mesa 2.
3. **Menú:** categorías, productos, precio y **receta** (insumos y cantidad exacta).
4. **Insumos:** stock, mínimo de alerta, entradas por compra, ajustes y merma. Historial de movimientos.
5. **Usuarios:** crear meseros, cocina, cajeros u otros admin. Desactivar cuentas. Cambiar claves.
6. **Reportes:** ventas por periodo, productos más vendidos, consumo de insumos, ventas por mesero.
7. **Respaldos:** botón “Crear respaldo ahora”. También se crea uno automático al abrir el sistema (máximo uno por día).

Cambie las contraseñas iniciales el primer día.

## Mesero (`mesero`)

1. En **Mesas**, toque una mesa libre → Tomar comanda (o Reservar).
2. Toque productos para agregarlos. Use ✎ para notas (“sin cebolla”) y +/− para cantidades.
3. **Enviar a cocina** cuando el pedido deba prepararse. Lo nuevo se marca como enviado; puede añadir más ítems después y volver a enviar.
4. Cocina actualiza el estado; el ticket lo refleja.
5. **Pedir cuenta** pone la mesa en “Por cobrar” para el cajero.
6. **Unir mesa:** elija unir y toque la otra mesa. La comanda queda en la primera.
7. **Transferir:** elija transferir y toque una mesa libre.
8. Anular un ítem pide motivo y queda registrado quién lo hizo.

Si un insumo está bajo, verá un aviso en el salón. En Ajustes el admin puede **bloquear** la venta cuando no alcanza la receta.

## Cocina / Barra (`cocina`)

1. Abra **Cocina** en una tablet o monitor cerca de la plancha.
2. Al enviar el mesero, la comanda aparece sola (WebSocket).
3. Por ítem: Preparar → Listo → Entregado. O **Todo listo** para la mesa.
4. Las notas especiales se leen debajo del producto.

## Cajero (`cajero`)

1. **Caja:** abra turno con el efectivo inicial. Sin caja abierta no se factura.
2. **Cobrar:** mesas con cuenta. Las que pidieron cuenta se ven en dorado.
3. Revise el detalle, reparta el total en efectivo / Nequi / Daviplata (puede combinar; la suma debe cubrir el total).
4. **Cobrar e imprimir:** registra la venta, libera la mesa, descuenta inventario e intenta imprimir. Si la impresora está desconectada, el cobro **sí queda**; imprima luego desde el diálogo del navegador o reimprimiendo el último ticket.
5. Egresos menores (pan, gas, etc.) en Caja.
6. Al cerrar, cuente el efectivo. El sistema compara con lo esperado (base + ventas en efectivo − egresos) y guarda la diferencia.

## Consejos de servicio

- El PC “servidor” no debe apagarse ni suspenderse durante el turno.
- Tablets y celulares deben estar en el **mismo WiFi** (no datos móviles).
- Use Chrome o Edge. Permita ventanas emergentes para el ticket.

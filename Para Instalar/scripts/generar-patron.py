"""Genera public/patron.webp: una textura de fondo repetible a partir del banner.

El archivo BCKGROUND.jpeg es un banner publicitario: tiene el nombre del negocio
en letras enormes encima de un patron de garabatos de comida. Al usarlo como
fondo de pagina, esas letras se colaban detras de las tarjetas y parecian una
marca de agua puesta por error.

Este script recorta solo la franja de garabatos (sin el texto grande y sin el
logo de la esquina), la aclara para que sea una textura discreta y le cose los
bordes para que se pueda repetir sin costuras visibles.

    python scripts/generar-patron.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets-src" / "BCKGROUND.jpeg"
SALIDA = RAIZ / "public" / "patron.webp"

# Ventana cuadrada dentro de la franja superior del banner, en la unica zona sin
# texto: la palabra "MENU" del patron esta en y 246-266 y el nombre en letras
# grandes arranca en y 275. Cualquier letra que entre aqui saldria invertida al
# espejar el mosaico. Se toma a escala natural para no deformar los dibujos.
RECORTE = (250, 14, 250 + 220, 14 + 220)   # izquierda, arriba, derecha, abajo

ANCHO_BASE = 300    # lado de la base antes de espejarla (el mosaico sale al doble)
ACLARADO = 0.40     # cuanto se conserva del trazo original (0 = invisible)


def hacer_repetible(cuarto):
    """Arma un mosaico espejado, que empalma sin costura por construccion.

    La franja recibida se refleja a derecha y abajo, asi que cada borde del
    resultado es identico al borde opuesto y el patron se puede repetir
    infinitamente. El precio es una simetria que, a lo tenue que queda este
    trazo, no se distingue.
    """
    ancho, alto = cuarto.size
    mosaico = Image.new("RGB", (ancho * 2, alto * 2))
    mosaico.paste(cuarto, (0, 0))
    mosaico.paste(cuarto.transpose(Image.FLIP_LEFT_RIGHT), (ancho, 0))
    mitad = mosaico.crop((0, 0, ancho * 2, alto))
    mosaico.paste(mitad.transpose(Image.FLIP_TOP_BOTTOM), (0, alto))
    return mosaico


base = Image.open(ORIGEN).convert("RGB").crop(RECORTE)

# Se conserva la proporcion de la franja para no deformar los dibujos.
escala = ANCHO_BASE / base.width
base = base.resize((ANCHO_BASE, round(base.height * escala)), Image.LANCZOS)

gris = base.convert("L")

# El banner viene con un degradado de iluminacion (oscuro arriba y abajo, claro
# en el centro). Sin quitarlo, al repetir el mosaico aparecen franjas: el borde
# oscuro de una copia choca con el borde claro de la siguiente. Dividir por una
# version muy desenfocada de si misma deja la iluminacion plana y solo el trazo.
fondo = gris.filter(ImageFilter.GaussianBlur(radius=base.height / 3))
plano = ImageChops.invert(
    ImageChops.subtract(ImageChops.invert(gris), ImageChops.invert(fondo))
)

# El trazo debe insinuarse, no competir con el contenido: se baja el contraste y
# se mezcla con blanco hasta dejarlo casi imperceptible.
suave = ImageEnhance.Contrast(plano.convert("RGB")).enhance(0.85)
tenue = Image.blend(Image.new("RGB", suave.size, (255, 255, 255)), suave, ACLARADO)

patron = hacer_repetible(tenue)
patron.save(SALIDA, "WEBP", quality=88, method=6)

print(f"{SALIDA.name}: {patron.width}x{patron.height}, {SALIDA.stat().st_size / 1024:.1f} KB")
print("Se repite sin costuras; el texto del banner queda fuera del recorte.")

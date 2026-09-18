"""Regenera los assets de public/ a partir de los originales de assets-src/.

Los originales nunca se tocan: son la fuente de verdad. Este script produce las
versiones WebP que sirve la aplicacion. Se puede volver a correr siempre que se
agreguen iconos nuevos a assets-src/.

    python scripts/optimizar-assets.py
"""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets-src"
DESTINO = RAIZ / "public"

CALIDAD = 95

# Los iconos se exportan a ~4x el tamano en que se ven en pantalla, para que se
# vean nitidos en pantallas de alta densidad sin cargar peso de sobra.
#   ings: se ven a 40 px (chip) y 28 px (lista)
#   cats: se ven a 64 px (grupo) y 84 px (encabezado del plato)
CARPETAS_ICONOS = {
    "icons/ings": 160,
    "icons/cats": 256,
}

# Imagenes suetas: (ruta en assets-src, ruta de salida, lado maximo o None)
#
# El fondo no esta aqui: BCKGROUND.jpeg es un banner con el nombre del negocio en
# letras enormes y no sirve como textura de pagina. La textura se saca de el con
# scripts/generar-patron.py, que recorta solo los garabatos.
SUELTAS = [
    ("logo.png", "logo.webp", 512),
]

# Iconos PNG que la PWA necesita en formato PNG (Android no acepta WebP en todos
# los lanzadores), regenerados al tamano correcto que declara el manifest.
#
# logo-print.png es aparte: server/escpos-logo.js trae su propio decodificador de
# PNG para la impresora termica y no entiende WebP, asi que ese archivo debe
# seguir existiendo en PNG. 384 px es el ancho de raster de un ticket de 80 mm.
ICONOS_PWA = [
    ("logo.png", "icon-192.png", 192),
    ("logo.png", "icon-512.png", 512),
    ("logo.png", "apple-touch-icon.png", 180),
    ("logo.png", "logo-print.png", 384),
]

MARGEN_MASKABLE = 0.72  # el logo ocupa 72% del lienzo, el resto es zona segura
FONDO_MASKABLE = (30, 25, 22)


def kb(ruta):
    return ruta.stat().st_size / 1024


def abrir(rel):
    return Image.open(ORIGEN / rel).convert("RGBA")


def encajar(img, lado):
    """Redimensiona manteniendo proporcion para que el lado mayor sea `lado`."""
    if max(img.size) <= lado:
        return img
    escala = lado / max(img.size)
    return img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)


def guardar_webp(img, salida):
    salida.parent.mkdir(parents=True, exist_ok=True)
    opciones = {"quality": CALIDAD, "method": 6}
    if img.mode == "RGBA" and img.getchannel("A").getextrema()[0] == 255:
        # Sin pixeles translucidos: descartar el canal alfa ahorra peso.
        img = img.convert("RGB")
    img.save(salida, "WEBP", **opciones)


def convertir_iconos():
    antes = despues = 0
    for carpeta, lado in CARPETAS_ICONOS.items():
        archivos = sorted((ORIGEN / carpeta).glob("*.png"))
        for origen in archivos:
            salida = DESTINO / carpeta / (origen.stem + ".webp")
            img = abrir(origen.relative_to(ORIGEN))
            guardar_webp(encajar(img, lado), salida)
            antes += kb(origen)
            despues += kb(salida)
        print(f"  {carpeta}: {len(archivos)} iconos a {lado}px")
    return antes, despues


def convertir_sueltas():
    antes = despues = 0
    for rel, destino_rel, lado in SUELTAS:
        img = abrir(rel)
        salida = DESTINO / destino_rel
        guardar_webp(encajar(img, lado) if lado else img, salida)
        antes += kb(ORIGEN / rel)
        despues += kb(salida)
        print(f"  {rel} -> {destino_rel} ({kb(salida):.0f} KB)")
    return antes, despues


def generar_iconos_pwa():
    for rel, destino_rel, lado in ICONOS_PWA:
        img = encajar(abrir(rel), lado)
        lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
        lienzo.paste(img, ((lado - img.width) // 2, (lado - img.height) // 2), img)
        salida = DESTINO / destino_rel
        lienzo.save(salida, "PNG", optimize=True)
        print(f"  {destino_rel}: {lado}x{lado} ({kb(salida):.0f} KB)")

    # Version maskable: el sistema operativo recorta los bordes, asi que el logo
    # va reducido y centrado sobre fondo solido.
    lado = 512
    interior = round(lado * MARGEN_MASKABLE)
    logo = encajar(abrir("logo.png"), interior)
    lienzo = Image.new("RGBA", (lado, lado), FONDO_MASKABLE + (255,))
    lienzo.paste(logo, ((lado - logo.width) // 2, (lado - logo.height) // 2), logo)
    salida = DESTINO / "icon-maskable-512.png"
    lienzo.save(salida, "PNG", optimize=True)
    print(f"  icon-maskable-512.png: {lado}x{lado} ({kb(salida):.0f} KB)")


print("Iconos:")
a1, d1 = convertir_iconos()
print("\nImagenes sueltas:")
a2, d2 = convertir_sueltas()
print("\nIconos de la PWA:")
generar_iconos_pwa()

antes, despues = a1 + a2, d1 + d2
print(f"\nTotal convertido: {antes / 1024:.2f} MB -> {despues / 1024:.2f} MB "
      f"(-{100 - despues / antes * 100:.1f}%)")

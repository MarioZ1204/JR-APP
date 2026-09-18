"""Comprime las fuentes TTF de assets-src/ a WOFF2 en public/fonts/.

WOFF2 es el formato que entienden todos los navegadores actuales y pesa alrededor
de un 60% menos que el TTF equivalente, sin cambiar el dibujo de las letras.

    python scripts/optimizar-fuentes.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets-src" / "fonts"
DESTINO = RAIZ / "public" / "fonts"

DESTINO.mkdir(parents=True, exist_ok=True)
antes = despues = 0

for ttf in sorted(ORIGEN.glob("*.ttf")):
    salida = DESTINO / (ttf.stem + ".woff2")
    fuente = TTFont(ttf)
    fuente.flavor = "woff2"
    fuente.save(salida)
    fuente.close()

    antes += ttf.stat().st_size
    despues += salida.stat().st_size
    print(f"  {ttf.name}: {ttf.stat().st_size / 1024:.0f} KB -> "
          f"{salida.name} {salida.stat().st_size / 1024:.0f} KB")

print(f"\nTotal: {antes / 1024:.0f} KB -> {despues / 1024:.0f} KB "
      f"(-{100 - despues / antes * 100:.1f}%)")

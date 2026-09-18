"""Mide el contraste de los colores de texto del sistema contra sus fondos.

WCAG AA pide 4.5:1 para texto normal y 3:1 para texto grande (>=18.66px en negrita
o >=24px). Uso: python scripts/revisar-contraste.py
"""


def canal(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminancia(hexa):
    h = hexa.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def contraste(a, b):
    la, lb = luminancia(a), luminancia(b)
    claro, oscuro = max(la, lb), min(la, lb)
    return (claro + 0.05) / (oscuro + 0.05)


FONDOS = {"crema": "#f6f0e6", "tarjeta": "#fffcf8", "blanco": "#ffffff"}
TEXTOS = {
    "--ink":   "#1a1512",
    "--muted": "#6b6358",
    "--faint": "#8f8578",
    "--brick": "#c0392b",
    "--ok":    "#1a7a4a",
    "--wait":  "#b86e0f",
    "--hold":  "#2a6482",
}

print(f"{'color':10} " + " ".join(f"{n:>10}" for n in FONDOS))
for nombre, valor in TEXTOS.items():
    fila = f"{nombre:10} "
    for fondo in FONDOS.values():
        r = contraste(valor, fondo)
        marca = "OK " if r >= 4.5 else ("gr " if r >= 3 else "BAJO")
        fila += f" {r:5.2f} {marca:<4}"
    print(fila)

print("\nOK = cumple AA para texto normal | gr = solo texto grande | BAJO = no cumple")

# Busca el tono mas claro que si cumple AA para los que fallan.
print("\nAlternativas que cumplen 4.5:1 sobre tarjeta (#fffcf8):")
for nombre, valor in TEXTOS.items():
    if contraste(valor, "#fffcf8") >= 4.5:
        continue
    h = valor.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    factor = 1.0
    while factor > 0:
        cand = "#%02x%02x%02x" % (round(r * factor), round(g * factor), round(b * factor))
        if contraste(cand, "#fffcf8") >= 4.5:
            print(f"  {nombre}: {valor} -> {cand}  ({contraste(cand, '#fffcf8'):.2f}:1)")
            break
        factor -= 0.01

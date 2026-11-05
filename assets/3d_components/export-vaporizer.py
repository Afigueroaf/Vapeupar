"""Exporta el vaporizador de `vape.blend` al GLB que consume la portada.

    blender -b assets/3d_components/vape.blend ^
            --python assets/3d_components/export-vaporizer.py ^
            -- frontend/public/models/vaporizer.glb

Vuelve a ejecutarlo cada vez que cambie el .blend. El resultado es
determinista, así que el GLB se puede regenerar y comparar sin sorpresas.

QUÉ SE DEJA FUERA Y POR QUÉ
---------------------------
La escena del .blend es un montaje de render, no un asset de web:

- `STUDIO` recoge el fondo y los pedestales. `Cube.001` mide 35 unidades
  frente a las 4,5 del dispositivo: si se colara, el componente normalizaría
  la escena a ese tamaño y el vape quedaría reducido a un punto.
- Hay **dos copias** del dispositivo. La segunda está desplazada en Y; la
  portada enseña una.
- Lo oculto en el render son cortadores booleanos y mallas base previas a los
  modificadores. Exportarlos metería geometría fantasma dentro del objeto.

NO se descarta la geometría que queda dentro de la caja envolvente de otra.
Se probó y fue un error: el panel frontal (`base.001`) y el depósito (`7agar`,
`flavor`) caben dentro del chasis pero se ven por la ventana del cuerpo, y sin
ellos quedaba un marco hueco con la boquilla flotando.

Los modificadores se aplican al exportar: los booleanos, los nodos de
geometría y el subsurf son los que definen la forma final.

Materiales y texturas no viajan. El componente solo muestrea la superficie, de
modo que incluirlos multiplicaría el peso sin cambiar un píxel.
"""

import sys

import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1:][0]
scene = bpy.context.scene

#: Fondo, planos de luz y pedestales del montaje de render.
STUDIO = {"Cube.001", "Plane", "Plane.001", "Plane.002", "Cube.003", "Cube.004"}

#: La segunda copia del dispositivo vive por encima de esta Y.
SECOND_COPY_Y = 2.0


def world_center_y(obj):
    """Centro en Y de la caja envolvente del objeto, en espacio de mundo."""
    low = high = None
    for corner in obj.bound_box:
        y = (obj.matrix_world @ Vector(corner)).y
        low = y if low is None else min(low, y)
        high = y if high is None else max(high, y)
    return (low + high) / 2


for obj in list(scene.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)  # cámaras y luces
        continue
    if obj.name in STUDIO or obj.hide_render or not obj.visible_get():
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if world_center_y(obj) > SECOND_COPY_Y:
        bpy.data.objects.remove(obj, do_unlink=True)

kept = [o for o in scene.objects if o.type == "MESH"]
if not kept:
    raise SystemExit("No quedó ninguna malla: revisa los filtros de este script")

print("EXPORTANDO:", len(kept), sorted(o.name for o in kept))

for obj in kept:
    obj.select_set(True)
bpy.context.view_layer.objects.active = kept[0]

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="NONE",
    export_image_format="NONE",
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
    export_attributes=False,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_yup=True,
)

print("GLB ESCRITO:", out)

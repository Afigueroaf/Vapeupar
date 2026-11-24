"""Exporta el vaporizador de `Vape_2.fbx` al GLB que consume la portada.

    blender -b --python assets/3d_components/export-vape2.py ^
            -- assets/3d_components/Vape_2.fbx frontend/public/models/vaporizer.glb

Sustituye a `export-vaporizer.py` (que exportaba `vape.blend`) como fuente del
modelo de la nube de puntos del hero.

QUÉ HACE Y POR QUÉ
------------------
- El FBX viene de 3ds Max con ~928.000 triángulos (una sola pieza, `Plane016`,
  tiene 470.000). Es un modelo de render: en la web solo se muestrea su
  superficie, y el README de `public/models` pide menos de 2 MB porque el
  muestreo recorre todos los triángulos en el hilo principal. Se reduce con
  `Decimate` (colapso) a unos `BUDGET` triángulos EN TOTAL, repartidos en
  proporción a lo que pesa cada pieza, pero sin bajar ninguna de `FLOOR`: las
  piezas pequeñas (botón, ranuras) se quedan casi enteras y son las grandes,
  que tienen detalle de sobra para una nube de puntos, las que ceden.
- Los `Line*` son splines de Max que llegan como vacíos: no tienen superficie.
- Las texturas no tienen ruta dentro del FBX (Blender avisa al importar) y no
  hacen falta: se exporta solo geometría y normales, como el script anterior.
"""

import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
source, out = args[0], args[1]

#: Triángulos totales del GLB. ~50k dejan el archivo por debajo de 2 MB.
BUDGET = 50_000
#: Ninguna pieza baja de aquí (o de lo que ya tenga, si tiene menos).
FLOOR = 600

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=source)
scene = bpy.context.scene

for obj in list(scene.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("El FBX no trae ninguna malla")


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


counts = {o.name: triangles(o) for o in meshes}
fixed = {n: t for n, t in counts.items() if t <= FLOOR}
flexible = {n: t for n, t in counts.items() if t > FLOOR}

# Reparto: lo que sobra del presupuesto tras las piezas pequeñas se divide en
# proporción. Si alguna grande quedara por debajo del suelo, se fija en el
# suelo y se vuelve a repartir.
targets = dict(fixed)
while flexible:
    remaining = BUDGET - sum(targets.values())
    ratio = remaining / sum(flexible.values())
    low = {n: t for n, t in flexible.items() if t * ratio < FLOOR}
    if not low:
        targets.update({n: t * ratio for n, t in flexible.items()})
        break
    for n in low:
        targets[n] = FLOOR
        del flexible[n]

for obj in meshes:
    ratio = min(1.0, targets[obj.name] / counts[obj.name])
    if ratio < 1.0:
        mod = obj.modifiers.new("decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
    obj.select_set(True)

bpy.context.view_layer.objects.active = meshes[0]

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

dg = bpy.context.evaluated_depsgraph_get()
final = 0
for obj in meshes:
    mesh = obj.evaluated_get(dg).to_mesh()
    mesh.calc_loop_triangles()
    final += len(mesh.loop_triangles)
    obj.evaluated_get(dg).to_mesh_clear()

print("GLB ESCRITO:", out, "mallas:", len(meshes), "triángulos:", final)

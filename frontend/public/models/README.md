# Modelos 3D

`vaporizer.glb` es el modelo que dibuja la nube de puntos del hero
(`src/components/vaporizer-point-cloud.tsx`, ruta pública `/models/vaporizer.glb`).

**No se edita a mano.** La fuente es `assets/3d_components/Vape_2.fbx` y el GLB
se genera desde ahí:

```bash
blender -b --python assets/3d_components/export-vape2.py \
        -- assets/3d_components/Vape_2.fbx frontend/public/models/vaporizer.glb
```

En Windows, `blender` suele estar en
`C:\Program Files\Blender Foundation\Blender <versión>\blender.exe`.

El FBX es un modelo de render de ~928.000 triángulos. El script descarta los
splines (llegan como vacíos), reduce las mallas con `Decimate` a ~50.000
triángulos en total —sin bajar ninguna pieza de 600, para no perder botón y
ranuras— y exporta solo geometría, sin materiales ni texturas. Sus motivos
están comentados ahí.

Estado actual: 13 mallas, 50.000 triángulos, 937 KB.

Hasta noviembre de 2026 la fuente era `assets/3d_components/vape.blend`, con
`export-vaporizer.py` (12 mallas, 4.900 triángulos, 185 KB).

## Si cambia el modelo

Vuelve a ejecutar el comando y revisa el hero. Si la nube sale demasiado
ruidosa en los bordes o la carga se nota lenta en móvil, baja `BUDGET` en el
script; si se pierde detalle, súbelo sin pasar de los 2 MB.

## Sustituir por otro modelo

El componente no depende de este archivo en concreto:

```tsx
<VaporizerPointCloud modelPath="/models/otro-modelo.glb" />
<VaporizerPointCloud modelPath={null} />  // fuerza la silueta provisional
```

Requisitos de cualquier GLB que se ponga aquí:

- Formato `.glb` (binario) o `.gltf`. Sin compresión Draco ni meshopt: el
  cargador va sin decodificadores externos para no añadir peso a la portada.
- Da igual la escala, la orientación y la jerarquía: el componente funde todos
  los meshes, centra el resultado y lo normaliza conservando proporciones.
- Solo se usa la geometría. Materiales y texturas se descartan al cargar, así
  que un GLB sin texturas pesa menos y se ve exactamente igual.
- Presupuesto recomendado: por debajo de 2 MB. El muestreo recorre todos los
  triángulos una vez en el hilo principal.

Si el archivo no existe, el componente dibuja una silueta provisional generada
por código en vez de dejar el hueco vacío.

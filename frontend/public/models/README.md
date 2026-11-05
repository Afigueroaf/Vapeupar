# Modelos 3D

`vaporizer.glb` es el modelo que dibuja la nube de puntos del hero
(`src/components/vaporizer-point-cloud.tsx`, ruta pública `/models/vaporizer.glb`).

**No se edita a mano.** La fuente es `assets/3d_components/vape.blend` y el GLB
se genera desde ahí:

```bash
blender -b assets/3d_components/vape.blend \
        --python assets/3d_components/export-vaporizer.py \
        -- frontend/public/models/vaporizer.glb
```

En Windows, `blender` suele estar en
`C:\Program Files\Blender Foundation\Blender <versión>\blender.exe`.

El script descarta el plató de render, la segunda copia del dispositivo que hay
en la escena y todo lo oculto en el render; aplica los modificadores y exporta
solo geometría, sin materiales ni texturas. Sus motivos están comentados ahí.

Estado actual: 12 mallas, 4.900 triángulos, 185 KB.

## Si cambia el .blend

Vuelve a ejecutar el comando y revisa el hero. Si el resultado sale hueco o con
piezas flotando, lo más probable es que los nombres de `STUDIO` en el script ya
no coincidan con los objetos del archivo.

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

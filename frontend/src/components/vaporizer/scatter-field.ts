import * as THREE from "three";

/**
 * Estado de dispersión, uno por punto, simulado en la GPU.
 *
 * POR QUÉ EXISTE ESTO. La primera versión medía la influencia del cursor
 * contra una estela de posiciones recientes. Funcionaba mientras el cursor
 * tocaba poca superficie, pero la estela tiene un número fijo de huellas: al
 * desarmar medio modelo había que reciclar huellas que todavía mantenían
 * puntos fuera de su sitio, y esas zonas volvían **de golpe** en lugar de
 * relajarse. El problema no era la velocidad de retorno sino dónde vivía la
 * memoria: en el recorrido del cursor y no en el punto.
 *
 * Aquí la memoria es del punto. Una textura guarda, por partícula, cuánto
 * está suelta (0 en su sitio, 1 a pleno alcance). Cada fotograma:
 *
 *     nuevo = max(anterior * decaimiento, influencia del cursor ahora)
 *
 * El `max` hace que tocar un punto lo suelte de inmediato y que volver a
 * tocarlo lo mantenga fuera; el decaimiento lo devuelve solo, a su ritmo, sin
 * importar cuántos puntos haya sueltos a la vez ni por dónde ande el cursor.
 * No hay nada que reciclar, así que no hay tirones.
 *
 * El coste es un dibujo extra por fotograma sobre una textura diminuta —256×256
 * para 55.000 puntos—, frente a recorrer esos 55.000 puntos en JavaScript.
 */

const simulationVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const simulationFragment = /* glsl */ `
  uniform sampler2D uRest;
  uniform sampler2D uState;
  uniform mat4 uModel;
  uniform vec2 uCursor;
  uniform float uRadius;
  uniform float uDecay;
  uniform float uRise;
  uniform float uActive;

  varying vec2 vUv;

  void main() {
    // La influencia se mide en el plano perpendicular a la cámara, igual que
    // antes: el radio es el que el visitante ve dibujado alrededor del cursor,
    // no uno que gire con el modelo. De ahí que haga falta la matriz del
    // objeto aquí dentro.
    vec3 rest = texture2D(uRest, vUv).xyz;
    vec2 world = (uModel * vec4(rest, 1.0)).xy;

    float hit = smoothstep(uRadius, 0.0, distance(world, uCursor)) * uActive;
    float previous = texture2D(uState, vUv).r;

    // Salir tiene un tope de velocidad. Sin él, un puntero que aparece ya
    // sobre el modelo —o un gesto brusco— arranca un trozo entero en un solo
    // fotograma, y eso se lee como un parpadeo en vez de como algo que se
    // desarma. Volver, en cambio, es puro decaimiento.
    float rising = min(hit, previous + uRise);

    gl_FragColor = vec4(max(previous * uDecay, rising), 0.0, 0.0, 1.0);
  }
`;

export interface ScatterStep {
  /** Matriz de mundo del grupo que contiene los puntos. */
  model: THREE.Matrix4;
  /** Cursor en el plano del objeto. */
  cursor: THREE.Vector2;
  /** Radio de acción, en unidades de mundo. */
  radius: number;
  /** Factor de olvido de este fotograma: `exp(-delta * velocidad)`. */
  decay: number;
  /** Cuánto puede soltarse un punto en este fotograma, de 0 a 1. */
  rise: number;
  /** `false` cuando el puntero no está sobre el contenedor. */
  active: boolean;
}

export class ScatterField {
  /** Coordenada de cada punto dentro de la textura, como atributo `aState`. */
  readonly uv: Float32Array;

  private readonly rest: THREE.DataTexture;
  private readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly material: THREE.ShaderMaterial;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly quad: THREE.Mesh;
  private current = 0;
  private cleared = false;

  constructor(positions: Float32Array, count: number) {
    const size = Math.max(2, Math.ceil(Math.sqrt(count)));

    // Las posiciones en reposo viajan en una textura para que el paso de
    // simulación —que es un fragment shader y no ve los atributos de la nube—
    // pueda situar cada punto en el mundo.
    const rest = new Float32Array(size * size * 4);
    const uv = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      rest[i * 4] = positions[i * 3];
      rest[i * 4 + 1] = positions[i * 3 + 1];
      rest[i * 4 + 2] = positions[i * 3 + 2];
      rest[i * 4 + 3] = 1;

      // Centro del texel: muestrear el borde mezclaría dos partículas.
      uv[i * 2] = ((i % size) + 0.5) / size;
      uv[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }

    this.uv = uv;
    this.rest = new THREE.DataTexture(rest, size, size, THREE.RGBAFormat, THREE.FloatType);
    this.rest.needsUpdate = true;

    // Media precisión: el estado es un número entre 0 y 1, no hace falta más, y
    // dibujar sobre media precisión está disponible donde la completa a veces
    // no lo está.
    const options = {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    };

    this.targets = [
      new THREE.WebGLRenderTarget(size, size, options),
      new THREE.WebGLRenderTarget(size, size, options),
    ];

    this.material = new THREE.ShaderMaterial({
      vertexShader: simulationVertex,
      fragmentShader: simulationFragment,
      uniforms: {
        uRest: { value: this.rest },
        uState: { value: null },
        uModel: { value: new THREE.Matrix4() },
        uCursor: { value: new THREE.Vector2(1e6, 1e6) },
        uRadius: { value: 1 },
        uDecay: { value: 0 },
        uRise: { value: 1 },
        uActive: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();
  }

  /** Textura con el estado vigente. Cambia en cada paso, por el intercambio. */
  get texture(): THREE.Texture {
    return this.targets[this.current].texture;
  }

  update(renderer: THREE.WebGLRenderer, step: ScatterStep): void {
    const previousTarget = renderer.getRenderTarget();

    // El contenido inicial de un destino de render no está definido: sin este
    // borrado la nube podría arrancar con medio modelo disperso.
    if (!this.cleared) {
      const color = new THREE.Color();
      renderer.getClearColor(color);
      const alpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      for (const target of this.targets) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      }
      renderer.setClearColor(color, alpha);
      this.cleared = true;
    }

    const read = this.targets[this.current];
    const write = this.targets[1 - this.current];

    const uniforms = this.material.uniforms;
    uniforms.uState.value = read.texture;
    uniforms.uModel.value.copy(step.model);
    uniforms.uCursor.value.copy(step.cursor);
    uniforms.uRadius.value = step.radius;
    uniforms.uDecay.value = step.decay;
    uniforms.uRise.value = step.rise;
    uniforms.uActive.value = step.active ? 1 : 0;

    renderer.setRenderTarget(write);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousTarget);

    this.current = 1 - this.current;
  }

  dispose(): void {
    this.rest.dispose();
    for (const target of this.targets) target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

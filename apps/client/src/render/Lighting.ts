import { Container, Mesh, MeshGeometry, RenderTexture, Shader, Sprite, type Renderer } from 'pixi.js';
import { TILE_PX, type LightDef } from '@df/shared';
import { lightTex } from '../engine/assets';
import { DEFAULT_LIGHT_HEIGHT, HEIGHT_SCALE, type ShadowBlob, type ShadowMaps } from './Shadows';

export interface LightInstance { x: number; y: number; def: LightDef; seed?: number }

/** How much of a shadow-casting light its shadows remove (the rest still spills in, softly). */
const SHADOW_STRENGTH = 0.85;
/** Occluders this close to a light (world px) are its own lamp or brazier, which never shade it. */
const SELF_RADIUS = 0.75 * TILE_PX;
/** Actors the shader lifts off the floor (their sprites stand on top of their own shadow). */
const MAX_ACTORS = 16;

/** A growable pool of additive glow sprites inside one container. */
class GlowPool {
  private sprites: Sprite[] = [];
  private used = 0;
  constructor(readonly root: Container) {}

  begin(): void {
    this.used = 0;
  }

  /** Add a glow; intensities above 1 stack extra sprites, widening the bright core. */
  add(x: number, y: number, diameter: number, tint: number, alpha: number): void {
    for (let a = alpha; a > 0.001; a -= 1) {
      let s = this.sprites[this.used];
      if (!s) {
        s = new Sprite(lightTex());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        this.sprites.push(s);
        this.root.addChild(s);
      }
      this.used++;
      s.visible = true;
      s.position.set(x, y);
      s.width = s.height = diameter;
      s.tint = tint;
      s.alpha = Math.min(1, a);
    }
  }

  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
  }
}

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

/**
 * Height-field shadows. For each pixel of the light's square: find the 3D point that is drawn there
 * (surface map: height, and for wall faces the face's real position), then march toward the light
 * through the occluder map. Anything taller than the ray on the way shades the pixel. Floors in
 * shadow stay dark up to a wall, the shadow climbs the wall's face as far as the geometry says, and
 * wall tops and furniture tops only take shadows from things taller than them.
 */
const FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uGlow;
uniform sampler2D uSurface;
uniform sampler2D uOccluders;
uniform vec4 uLight;   // world px x, y; height (tiles); shadow strength
uniform vec4 uColor;   // rgb, intensity
uniform vec4 uQuad;    // world px of the quad's corner; size px; actor count
uniform vec4 uArea;    // world px rectangle the maps cover
uniform vec4 uActors[${MAX_ACTORS}]; // world px x, y, radius px, height (tiles)

const float HS = ${HEIGHT_SCALE.toFixed(1)};

float occluderAt(vec2 w) {
  vec2 uv = (w - uArea.xy) / uArea.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture(uOccluders, uv).r * HS;
}

void main() {
  float a = texture(uGlow, vUV).a * uColor.a;
  if (a < 0.003) { finalColor = vec4(0.0); return; }
  vec2 w = uQuad.xy + vUV * uQuad.z;
  vec2 suv = (w - uArea.xy) / uArea.zw;
  vec4 s = (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) ? vec4(0.0, 0.5, 0.5, 1.0) : texture(uSurface, suv);
  float z = s.r * HS;
  vec2 p = w + (s.gb - 0.5) * 32.0;
  for (int i = 0; i < ${MAX_ACTORS}; i++) {
    if (float(i) >= uQuad.w) break;
    vec4 ac = uActors[i];
    vec2 d = w - ac.xy;
    // An actor's sprite rises about a tile above its feet: those pixels stand on top of it.
    if (abs(d.x) < ac.z && d.y < ac.z && d.y > -${TILE_PX.toFixed(1)}) z = max(z, ac.w);
  }
  vec2 toLight = uLight.xy - p;
  float dist = length(toLight);
  float lit = 1.0;
  if (dist > 1.0) {
    vec2 u = toLight / dist;
    float reach = dist - ${SELF_RADIUS.toFixed(1)};
    float steps = clamp(ceil(reach / 2.0), 0.0, 128.0);
    float stepLen = reach / max(steps, 1.0);
    // Rays from points above the light run level: wall tops are lit like floors, shaded by taller things.
    float climb = max(0.0, uLight.z - z);
    for (int i = 0; i < 128; i++) {
      if (float(i) >= steps) break;
      float t = (float(i) + 0.5) * stepLen;
      float over = occluderAt(p + u * t) - (z + climb * t / dist);
      lit = min(lit, 1.0 - smoothstep(0.02, 0.15, over));
      if (lit <= 0.0) break;
    }
  }
  float v = mix(1.0 - uLight.w, 1.0, lit);
  finalColor = vec4(uColor.rgb * a * v, a * v);
}`;

/** One shadow-casting light: a quad over its reach, running the shadow shader. */
class ShadowLight {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  readonly u: {
    uLight: Float32Array; uColor: Float32Array; uQuad: Float32Array; uArea: Float32Array; uActors: Float32Array;
  };

  constructor(maps: ShadowMaps) {
    this.u = {
      uLight: new Float32Array(4), uColor: new Float32Array(4), uQuad: new Float32Array(4),
      uArea: new Float32Array(4), uActors: new Float32Array(MAX_ACTORS * 4),
    };
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT, name: 'shadow-light' },
      resources: {
        uGlow: lightTex().source,
        uSurface: maps.surface!.source,
        uOccluders: maps.occluders!.source,
        shadow: {
          uLight: { value: this.u.uLight, type: 'vec4<f32>' },
          uColor: { value: this.u.uColor, type: 'vec4<f32>' },
          uQuad: { value: this.u.uQuad, type: 'vec4<f32>' },
          uArea: { value: this.u.uArea, type: 'vec4<f32>' },
          uActors: { value: this.u.uActors, type: 'vec4<f32>', size: MAX_ACTORS },
        },
      },
    });
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.blendMode = 'add';
  }

  /** Point the shader at the current maps (they are recreated when the room size changes). */
  bind(maps: ShadowMaps): void {
    const r = this.mesh.shader!.resources;
    if (r.uSurface !== maps.surface!.source) r.uSurface = maps.surface!.source;
    if (r.uOccluders !== maps.occluders!.source) r.uOccluders = maps.occluders!.source;
    this.u.uArea.set([maps.area.x, maps.area.y, maps.area.w, maps.area.h]);
  }
}

/**
 * Darkness overlay with dynamic radial lights. Lights are drawn additively into a light map
 * cleared to the room's ambient colour; the light map is then multiplied over the world. Lights
 * with `shadows` are drawn by the height-field shadow shader instead of a plain glow.
 */
export class Lighting {
  private rt: RenderTexture;
  private lights = new Container();
  private glows = new GlowPool(this.lights);
  private shadowLights: ShadowLight[] = [];
  readonly overlay: Sprite;
  private time = 0;

  constructor(w: number, h: number) {
    this.rt = RenderTexture.create({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)) });
    this.overlay = new Sprite(this.rt);
    this.overlay.blendMode = 'multiply';
  }

  /** Replace the light map with one of the new size (resizing in place leaves the sprite's bounds stale). */
  resize(w: number, h: number): void {
    const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
    if (width === this.rt.width && height === this.rt.height) return;
    const old = this.rt;
    this.rt = RenderTexture.create({ width, height });
    this.overlay.texture = this.rt;
    old.destroy(true);
  }

  render(
    renderer: Renderer, camX: number, camY: number, scale: number, lights: LightInstance[], ambient: number, dt: number,
    maps?: ShadowMaps, blobs: ShadowBlob[] = [],
  ): void {
    this.time += dt;
    const t = this.time;
    const shadows = !!maps?.surface && lights.some((l) => l.def.shadows);
    if (shadows) maps!.renderOccluders(renderer, blobs);
    const actors = new Float32Array(MAX_ACTORS * 4);
    blobs.slice(0, MAX_ACTORS).forEach((b, i) => actors.set([b.x * TILE_PX, b.y * TILE_PX, b.r * TILE_PX, b.h], i * 4));
    this.glows.begin();
    let n = 0;
    lights.forEach((l, i) => {
      const seed = l.seed ?? i;
      const f = l.def.flicker ?? 0;
      const flick = f ? 1 - f * (0.5 + 0.5 * Math.sin(t * 13 + seed * 7.1) * Math.sin(t * 7.3 + seed)) : 1;
      const d = l.def.radius * TILE_PX * 2 * (0.97 + 0.03 * flick);
      const alpha = (l.def.intensity ?? 1) * flick;
      if (!(l.def.shadows && shadows)) {
        this.glows.add(l.x * TILE_PX - camX, l.y * TILE_PX - camY, d, l.def.color, alpha);
        return;
      }
      const s = (this.shadowLights[n] ??= new ShadowLight(maps!));
      if (!s.mesh.parent) this.lights.addChild(s.mesh);
      n++;
      s.bind(maps!);
      // The flame wanders a little and its height breathes with the flicker, so shadows waver with it.
      const wob = f * 0.06;
      const lx = (l.x + wob * Math.sin(t * 9.7 + seed * 3.1)) * TILE_PX, ly = (l.y + wob * Math.sin(t * 11.3 + seed * 1.7)) * TILE_PX;
      const x0 = l.x * TILE_PX - d / 2, y0 = l.y * TILE_PX - d / 2;
      s.u.uLight.set([lx, ly, (l.def.height ?? DEFAULT_LIGHT_HEIGHT) * (0.94 + 0.06 * flick), SHADOW_STRENGTH]);
      const c = l.def.color;
      s.u.uColor.set([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, alpha]);
      s.u.uQuad.set([x0, y0, d, Math.min(blobs.length, MAX_ACTORS)]);
      s.u.uActors.set(actors);
      s.mesh.visible = true;
      s.mesh.position.set(x0 - camX, y0 - camY);
      s.mesh.scale.set(d);
    });
    for (let i = n; i < this.shadowLights.length; i++) this.shadowLights[i]!.mesh.visible = false;
    this.glows.end();
    renderer.render({ container: this.lights, target: this.rt, clear: true, clearColor: ambient });
    this.overlay.scale.set(scale);
  }
}

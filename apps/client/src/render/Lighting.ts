import { Container, Mesh, MeshGeometry, RenderTexture, Shader, Sprite, type Renderer } from 'pixi.js';
import { TILE_PX, type LightDef } from '@df/shared';
import { GEOMETRY_OFFSET_STEP } from '../engine/assets';
import { ACTOR_HEIGHT, DEFAULT_LIGHT_HEIGHT, HEIGHT_SCALE, MAX_ACTORS, type ShadowBlob, type ShadowMaps } from './Shadows';

/** `self`: the light's own furniture (tiles, as drawn in the occluder map), which never shades it. */
export interface LightInstance { x: number; y: number; def: LightDef; seed?: number; self?: { x: number; y: number; w: number; h: number } }

/** How much of a shadow-casting light its shadows remove (the rest still spills in, softly). */
const SHADOW_STRENGTH = 0.85;
/**
 * What is this close to a light (world px) is its own lamp or brazier: it never shades the light
 * (furniture lights also skip their whole sprite, `self`), and is lit from inside, never facing away.
 */
const SELF_RADIUS = 0.75 * TILE_PX;
/** Texels a shadow ray may cross: enough for the widest light's reach along a diagonal. */
const MAX_STEPS = 320;
/**
 * How far above where it stands a pixel can be drawn (world px): a wall's top, a tall piece's face, an
 * actor's head. A light's quad reaches this much higher than its reach, so those pixels get its light.
 */
const DRAWN_ABOVE = 2 * TILE_PX;
/** How much an actor, an upright card facing the camera, takes light by facing it (1: as much as a wall's face). */
const ACTOR_FACING = 0.5;

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
 * The march toward the light through the occluder map (shadow-casting lights only): anything taller
 * than the ray on the way shades the pixel. Floors in shadow stay dark up to a wall, the shadow climbs
 * the wall's face as far as the geometry says, and wall tops and furniture tops only take shadows from
 * things taller than them.
 */
const MARCH = /* glsl */ `
  if (dist > 1.0) {
    vec2 u = toLight / dist;
    float reach = dist - ${SELF_RADIUS.toFixed(1)};
    // Rays from points above the light run level: wall tops are lit like floors, shaded by taller things.
    float climb = max(0.0, uLight.z - z);
    // Walk the ray through the occluder map one texel at a time (a texel is a world pixel), testing
    // every texel it crosses after the one it starts in: stepping by distance instead skips thin
    // shapes and corners, which shows as holes and ragged edges in shadows. "next" is how far along
    // the ray the next texel boundary is on each axis, "span" how far apart those boundaries are.
    vec2 dir = vec2(u.x < 0.0 ? -1.0 : 1.0, u.y < 0.0 ? -1.0 : 1.0);
    vec2 span = 1.0 / max(abs(u), vec2(0.00001));
    vec2 cell = floor(p);
    vec2 next = (dir * (cell - p) + max(dir, 0.0)) * span;
    // A face isn't shaded by what stands in line with it (the row of texels its foot is in): that is
    // beside it in its own plane, like a dresser's legs either side of the panel between them.
    float inLine = (actor < 0.0 && drop > 0.01) ? cell.y : -1.0e6;
    float lit = 1.0;
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      float t = min(next.x, next.y);
      if (t >= reach) break;
      if (next.x < next.y) { cell.x += dir.x; next.x += span.x; } else { cell.y += dir.y; next.y += span.y; }
      if (cell.y == inLine) continue;
      vec2 o = occluderAt(cell + 0.5);
      float over = (o.y == actor ? 0.0 : o.x) - (z + climb * t / dist);
      lit = min(lit, 1.0 - smoothstep(0.02, 0.15, over));
      if (lit <= 0.0) break;
    }
    a *= mix(${(1 - SHADOW_STRENGTH).toFixed(2)}, 1.0, lit);
  }`;

/**
 * A light, worked out per pixel. For each pixel of the light's quad: find the 3D point that is drawn
 * there (surface map: its height, which way it faces, and where it really stands; actors map: an
 * actor's pixel is that far up its card), and light that point: by how far from the light it stands
 * on the floor plan, by how squarely it faces the light (a front face only takes light from the
 * south), and, for a light with shadows, by whether anything stands in the way (MARCH). So a wall's
 * top is lit where the wall is, a face facing away stays dark, and a head isn't lit as the floor
 * it's drawn over.
 */
const fragment = (shadows: boolean) => /* glsl */ `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uSurface;
${shadows ? 'uniform sampler2D uOccluders;' : ''}
uniform sampler2D uSeen;      // which actor is seen at each pixel (its index in uActors + 1)
uniform vec4 uLight;   // world px x, y; height (tiles); reach (world px)
uniform vec4 uColor;   // rgb, intensity
uniform vec4 uQuad;    // world px of the quad's corner; its size, px
uniform vec4 uArea;    // world px rectangle the maps cover
${shadows ? 'uniform vec4 uSelf;    // world px x0, y0, x1, y1 of the light\'s own furniture, which casts no shadow from it' : ''}
uniform vec2 uActors[${MAX_ACTORS}]; // world px of where each actor stands

const float HS = ${HEIGHT_SCALE.toFixed(1)};

// How bright a light is this far out (a fraction of its reach): a broad, bright core with a long
// tail, so lights carry across a room.
float falloff(float r) {
  if (r < 0.3) return mix(1.0, 0.8, r / 0.3);
  if (r < 0.65) return mix(0.8, 0.35, (r - 0.3) / 0.35);
  return mix(0.35, 0.0, clamp((r - 0.65) / 0.35, 0.0, 1.0));
}
${shadows ? `
// What blocks light at a world position: its height (tiles), and whose pixel it is (an actor's
// index in uActors + 1; anything else is no actor's).
vec2 occluderAt(vec2 w) {
  vec2 uv = (w - uArea.xy) / uArea.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
  if (w.x >= uSelf.x && w.y >= uSelf.y && w.x < uSelf.z && w.y < uSelf.w) return vec2(0.0);
  vec4 o = texture(uOccluders, uv);
  return vec2(o.r * HS, floor(o.g * 255.0 + 0.5));
}` : ''}

void main() {
  vec2 w = uQuad.xy + vUV * uQuad.zw;
  vec2 suv = (w - uArea.xy) / uArea.zw;
  bool inArea = suv.x >= 0.0 && suv.y >= 0.0 && suv.x <= 1.0 && suv.y <= 1.0;
  // Outside the maps is floor: no height, facing up, where it's drawn.
  vec4 s = inArea ? texture(uSurface, suv) : vec4(0.0, 128.0 / 255.0, 128.0 / 255.0, 1.0);
  float z = s.r * HS;
  float facing = (floor(s.g * 255.0 + 0.5) - 128.0) / 127.0;
  float drop = (floor(s.b * 255.0 + 0.5) - 128.0) * ${GEOMETRY_OFFSET_STEP.toFixed(2)};
  // Faces stand half a pixel out from the wall's edge: the stored offset is rounded, and a point that
  // lands inside the wall would be shaded by the wall itself along rays that graze it.
  vec2 p = vec2(w.x, w.y + (drop > 0.01 ? drop + 0.5 : drop));
  // An actor is an upright card standing where the actor does: each pixel of its sprite is that far
  // above the floor there, and is lit as that point is (so a low shadow darkens its legs, not its
  // head), never shaded by its own feet. Actors are drawn on whole art pixels (artPixel), so their
  // sprites in the actors map are exactly the ones on screen, less what stands in front of them.
  float actor = inArea ? floor(texture(uSeen, suv).r * 255.0 + 0.5) : 0.0;
  if (actor >= 1.0 && actor <= ${MAX_ACTORS.toFixed(1)}) {
    vec2 feet = w;
    // (A loop, because this GLSL only indexes arrays by loop counters.)
    for (int i = 0; i < ${MAX_ACTORS}; i++) if (i == int(actor) - 1) feet = uActors[i];
    p = vec2(w.x, feet.y - 0.5);
    z = max(0.0, feet.y - w.y) * ${(ACTOR_HEIGHT / TILE_PX).toFixed(4)};
    facing = ${ACTOR_FACING.toFixed(2)};
  } else {
    actor = -1.0;
  }
  vec2 toLight = uLight.xy - p;
  float dist = length(toLight);
  float a = falloff(dist / uLight.w) * uColor.a;
  // A face (facing south) takes light by how squarely it faces it across the floor: all of it from
  // straight ahead, half from the side, none from behind (half Lambert, so it rounds off softly). The
  // light's own lamp is lit from inside (a bulb behind the front of its shade still lights it), so
  // that only counts from beyond it.
  float squarely = 0.5 + 0.5 * toLight.y / max(dist, 0.001);
  a *= mix(1.0, squarely, facing * smoothstep(${SELF_RADIUS.toFixed(1)}, ${(2 * SELF_RADIUS).toFixed(1)}, dist));
  if (a < 0.003) { finalColor = vec4(0.0); return; }
${shadows ? MARCH : ''}
  finalColor = vec4(uColor.rgb * a, a);
}`;

const QUAD = () => new MeshGeometry({
  positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

/** One light: a quad over its reach, running the light shader (with shadows or without). */
class PointLight {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  readonly u: {
    uLight: Float32Array; uColor: Float32Array; uQuad: Float32Array; uArea: Float32Array; uSelf: Float32Array; uActors: Float32Array;
  };

  constructor(maps: ShadowMaps, readonly shadows: boolean) {
    this.u = {
      uLight: new Float32Array(4), uColor: new Float32Array(4), uQuad: new Float32Array(4),
      uArea: new Float32Array(4), uSelf: new Float32Array(4), uActors: new Float32Array(MAX_ACTORS * 2),
    };
    const uniforms = {
      uLight: { value: this.u.uLight, type: 'vec4<f32>' },
      uColor: { value: this.u.uColor, type: 'vec4<f32>' },
      uQuad: { value: this.u.uQuad, type: 'vec4<f32>' },
      uArea: { value: this.u.uArea, type: 'vec4<f32>' },
      ...(shadows ? { uSelf: { value: this.u.uSelf, type: 'vec4<f32>' } } : {}),
      uActors: { value: this.u.uActors, type: 'vec2<f32>', size: MAX_ACTORS },
    };
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: fragment(shadows), name: shadows ? 'shadow-light' : 'light' },
      resources: {
        uSurface: maps.surface!.source,
        ...(shadows ? { uOccluders: maps.occluders!.source } : {}),
        uSeen: maps.actors!.source,
        light: uniforms,
      },
    });
    this.mesh = new Mesh({ geometry: QUAD(), shader });
    this.mesh.blendMode = 'add';
  }

  /** Point the shader at the current maps (they are recreated when the room size changes). */
  bind(maps: ShadowMaps): void {
    const r = this.mesh.shader!.resources;
    if (r.uSurface !== maps.surface!.source) r.uSurface = maps.surface!.source;
    if (this.shadows && r.uOccluders !== maps.occluders!.source) r.uOccluders = maps.occluders!.source;
    if (r.uSeen !== maps.actors!.source) r.uSeen = maps.actors!.source;
    this.u.uArea.set([maps.area.x, maps.area.y, maps.area.w, maps.area.h]);
  }
}

/** A growable pool of lights of one kind inside one container. */
class LightPool {
  private lights: PointLight[] = [];
  private used = 0;
  constructor(private readonly root: Container, private readonly shadows: boolean) {}

  begin(): void {
    this.used = 0;
  }

  next(maps: ShadowMaps): PointLight {
    let l = this.lights[this.used];
    if (!l) {
      l = new PointLight(maps, this.shadows);
      this.lights.push(l);
      this.root.addChild(l.mesh);
    }
    this.used++;
    l.bind(maps);
    l.mesh.visible = true;
    return l;
  }

  end(): void {
    for (let i = this.used; i < this.lights.length; i++) this.lights[i]!.mesh.visible = false;
  }
}

/**
 * Darkness overlay with dynamic lights, worked out per pixel from the area's geometry (ShadowMaps).
 * Lights are drawn additively into a light map cleared to the room's ambient colour; the light map is
 * then multiplied over the world. Lights with `shadows` also march their shadows through it.
 */
export class Lighting {
  private rt: RenderTexture;
  private lights = new Container();
  private plain = new LightPool(this.lights, false);
  private shadowing = new LightPool(this.lights, true);
  readonly overlay: Sprite;
  private time = 0;

  constructor(w: number, h: number) {
    this.rt = RenderTexture.create({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)), scaleMode: 'nearest' });
    this.overlay = new Sprite(this.rt);
    this.overlay.blendMode = 'multiply';
  }

  /** Replace the light map with one of the new size (resizing in place leaves the sprite's bounds stale). */
  resize(w: number, h: number): void {
    const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
    if (width === this.rt.width && height === this.rt.height) return;
    const old = this.rt;
    this.rt = RenderTexture.create({ width, height, scaleMode: 'nearest' });
    this.overlay.texture = this.rt;
    old.destroy(true);
  }

  render(
    renderer: Renderer, camX: number, camY: number, scale: number, lights: LightInstance[], ambient: number, dt: number,
    maps: ShadowMaps, blobs: ShadowBlob[] = [],
  ): void {
    this.time += dt;
    const t = this.time;
    this.plain.begin();
    this.shadowing.begin();
    // Lights need the area's geometry; until the first room is built there is only the ambient.
    if (maps.surface && lights.length) {
      maps.renderActors(renderer, blobs);
      const actors = new Float32Array(MAX_ACTORS * 2);
      blobs.slice(0, MAX_ACTORS).forEach((b, i) => actors.set([b.x * TILE_PX, b.y * TILE_PX], i * 2));
      lights.forEach((l, i) => {
        const seed = l.seed ?? i;
        const f = l.def.flicker ?? 0;
        const flick = f ? 1 - f * (0.5 + 0.5 * Math.sin(t * 13 + seed * 7.1) * Math.sin(t * 7.3 + seed)) : 1;
        const reach = l.def.radius * TILE_PX * (0.97 + 0.03 * flick);
        const s = (l.def.shadows ? this.shadowing : this.plain).next(maps);
        // The flame wanders a little and its height breathes with the flicker, so shadows waver with it.
        const wob = f * 0.06;
        const lx = (l.x + wob * Math.sin(t * 9.7 + seed * 3.1)) * TILE_PX, ly = (l.y + wob * Math.sin(t * 11.3 + seed * 1.7)) * TILE_PX;
        s.u.uLight.set([lx, ly, (l.def.height ?? DEFAULT_LIGHT_HEIGHT) * (0.94 + 0.06 * flick), reach]);
        const c = l.def.color;
        s.u.uColor.set([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, (l.def.intensity ?? 1) * flick]);
        // Its reach on the floor, and above it what is drawn up from there.
        const x0 = l.x * TILE_PX - reach, y0 = l.y * TILE_PX - reach - DRAWN_ABOVE;
        const w = reach * 2, h = reach * 2 + DRAWN_ABOVE;
        s.u.uQuad.set([x0, y0, w, h]);
        const own = l.self;
        s.u.uSelf.set(own ? [own.x * TILE_PX, own.y * TILE_PX, (own.x + own.w) * TILE_PX, (own.y + own.h) * TILE_PX] : [0, 0, 0, 0]);
        s.u.uActors.set(actors);
        s.mesh.position.set(x0 - camX, y0 - camY);
        s.mesh.scale.set(w, h);
      });
    }
    this.plain.end();
    this.shadowing.end();
    renderer.render({ container: this.lights, target: this.rt, clear: true, clearColor: ambient });
    this.overlay.scale.set(scale);
  }
}

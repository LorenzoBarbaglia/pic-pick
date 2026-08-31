/**
 * Motore di sviluppo su GPU.
 *
 * Perché non bastavano i filtri CSS/SVG: le operazioni fotografiche vere si
 * fanno in **luce lineare** (esposizione come moltiplicazione, contrasto attorno
 * al grigio medio 0.18 in log), con un **roll-off morbido** delle alte luci che
 * impedisce alle luci di bruciarsi, e con controlli **selettivi** (per fascia di
 * tono e per fascia di colore). Fatte con filtri generici, le stesse regolazioni
 * clippano, virano e producono quel colore piatto da filtro social.
 *
 * Qui c'è un solo fragment shader che fa tutta la catena; lo usano l'anteprima,
 * la lente, i dettagli e l'export — quindi non possono divergere.
 */

import type { Develop } from './develop'
import { BW_FILTERS, hueToRgb } from './develop'
import { getLut, lutToTexture } from './lut'

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
uniform vec4 uRegion; // x, y, w, h normalizzati nella texture
void main() {
  vec2 unit = aPos * 0.5 + 0.5;
  vUv = uRegion.xy + unit * uRegion.zw;
  gl_Position = vec4(aPos.x, -aPos.y, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform float uExposure;   // stop
uniform float uContrast;   // -1..1
uniform vec4  uTone;       // luci, ombre, bianchi, neri (-1..1)
uniform vec2  uWb;         // temperatura, tinta (-1..1)
uniform vec2  uSat;        // vividezza, saturazione (-1..1)
uniform vec2  uSkin;       // incarnati: saturazione, luminosità
uniform vec2  uSky;        // cieli
uniform vec2  uGreen;      // verdi
uniform vec3  uGradeLow;   // viraggio ombre (offset colore)
uniform vec3  uGradeMid;   // viraggio mezzitoni
uniform vec3  uGradeHigh;  // viraggio luci
uniform float uClarity;    // -1..1: contrasto locale
uniform vec2  uClarityStep;// raggio del campionamento, in coordinate uv
uniform float uSharp;      // 0..1: acutanza sui bordi fini
uniform vec2  uSharpStep;  // raggio fine, in coordinate uv
uniform float uFade;       // 0..1
uniform float uBw;         // 0/1
uniform vec3  uBwMix;      // pesi dei canali per il bianco e nero
uniform sampler2D uLut;    // LUT creativo impacchettato in 2D
uniform float uLutSize;    // lato della griglia (0 = nessun LUT)
uniform float uLutAmount;  // quanto pesa

const float PIVOT = 0.18; // grigio medio: il perno di tutto

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

/** peso di una fascia di colore: distanza circolare dal centro della fascia */
float band(float hue, float center, float width) {
  float d = abs(fract(hue - center + 0.5) - 0.5);
  return exp(-(d * d) / (2.0 * width * width));
}

/**
 * Roll-off delle alte luci, tarato sull'esposizione: «white» è il valore che
 * deve finire esattamente su bianco. Senza esposizione white = 1, la curva è
 * l'identità agli estremi e ammorbidisce solo il tratto finale; con esposizione
 * alta comprime l'eccesso invece di bruciarlo. Un roll-off fisso, applicato
 * sempre, spegnerebbe le luci anche a regolazioni neutre.
 */
vec3 softClip(vec3 x, float white) {
  float t = min(0.85, 1.0 / white);
  vec3 over = max(x - t, 0.0);
  vec3 room = vec3(max(white - t, 1e-4));
  vec3 k = clamp(over / room, 0.0, 1.0);
  return min(x, vec3(t)) + (1.0 - t) * (1.0 - (1.0 - k) * (1.0 - k));
}

/** contrasto fotografico: guadagno in log attorno al grigio medio */
vec3 applyContrast(vec3 lin, float amount) {
  vec3 l = log2(max(lin, vec3(1e-5)) / PIVOT);
  l *= 1.0 + amount;
  return exp2(l) * PIVOT;
}

/**
 * Campionamento del LUT 3D impacchettato in una texture 2D: le fette di blu
 * stanno affiancate, quindi si interpola a mano tra due fette adiacenti.
 */
vec3 sampleLut(vec3 color) {
  float size = uLutSize;
  vec3 c = clamp(color, 0.0, 1.0);
  float width = size * size;
  float blue = c.b * (size - 1.0);
  float slice0 = floor(blue);
  float slice1 = min(slice0 + 1.0, size - 1.0);
  float between = blue - slice0;
  float xInSlice = c.r * (size - 1.0) + 0.5;
  float y = (c.g * (size - 1.0) + 0.5) / size;
  vec3 low = texture2D(uLut, vec2((slice0 * size + xInSlice) / width, y)).rgb;
  vec3 high = texture2D(uLut, vec2((slice1 * size + xInSlice) / width, y)).rgb;
  return mix(low, high, between);
}

/** luce percepita, per stimare il contrasto locale */
float lumaSrgb(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

/** la luce media attorno al punto: otto campioni a raggio ampio */
float localAverage(vec2 uv, vec2 step) {
  float s = 0.0;
  s += lumaSrgb(texture2D(uImage, uv + vec2(-step.x, -step.y)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(0.0, -step.y)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(step.x, -step.y)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(-step.x, 0.0)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(step.x, 0.0)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(-step.x, step.y)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(0.0, step.y)).rgb);
  s += lumaSrgb(texture2D(uImage, uv + vec2(step.x, step.y)).rgb);
  return s * 0.125;
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  vec3 lin = srgbToLinear(src.rgb);

  // 1. bilanciamento del bianco, in luce lineare come una vera temperatura colore
  float temp = uWb.x;
  float tint = uWb.y;
  vec3 wb = vec3(
    1.0 + temp * 0.22 + tint * 0.05,
    1.0 - abs(temp) * 0.03 - tint * 0.14,
    1.0 - temp * 0.24 + tint * 0.05
  );
  lin *= wb;

  // 2. esposizione: una moltiplicazione, come aprire il diaframma
  lin *= exp2(uExposure);

  // 3. contrasto attorno al grigio medio
  if (abs(uContrast) > 0.001) lin = applyContrast(lin, uContrast);

  // 4. le luci rotolano invece di bruciarsi: il punto di bianco tiene conto
  //    di quanto l'esposizione ha spinto oltre l'unità
  lin = softClip(lin, max(1.0, exp2(uExposure) * (1.0 + max(0.0, uContrast) * 0.35)));

  // 5. bianco e nero con mixer di canale (come i filtri sulla pellicola)
  if (uBw > 0.5) {
    float g = dot(lin, uBwMix);
    lin = vec3(g);
  }

  // 6. dal lineare al display: i controlli tonali lavorano su ciò che si vede
  vec3 col = clamp(linearToSrgb(lin), 0.0, 1.0);
  float L = luma(col);

  // 7. quattro zone tonali, con pesi morbidi che non creano gradini
  float wShadow = pow(1.0 - smoothstep(0.0, 0.55, L), 1.4);
  float wHigh = pow(smoothstep(0.45, 1.0, L), 1.4);
  float wBlack = pow(1.0 - smoothstep(0.0, 0.28, L), 2.0);
  float wWhite = pow(smoothstep(0.72, 1.0, L), 2.0);
  float lift =
    uTone.y * wShadow * 0.30 +
    uTone.w * wBlack * 0.24 +
    uTone.x * wHigh * 0.28 +
    uTone.z * wWhite * 0.24;
  // la correzione mantiene il colore: si sposta la luminosità, non la tinta
  col = clamp(col + lift, 0.0, 1.0);

  // 8. matte: i neri non arrivano a zero, come su carta
  if (uFade > 0.001) col = col * (1.0 - uFade * 0.16) + uFade * 0.13;

  // 9. colore: vividezza (protegge gli incarnati), saturazione, fasce.
  //    La saturazione si fa mescolando verso il GRIGIO DI LUMINANZA, non in HSV:
  //    desaturare in HSV sbianca i colori pieni (un rosso saturo diventerebbe
  //    bianco invece di grigio) ed è uno dei difetti tipici dei filtri finti.
  if (uBw < 0.5) {
    float lum = luma(col);
    vec3 hsv = rgb2hsv(col);
    float sat = hsv.y;
    float skin = band(hsv.x, 0.068, 0.075);
    float sky = band(hsv.x, 0.575, 0.115);
    float green = band(hsv.x, 0.30, 0.10);

    float factor = 1.0;
    // vividezza: agisce dove il colore è tenue, e risparmia la pelle
    factor *= 1.0 + uSat.x * (1.0 - sat) * (1.0 - 0.55 * skin);
    factor *= 1.0 + uSat.y;
    factor *= 1.0 + uSkin.x * skin + uSky.x * sky + uGreen.x * green;
    col = mix(vec3(lum), col, max(0.0, factor));

    // luminosità di fascia: alza o abbassa la zona senza spostarne la tinta
    float lumShift = (uSkin.y * skin + uSky.y * sky + uGreen.y * green) * 0.55;
    if (abs(lumShift) > 0.001) col *= 1.0 + lumShift;
    col = clamp(col, 0.0, 1.0);
  }

  // 9-bis. CHIAREZZA: contrasto locale, il modo onesto di «migliorare» una
  // foto — non inventa dettaglio, rende leggibile quello che c'è. La media
  // locale si legge sull'originale (in un passaggio solo non si hanno i vicini
  // già sviluppati) e la differenza si somma pesata sui mezzitoni, così neri e
  // bianchi non aprono aloni.
  if (abs(uClarity) > 0.001) {
    float here = lumaSrgb(src.rgb);
    float around = localAverage(vUv, uClarityStep);
    float mid = 1.0 - pow(abs(clamp(luma(col), 0.0, 1.0) * 2.0 - 1.0), 2.0);
    col += (here - around) * uClarity * mid * 1.6;
    col = clamp(col, 0.0, 1.0);
  }

  // 9-ter. NITIDEZZA: acutanza sui bordi fini. La maschera del bordo è la parte
  // che conta — sotto una certa soglia il dettaglio è rumore del sensore, e
  // affilarlo lo rende solo più visibile (è il motivo per cui gli editor seri
  // hanno un «masking»: qui e' automatico).
  if (uSharp > 0.001) {
    float hereS = lumaSrgb(src.rgb);
    float aroundS = localAverage(vUv, uSharpStep);
    float d = hereS - aroundS;
    float edge = smoothstep(0.004, 0.030, abs(d));
    // le luci quasi bruciate non si affilano: si aprirebbero aloni bianchi
    float room = 1.0 - smoothstep(0.86, 1.0, clamp(luma(col), 0.0, 1.0));
    col += d * uSharp * edge * room * 2.2;
    col = clamp(col, 0.0, 1.0);
  }

  // 10. viraggio a tre vie: ombre, mezzitoni e luci prendono tinte diverse
  float Lg = luma(col);
  float gLow = pow(1.0 - clamp(Lg, 0.0, 1.0), 2.0);
  float gHigh = pow(clamp(Lg, 0.0, 1.0), 2.0);
  float gMid = max(0.0, 1.0 - gLow - gHigh);
  col += uGradeLow * gLow + uGradeMid * gMid + uGradeHigh * gHigh;

  col = clamp(col, 0.0, 1.0);

  // 11. LUT creativo: si applica per ultimo, sopra tutto il resto
  if (uLutSize > 1.5 && uLutAmount > 0.001) {
    col = mix(col, sampleLut(col), uLutAmount);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), src.a);
}
`

interface Program {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement
  program: WebGLProgram
  texture: WebGLTexture
  lutTexture: WebGLTexture
  uniforms: Record<string, WebGLUniformLocation | null>
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('pic&pick: shader non compilato', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(): Program | null {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false
  })
  if (!gl) return null

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('pic&pick: programma non collegato', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  // un quad che copre tutto lo schermo
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const lutTexture = gl.createTexture()
  if (!lutTexture) return null
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, lutTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.activeTexture(gl.TEXTURE0)

  const names = [
    'uImage',
    'uLut',
    'uLutSize',
    'uLutAmount',
    'uRegion',
    'uExposure',
    'uClarity',
    'uClarityStep',
    'uSharp',
    'uSharpStep',
    'uContrast',
    'uTone',
    'uWb',
    'uSat',
    'uSkin',
    'uSky',
    'uGreen',
    'uGradeLow',
    'uGradeMid',
    'uGradeHigh',
    'uFade',
    'uBw',
    'uBwMix'
  ]
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of names) uniforms[name] = gl.getUniformLocation(program, name)

  return { gl, canvas, program, texture, lutTexture, uniforms }
}

/** offset di colore di una via del viraggio: tinta + intensità → spostamento rgb */
function gradeOffset(hue: number, amount: number): [number, number, number] {
  if (amount === 0) return [0, 0, 0]
  const [r, g, b] = hueToRgb(hue)
  const strength = (amount / 100) * 0.34
  return [(r - 0.5) * strength, (g - 0.5) * strength, (b - 0.5) * strength]
}

/**
 * Un renderer: ha il suo canvas e il suo contesto. Se ne tengono due — uno per
 * l'anteprima a schermo, uno per i dettagli a pixel reali e per l'export — così
 * un render non cancella l'altro.
 */
export class DevelopRenderer {
  private program: Program | null
  private uploaded: TexImageSource | null = null
  private lutUploaded = ''

  constructor() {
    this.program = createProgram()
  }

  get available(): boolean {
    return this.program !== null
  }

  /**
   * Sviluppa `source` e restituisce il canvas col risultato (lo stesso canvas
   * viene riusato a ogni chiamata: chi ne ha bisogno lo copia subito).
   * `region` (in pixel sorgente) permette di sviluppare solo una porzione a
   * scala 1:1, come serve alla lente.
   */
  render(
    source: TexImageSource,
    develop: Develop,
    options: {
      width: number
      height: number
      region?: { x: number; y: number; w: number; h: number }
      sourceWidth: number
      sourceHeight: number
    }
  ): HTMLCanvasElement | null {
    const p = this.program
    if (!p) return null
    const { gl, uniforms } = p
    p.canvas.width = Math.max(1, Math.round(options.width))
    p.canvas.height = Math.max(1, Math.round(options.height))
    gl.viewport(0, 0, p.canvas.width, p.canvas.height)

    // il LUT creativo occupa la seconda unità di texture
    const lut = develop.lutName ? getLut(develop.lutName) : null
    if (lut && this.lutUploaded !== lut.name) {
      const packed = lutToTexture(lut)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, p.lutTexture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        packed.width,
        packed.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        packed.pixels
      )
      this.lutUploaded = lut.name
    }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, p.lutTexture)
    gl.uniform1i(uniforms.uLut, 1)
    gl.uniform1f(uniforms.uLutSize, lut ? lut.size : 0)
    gl.uniform1f(uniforms.uLutAmount, lut ? develop.lutAmount / 100 : 0)
    gl.activeTexture(gl.TEXTURE0)

    gl.bindTexture(gl.TEXTURE_2D, p.texture)
    if (this.uploaded !== source) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      this.uploaded = source
    }
    gl.uniform1i(uniforms.uImage, 0)

    const region = options.region
    if (region) {
      gl.uniform4f(
        uniforms.uRegion,
        region.x / options.sourceWidth,
        region.y / options.sourceHeight,
        region.w / options.sourceWidth,
        region.h / options.sourceHeight
      )
    } else {
      gl.uniform4f(uniforms.uRegion, 0, 0, 1, 1)
    }

    // il raggio della chiarezza è relativo all'immagine (~1% del lato corto):
    // così l'anteprima ridotta e l'export a piena risoluzione si somigliano
    const clarityRadius = Math.max(
      2,
      Math.min(options.sourceWidth, options.sourceHeight) * 0.01
    )
    // Il raggio della nitidezza vive nei pixel della SORGENTE (1-2.5 px,
    // secondo la regola dei manuali: fine sulle foto ricche di dettaglio,
    // più largo su quelle morbide, che sono anche quelle che chiedono dose
    // alta). Non scende mai sotto un pixel di ciò che si sta disegnando,
    // altrimenti nell'anteprima ridotta diventerebbe scintillio.
    const sharpAmount = Math.max(0, develop.sharpness ?? 0) / 100
    const renderPxInSource = (options.region?.w ?? options.sourceWidth) / options.width
    const sharpRadius = Math.max(1 + sharpAmount * 1.5, renderPxInSource)
    gl.uniform1f(uniforms.uSharp, sharpAmount)
    gl.uniform2f(
      uniforms.uSharpStep,
      sharpRadius / options.sourceWidth,
      sharpRadius / options.sourceHeight
    )
    gl.uniform1f(uniforms.uClarity, (develop.clarity ?? 0) / 100)
    gl.uniform2f(
      uniforms.uClarityStep,
      clarityRadius / options.sourceWidth,
      clarityRadius / options.sourceHeight
    )
    gl.uniform1f(uniforms.uExposure, (develop.exposure / 100) * 1.35)
    gl.uniform1f(uniforms.uContrast, develop.contrast / 100)
    gl.uniform4f(
      uniforms.uTone,
      develop.highlights / 100,
      develop.shadows / 100,
      develop.whites / 100,
      develop.blacks / 100
    )
    gl.uniform2f(uniforms.uWb, develop.temperature / 100, develop.tint / 100)
    gl.uniform2f(uniforms.uSat, develop.vibrance / 100, develop.saturation / 100)
    gl.uniform2f(uniforms.uSkin, develop.skinSat / 100, develop.skinLum / 100)
    gl.uniform2f(uniforms.uSky, develop.skySat / 100, develop.skyLum / 100)
    gl.uniform2f(uniforms.uGreen, develop.greenSat / 100, develop.greenLum / 100)
    gl.uniform3fv(uniforms.uGradeLow, gradeOffset(develop.gradeLowHue, develop.gradeLowSat))
    gl.uniform3fv(uniforms.uGradeMid, gradeOffset(develop.gradeMidHue, develop.gradeMidSat))
    gl.uniform3fv(uniforms.uGradeHigh, gradeOffset(develop.gradeHighHue, develop.gradeHighSat))
    gl.uniform1f(uniforms.uFade, develop.fade / 100)
    gl.uniform1f(uniforms.uBw, develop.bw ? 1 : 0)
    const mix = BW_FILTERS[develop.bwFilter] ?? BW_FILTERS.neutral
    gl.uniform3fv(uniforms.uBwMix, mix)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return p.canvas
  }

  /** la prossima chiamata ricaricherà la texture (immagine cambiata) */
  invalidate(): void {
    this.uploaded = null
  }

  /** rilegge i pixel dell'ultimo rendering: serve a esportare il look come LUT */
  readPixels(width: number, height: number): Uint8Array | null {
    const p = this.program
    if (!p) return null
    const pixels = new Uint8Array(width * height * 4)
    p.gl.readPixels(0, 0, width, height, p.gl.RGBA, p.gl.UNSIGNED_BYTE, pixels)
    // WebGL legge dal basso: si rigira per far combaciare le righe
    const flipped = new Uint8Array(pixels.length)
    const stride = width * 4
    for (let y = 0; y < height; y++) {
      flipped.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride)
    }
    return flipped
  }
}

let previewRenderer: DevelopRenderer | null = null
let detailRenderer: DevelopRenderer | null = null

/** renderer dell'anteprima a schermo */
export function getPreviewRenderer(): DevelopRenderer {
  previewRenderer = previewRenderer ?? new DevelopRenderer()
  return previewRenderer
}

/** renderer per lente, dettagli ed export: lavora a pixel reali */
export function getDetailRenderer(): DevelopRenderer {
  detailRenderer = detailRenderer ?? new DevelopRenderer()
  return detailRenderer
}

/** lato lungo massimo dell'anteprima: oltre non si vedrebbe la differenza */
export const PREVIEW_MAX_PX = 2400

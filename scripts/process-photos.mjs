import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const RAW_DIR = './src/photos/raw';
const OUT_DIR = './src/assets/photos';

const SPECS = {
  'about-main': { ratio: 4/5, cx: 0.45, cy: 0.50, finalW: 1600, finalH: 2000 },
  'about-detail': { ratio: 1/1, cx: 0.50, cy: 0.50, finalW: 1200, finalH: 1200 },
  'facility-nave': { ratio: 4/5, cx: 0.50, cy: 0.55, finalW: 1600, finalH: 2000 },
  'facility-jaulas': { finalW: 1600, finalH: 2000 },
  'facility-sauna': { finalW: 1600, finalH: 2000 },
  'facility-regaderas': { finalW: 1600, finalH: 2000 },
};

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h/360 + 1/3);
    g = hue2rgb(p, q, h/360);
    b = hue2rgb(p, q, h/360 - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

async function processPhotos() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const getVignetteSvg = (w, h) => `
    <svg width="${w}" height="${h}">
      <defs>
        <radialGradient id="v" cx="50%" cy="50%" r="70%">
          <stop offset="50%" stop-color="#000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000" stop-opacity="0.35" />
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#v)" />
    </svg>
  `;

  if (!fs.existsSync(RAW_DIR)) {
    console.log(`Directory ${RAW_DIR} does not exist. Nothing to process.`);
    return;
  }

  const files = fs.readdirSync(RAW_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  for (const file of files) {
    const basename = path.basename(file, path.extname(file));
    const spec = SPECS[basename];

    if (!spec) {
      console.log(`WARNING: No spec found for ${basename}, skipping.`);
      continue;
    }

    console.log(`Processing ${basename}...`);
    const inputPath = path.join(RAW_DIR, file);
    const outputPath = path.join(OUT_DIR, `${basename}.jpg`);

    const meta = await sharp(inputPath).metadata();
    let image = sharp(inputPath);
    let extractW = meta.width;
    let extractH = meta.height;

    // 1. Crop
    if (spec.ratio) {
      extractH = meta.height;
      extractW = Math.round(extractH * spec.ratio);

      if (extractW > meta.width) {
        extractW = meta.width;
        extractH = Math.round(extractW / spec.ratio);
      }

      let x = Math.round((meta.width * spec.cx) - (extractW / 2));
      let y = Math.round((meta.height * spec.cy) - (extractH / 2));

      x = Math.max(0, Math.min(x, meta.width - extractW));
      y = Math.max(0, Math.min(y, meta.height - extractH));

      image = image.extract({ left: x, top: y, width: extractW, height: extractH });

      if (extractW < spec.finalW * 0.6) {
        console.log(`ADVERTENCIA: ${basename} necesita upscale IA (crop real ${extractW}px < 60% de final ${spec.finalW}px)`);
      }
    }

    // 2. Resize
    image = image.resize(spec.finalW, spec.finalH, { kernel: sharp.kernel.lanczos3 });

    // 3. Grade
    // a. Desaturar azules/cianes
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i+1], b = data[i+2];
      let [h, s, l] = rgbToHsl(r, g, b);

      if (h >= 175 && h <= 265) {
        s = Math.max(0, s * 0.45);
        l = Math.max(0, l - 0.08); // -8%
        
        const [rO, gO, bO] = hslToRgb(h, s, l);
        data[i] = rO; data[i+1] = gO; data[i+2] = bO;
      }
    }

    image = sharp(data, { raw: info });

    // b. modulate brightness 0.95, saturation 0.95
    image = image.modulate({ brightness: 0.95, saturation: 0.95 });

    // c. linear(1.10, -12)
    image = image.linear(1.10, -12);

    // d. Vignette
    const vignette = Buffer.from(getVignetteSvg(spec.finalW, spec.finalH));
    image = image.composite([{ input: vignette, blend: 'over' }]);

    // e. Sharpen
    image = image.sharpen(0.6);

    await image.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath);
    console.log(`Saved ${outputPath}`);
  }
}

processPhotos().catch(err => {
  console.error("Error processing photos:", err);
  process.exit(1);
});

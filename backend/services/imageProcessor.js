const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const sharp = require("sharp");

const execFileAsync = promisify(execFile);
const POTRACE_PATH = "C:\\potrace\\potrace.exe";

// ─────────────────────────────────────────────────────────
// FUNÇÃO AUXILIAR: Quantização de cor (K-Means simplificado)
//
// Recebe os pixels da imagem (array de bytes RGBA) e um número
// de cores desejado, e agrupa os pixels nas cores mais representativas.
//
// Como funciona:
// 1. Coleta uma amostra aleatória de pixels (para ser rápido)
// 2. Escolhe N pixels aleatórios como "centros" iniciais
// 3. Para cada pixel da amostra, encontra o centro mais próximo
// 4. Recalcula os centros como a média dos pixels atribuídos
// 5. Repete por 10 iterações (suficiente para convergir)
//
// O resultado é uma lista de N cores no formato {r, g, b}
// ─────────────────────────────────────────────────────────
function quantizeColors(pixels, numColors) {
  // Coleta pixels não-transparentes como amostras (pula de 4 em 4 = RGBA)
  const samples = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a > 128) {
      // ignora pixels muito transparentes
      samples.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
    }
  }

  if (samples.length === 0) return [{ r: 0, g: 0, b: 0 }];

  // Escolhe centros iniciais aleatoriamente
  let centers = [];
  for (let i = 0; i < numColors; i++) {
    const idx = Math.floor(Math.random() * samples.length);
    centers.push({ ...samples[idx] });
  }

  // 10 iterações de K-Means
  for (let iter = 0; iter < 10; iter++) {
    // Agrupa cada pixel no centro mais próximo
    const groups = Array.from({ length: numColors }, () => []);
    for (const pixel of samples) {
      let minDist = Infinity;
      let closest = 0;
      for (let c = 0; c < centers.length; c++) {
        // Distância euclidiana no espaço RGB
        const dr = pixel.r - centers[c].r;
        const dg = pixel.g - centers[c].g;
        const db = pixel.b - centers[c].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
      groups[closest].push(pixel);
    }

    // Recalcula cada centro como a média dos pixels do grupo
    for (let c = 0; c < numColors; c++) {
      if (groups[c].length === 0) continue;
      const avg = groups[c].reduce(
        (acc, p) => ({
          r: acc.r + p.r,
          g: acc.g + p.g,
          b: acc.b + p.b,
        }),
        { r: 0, g: 0, b: 0 },
      );
      centers[c] = {
        r: Math.round(avg.r / groups[c].length),
        g: Math.round(avg.g / groups[c].length),
        b: Math.round(avg.b / groups[c].length),
      };
    }
  }

  return centers;
}

// ─────────────────────────────────────────────────────────
// FUNÇÃO AUXILIAR: Converte cor RGB para string HEX
// Ex: { r: 255, g: 0, b: 0 } → "#ff0000"
// ─────────────────────────────────────────────────────────
function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────
// FUNÇÃO AUXILIAR: Vetoriza uma máscara com Potrace
//
// Recebe uma imagem em preto e branco (os pixels pretos serão
// traçados como caminhos vetoriais) e retorna apenas o conteúdo
// interno do SVG (os <path>s), sem o cabeçalho SVG.
// ─────────────────────────────────────────────────────────
async function runPotrace(maskBuffer, width, height) {
  const tmpDir = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpPgm = path.join(tmpDir, `veclean-${id}.pgm`);
  const tmpSvg = path.join(tmpDir, `veclean-${id}.svg`);

  try {
    // Monta o arquivo PGM (formato que o Potrace lê nativamente)
    const header = `P5\n${width} ${height}\n255\n`;
    const pgmBuffer = Buffer.concat([Buffer.from(header, "ascii"), maskBuffer]);
    fs.writeFileSync(tmpPgm, pgmBuffer);

    // Roda o Potrace
    await execFileAsync(POTRACE_PATH, [
      "-b",
      "svg",
      "--blacklevel",
      "0.5",
      "--turdsize",
      "2", // ignora manchas menores que 2px (remove ruído)
      "--alphamax",
      "1", // suavidade das curvas
      "--opttolerance",
      "0.2",
      "-o",
      tmpSvg,
      tmpPgm,
    ]);

    // Lê o SVG gerado e extrai apenas os <path>s internos
    // O Potrace gera um SVG completo, mas queremos só os caminhos
    // para montar nosso próprio SVG multi-camada
    const svgFull = fs.readFileSync(tmpSvg, "utf8");

    // Extrai o conteúdo dentro do <g> principal do SVG do Potrace
    const match = svgFull.match(/<g[^>]*>([\s\S]*?)<\/g>/);
    return match ? match[1].trim() : "";
  } finally {
    try {
      fs.unlinkSync(tmpPgm);
    } catch {}
    try {
      fs.unlinkSync(tmpSvg);
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────
async function process(imageBuffer, mimeType, colorCount = "auto") {
  // ── Etapa 1: Pré-processar com Sharp ──────────────────
  // Redimensiona, remove ruído, e extrai pixels RGBA crus
  const { data: rgbaPixels, info } = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .median(3) // remove ruído de fundo
    .normalize() // aumenta contraste
    .ensureAlpha() // garante que temos 4 canais (RGBA)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // ── Etapa 2: Decidir número de cores ──────────────────
  // 'auto' = detecta automaticamente entre 2 e 4 cores
  // número fixo = usa o valor enviado pelo usuário
  const numColors =
    colorCount === "auto"
      ? 4 // padrão automático: 4 cores cobre bem a maioria dos logos
      : Math.max(2, Math.min(5, parseInt(colorCount))); // limita entre 2 e 5

  // ── Etapa 3: Quantizar cores ──────────────────────────
  // Agrupa todos os pixels nas N cores mais representativas
  const palette = quantizeColors(rgbaPixels, numColors);

  // ── Etapa 4: Para cada cor, criar máscara e vetorizar ──
  // Cada cor vira uma camada independente no SVG final
  const layers = [];

  for (let c = 0; c < palette.length; c++) {
    const color = palette[c];

    // Cria uma máscara: pixels DESTA cor = preto (0), resto = branco (255)
    // A máscara tem 1 byte por pixel (escala de cinza)
    const maskData = Buffer.alloc(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = rgbaPixels[i * 4];
      const g = rgbaPixels[i * 4 + 1];
      const b = rgbaPixels[i * 4 + 2];
      const a = rgbaPixels[i * 4 + 3];

      if (a < 128) {
        // Pixel transparente → branco (não traça)
        maskData[i] = 255;
        continue;
      }

      // Encontra qual cor da paleta este pixel pertence
      let minDist = Infinity;
      let closest = 0;
      for (let j = 0; j < palette.length; j++) {
        const dr = r - palette[j].r;
        const dg = g - palette[j].g;
        const db = b - palette[j].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          closest = j;
        }
      }

      // Se este pixel pertence à cor atual → preto (será traçado)
      // Caso contrário → branco (será ignorado)
      maskData[i] = closest === c ? 0 : 255;
    }

    // Roda o Potrace nessa máscara e obtém os caminhos SVG
    const paths = await runPotrace(maskData, width, height);

    if (paths) {
      layers.push({ color: rgbToHex(color), paths });
    }
  }

  // ── Etapa 5: Montar o SVG final com todas as camadas ──
  // Cada cor vira um <g fill="cor"> com seus caminhos dentro
  const svgLayers = layers
    .map(
      (layer) =>
        `  <g fill="${layer.color}" stroke="none">\n${layer.paths}\n  </g>`,
    )
    .join("\n");

  const svgFinal = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${svgLayers}
</svg>`;

  return { svg: svgFinal };
}

module.exports = { process };

async function process(imageBuffer, mimeType) {
  const tmpDir = os.tmpdir();
  const tmpPgm = path.join(tmpDir, `veclean-${Date.now()}.pgm`);
  const tmpSvg = path.join(tmpDir, `veclean-${Date.now()}.svg`);

  try {
    // ── Etapa 1: Pré-processar com Sharp ──────────────────
    // Redimensiona, converte para escala de cinza, melhora contraste
    // e extrai os dados RAW (pixels puros) em vez de salvar num formato de arquivo
    const { data, info } = await sharp(imageBuffer)
      .resize(1024, 1024, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .normalize()
      .median(3)
      .raw() // retorna os pixels crus, sem cabeçalho de formato
      .toBuffer({ resolveWithObject: true }); // info contém width, height, channels

    // ── Etapa 2: Montar um arquivo PGM manualmente ────────
    // PGM é um formato de imagem extremamente simples:
    // cabeçalho de texto + dados de pixel em sequência.
    // Como já temos os pixels crus (escala de cinza, 1 canal), é fácil montar.
    //
    // Formato do cabeçalho PGM (P5 = binário):
    // P5
    // <largura> <altura>
    // <valor máximo de cinza (255)>
    // <dados binários dos pixels>
    const header = `P5\n${info.width} ${info.height}\n255\n`;
    const pgmBuffer = Buffer.concat([Buffer.from(header, "ascii"), data]);

    fs.writeFileSync(tmpPgm, pgmBuffer);

    // ── Etapa 3: Rodar o Potrace ───────────────────────────
    await execFileAsync(POTRACE_PATH, [
      "-b",
      "svg",
      "--blacklevel",
      "0.5",
      "--turdsize",
      "4",
      "--alphamax",
      "1",
      "--opttolerance",
      "0.2",
      "-o",
      tmpSvg,
      tmpPgm,
    ]);

    // ── Etapa 4: Ler o SVG gerado ──────────────────────────
    const svgContent = fs.readFileSync(tmpSvg, "utf8");

    return { svg: svgContent };
  } finally {
    try {
      fs.unlinkSync(tmpPgm);
    } catch {}
    try {
      fs.unlinkSync(tmpSvg);
    } catch {}
  }
}

module.exports = { process };

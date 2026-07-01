const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const sharp = require("sharp");

const execFileAsync = promisify(execFile);

const POTRACE_PATH = "C:\\potrace\\potrace.exe";

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

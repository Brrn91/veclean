// Importa o módulo 'path' do Node — para montar caminhos de pasta
const path = require("path");

// Importa o módulo 'fs' do Node — para ler e escrever arquivos
const fs = require("fs");

// Importa o módulo 'os' do Node — para usar a pasta temporária do sistema
const os = require("os");

// Importa o 'child_process' — permite executar programas externos (como o potrace.exe)
const { execFile } = require("child_process");

// Importa o 'util' — para converter execFile em versão que usa Promise (async/await)
const { promisify } = require("util");

// Importa o Sharp — para pré-processar a imagem antes de enviar ao Potrace
const sharp = require("sharp");

// Converte execFile para usar async/await em vez de callbacks
const execFileAsync = promisify(execFile);

// Caminho fixo para o potrace.exe que você instalou
const POTRACE_PATH = "C:\\potrace\\potrace.exe";

// ─────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// Recebe o buffer da imagem e retorna o SVG vetorizado
// ─────────────────────────────────────────────────────────
async function process(imageBuffer, mimeType) {
  // Criamos arquivos temporários para o Potrace trabalhar
  // O Potrace precisa ler de um arquivo .bmp e escreve o resultado em .svg
  const tmpDir = os.tmpdir(); // pasta temporária do Windows (ex: C:\Users\lucas\AppData\Local\Temp)
  const tmpBmp = path.join(tmpDir, `veclean-${Date.now()}.bmp`);
  const tmpSvg = path.join(tmpDir, `veclean-${Date.now()}.svg`);

  try {
    // ── Etapa 1: Pré-processar com Sharp ──────────────────
    // Preparamos a imagem para que o Potrace tenha o melhor resultado:
    // - Redimensionamos para no máximo 1024px (mantendo proporção)
    // - Convertemos para escala de cinza (o Potrace trabalha com tons de cinza/preto e branco)
    // - Aumentamos o contraste com normalize()
    // - Aplicamos um leve desfoque para reduzir ruído de fundo
    // - Salvamos como BMP (formato que o Potrace lê melhor)
    await sharp(imageBuffer)
      .resize(1024, 1024, {
        fit: "inside", // mantém a proporção original
        withoutEnlargement: true, // não aumenta imagens pequenas
      })
      .grayscale() // converte para escala de cinza
      .normalize() // aumenta o contraste automaticamente
      .median(3) // remove ruído preservando bordas
      .toFile(tmpBmp); // salva como BMP no disco temporário

    // ── Etapa 2: Rodar o Potrace ───────────────────────────
    // Chamamos o potrace.exe com as seguintes opções:
    // -b svg         → formato de saída: SVG
    // --blacklevel   → limiar de cor (0.5 = meio tom) — pixels mais escuros viram preto
    // --turdsize     → ignora manchas menores que X pixels (remove ruído)
    // --alphamax     → suavidade das curvas (0 = anguloso, 1.33 = suave)
    // --opttolerance → tolerância de otimização dos caminhos
    // -o             → arquivo de saída
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
      tmpBmp,
    ]);

    // ── Etapa 3: Ler o SVG gerado ─────────────────────────
    // O Potrace escreveu o SVG em disco — lemos o conteúdo como texto
    const svgContent = fs.readFileSync(tmpSvg, "utf8");

    return { svg: svgContent };
  } finally {
    // ── Limpeza: apaga os arquivos temporários ─────────────
    // O bloco 'finally' roda sempre, mesmo se der erro
    // Assim não deixamos lixo na pasta temporária do sistema
    try {
      fs.unlinkSync(tmpBmp);
    } catch {}
    try {
      fs.unlinkSync(tmpSvg);
    } catch {}
  }
}

// Exporta a função para ser usada em outros arquivos
module.exports = { process };

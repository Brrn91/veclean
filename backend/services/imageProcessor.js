// Importa o Sharp — biblioteca de processamento de imagens
const sharp = require("sharp");

// Função principal que recebe o buffer da imagem e o tipo MIME
async function process(imageBuffer, mimeType) {
  // ─── Etapa 1: Normalizar a imagem ─────────────────────
  // Converte para PNG (formato sem perda), redimensiona se muito grande,
  // e converte para escala de cinza para facilitar o processamento
  const normalizedBuffer = await sharp(imageBuffer)
    .resize(1024, 1024, {
      fit: "inside", // mantém proporção, não corta
      withoutEnlargement: true, // não aumenta imagens pequenas
    })
    .png()
    .toBuffer();

  // ─── Etapa 2: Posterizar (reduzir número de cores) ────
  // Posterização é a chave para o efeito "vetorizado":
  // ela reduz as tonalidades contínuas (gradientes) para
  // um número fixo de níveis de cor — criando áreas sólidas
  const posterizedBuffer = await sharp(normalizedBuffer)
    .normalize() // aumenta o contraste automaticamente
    .median(3) // remove ruído mantendo bordas (filtro de mediana 3x3)
    .threshold(128) // converte para preto e branco puro (limiar em 128)
    .toBuffer();

  // ─── Etapa 3: Gerar SVG simples ───────────────────────
  // Por enquanto, incorporamos a imagem processada dentro de um SVG
  // Na próxima fase, usaremos o Potrace para criar SVG com caminhos vetoriais reais
  const base64 = posterizedBuffer.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <image href="data:image/png;base64,${base64}" width="1024" height="1024"/>
</svg>`;

  return { svg };
}

// Exporta a função para ser usada em outros arquivos
module.exports = { process };

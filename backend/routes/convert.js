// Importa o Router do Express — permite criar rotas separadas do servidor principal
const express = require("express");
const router = express.Router();

// Importa o Multer — responsável por receber o arquivo de imagem enviado pelo frontend
const multer = require("multer");

// Importa o serviço de processamento de imagem (criaremos em seguida)
const imageProcessor = require("../services/imageProcessor");

// ─── Configuração do Multer ───────────────────────────────
// memoryStorage: guarda o arquivo na memória RAM temporariamente
// em vez de salvar em disco — mais rápido para processar
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // limite de 10MB por arquivo
  },
  fileFilter: (req, file, cb) => {
    // Define quais tipos de arquivo são aceitos
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/bmp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true); // aceita o arquivo
    } else {
      cb(new Error("Formato de arquivo não suportado"), false); // rejeita
    }
  },
});

// ─── Rota POST /api/convert ───────────────────────────────
// O frontend vai enviar a imagem aqui via formulário multipart
// upload.single('image') significa: espera um único arquivo com o campo chamado "image"
router.post("/", upload.single("image"), async (req, res) => {
  try {
    // Se nenhum arquivo foi enviado, retorna erro
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }

    // req.file.buffer contém os bytes da imagem em memória
    // Passa para o serviço de processamento
    // Pega o número de cores enviado pelo frontend (ou 'auto' se não enviado)
    const colorCount = req.body.colorCount || "auto";

    const result = await imageProcessor.process(
      req.file.buffer,
      req.file.mimetype,
      colorCount,
    );

    // Retorna o SVG processado como resposta
    res.json({
      success: true,
      svg: result.svg,
      message: "Imagem processada com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao processar imagem:", error);
    res.status(500).json({ error: "Erro interno ao processar a imagem." });
  }
});

// Exporta o router para ser usado no server.js
module.exports = router;

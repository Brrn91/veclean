// Carrega as variáveis do arquivo .env (como PORT=....)
require("dotenv").config();

// Importa o Express, que é o framework que cria nosso servidor web
const express = require("express");

// Importa o CORS, que permite o frontend conversar com o backend
const cors = require("cors");

// Importa o path, módulo nativo do Node para lidar com caminhos de pasta
const path = require("path");

// Cria a aplicação Express
const app = express();

// Define a porta: usa a do .env ou 3000 como padrão
const PORT = process.env.PORT || 3000;

// ─── Middlewares ───────────────────────────────────────────
// Middlewares são funções que rodam em toda requisição antes de chegar na rota

// Habilita CORS para o frontend poder fazer requisições ao backend
app.use(cors());

// Permite que o servidor entenda JSON no corpo das requisições
app.use(express.json());

// Serve os arquivos estáticos da pasta frontend (HTML, CSS, JS)
// Quando alguém acessa http://localhost:3000, ele entrega o index.html
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ─── Rotas ────────────────────────────────────────────────
// Importa a rota de conversão de imagens
const convertRouter = require("./routes/convert");

// Registra a rota: qualquer requisição para /api/convert
// será tratada pelo arquivo routes/convert.js
app.use("/api/convert", convertRouter);

// ─── Rota fallback ────────────────────────────────────────
// Se alguém acessar qualquer outra URL, entrega o index.html
// Isso é importante para quando fizermos o deploy
app.get("{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ─── Inicia o servidor ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Veclean rodando em http://localhost:${PORT}`);
});

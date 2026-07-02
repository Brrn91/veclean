// ═══════════════════════════════════════════
// TEMA CLARO / ESCURO
// ═══════════════════════════════════════════

// Recupera o tema salvo anteriormente (ou usa 'dark' como padrão)
let currentTheme = localStorage.getItem("veclean-theme") || "dark";

// Aplica o tema assim que a página carrega
applyTheme(currentTheme);

function applyTheme(theme) {
  // Altera o atributo no <html> — o CSS usa isso para trocar as variáveis de cor
  document.documentElement.setAttribute("data-theme", theme);

  // Atualiza o ícone e texto do botão
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (theme === "dark") {
    icon.className = "ti ti-moon";
    label.textContent = "Tema claro";
  } else {
    icon.className = "ti ti-sun";
    label.textContent = "Tema escuro";
  }

  // Salva a preferência no localStorage para persistir entre visitas
  localStorage.setItem("veclean-theme", theme);
  currentTheme = theme;
}

// Chamado pelo botão de tema na navbar
document.getElementById("themeToggle").addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
});

// ═══════════════════════════════════════════
// REFERÊNCIAS AOS ELEMENTOS DO HTML
// ═══════════════════════════════════════════
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const processingState = document.getElementById("processingState");
const resultState = document.getElementById("resultState");
const previewOriginal = document.getElementById("previewOriginal");
const previewResult = document.getElementById("previewResult");

// Guarda o SVG retornado pelo backend para usar na exportação
let currentSVG = null;

// Referência ao slider e ao display de valor
const colorSlider = document.getElementById("colorSlider");
const colorCountDisplay = document.getElementById("colorCountDisplay");

// Atualiza o texto ao lado do slider em tempo real conforme o usuário arrasta
colorSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value);
  colorCountDisplay.textContent = val === 0 ? "Automático" : `${val + 1} cores`;
});

// Impede que clicar no slider abra o seletor de arquivo
// (sem isso, clicar no slider ativaria o clique da drop zone)
colorSlider.addEventListener("click", (e) => e.stopPropagation());

// ═══════════════════════════════════════════
// EVENTOS DA DROP ZONE
// ═══════════════════════════════════════════

// Clique na drop zone → abre o seletor de arquivo
dropZone.addEventListener("click", () => fileInput.click());

// Quando o usuário seleciona um arquivo pelo seletor
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// Drag over: arquivo sendo arrastado por cima da zona
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault(); // necessário para permitir o drop
  dropZone.classList.add("drag-over");
});

// Drag leave: arquivo saiu da zona sem soltar
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

// Drop: arquivo foi solto na zona
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0]; // pega o primeiro arquivo
  if (file) handleFile(file);
});

// Ctrl+V: usuário cola uma imagem da área de transferência
document.addEventListener("paste", (e) => {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) handleFile(file);
      break;
    }
  }
});

// ═══════════════════════════════════════════
// PROCESSAMENTO DO ARQUIVO
// ═══════════════════════════════════════════

function handleFile(file) {
  // Valida se é uma imagem
  if (!file.type.startsWith("image/")) {
    alert("Por favor, envie apenas arquivos de imagem.");
    return;
  }

  // Valida tamanho máximo (10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert("A imagem deve ter no máximo 10MB.");
    return;
  }

  // Mostra o preview da imagem original usando FileReader
  // FileReader lê o arquivo localmente, sem precisar de servidor
  const reader = new FileReader();
  reader.onload = (e) => {
    previewOriginal.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Muda para o estado de processamento
  showState("processing");

  // Envia a imagem para o backend
  uploadImage(file);
}

async function uploadImage(file) {
  // FormData é como um formulário HTML enviado via JavaScript
  // É a forma padrão de enviar arquivos via fetch
  const formData = new FormData();
  formData.append("image", file); // 'image' deve bater com upload.single('image') no backend

  // Pega o valor atual do slider e envia junto com a imagem
  // 0 = automático, 2-5 = número fixo de cores
  const sliderValue = parseInt(colorSlider.value);
  const colorCount = sliderValue === 0 ? "auto" : String(sliderValue + 1);
  formData.append("colorCount", colorCount);

  try {
    // Faz a requisição POST para o backend
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
      // Não definimos Content-Type — o fetch define automaticamente com o boundary do FormData
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Erro desconhecido");
    }

    // Armazena o SVG retornado
    currentSVG = data.svg;

    // Insere o SVG no painel de resultado
    previewResult.innerHTML = currentSVG;

    // Muda para o estado de resultado
    showState("result");
  } catch (error) {
    console.error("Erro:", error);
    alert("Erro ao processar a imagem: " + error.message);
    showState("drop"); // volta para a drop zone
  }
}

// ═══════════════════════════════════════════
// CONTROLE DE ESTADOS DA INTERFACE
// ═══════════════════════════════════════════

// Mostra apenas o estado solicitado, esconde os outros
function showState(state) {
  dropZone.classList.add("hidden");
  processingState.classList.add("hidden");
  resultState.classList.add("hidden");

  if (state === "drop") dropZone.classList.remove("hidden");
  if (state === "processing") processingState.classList.remove("hidden");
  if (state === "result") resultState.classList.remove("hidden");
}

// Botão "Nova imagem" — reseta tudo
function resetApp() {
  currentSVG = null;
  previewOriginal.src = "";
  previewResult.innerHTML = "";
  fileInput.value = ""; // limpa o input de arquivo
  showState("drop");
  // Reseta o slider para automático
  colorSlider.value = 0;
  colorCountDisplay.textContent = "Automático";
}

// ═══════════════════════════════════════════
// EXPORTAÇÃO
// ═══════════════════════════════════════════

function exportFile(format) {
  if (!currentSVG) return;

  if (format === "svg") {
    // SVG: cria um blob e faz download direto
    const blob = new Blob([currentSVG], { type: "image/svg+xml" });
    downloadBlob(blob, "veclean-output.svg");
  } else {
    // Para outros formatos (EPS, PDF, WEBP), vamos enviar ao backend
    // Essa funcionalidade será implementada na próxima fase
    alert(`Exportação em ${format.toUpperCase()} será implementada em breve!`);
  }
}

// Função auxiliar que cria um link temporário e dispara o download
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // libera a memória
}

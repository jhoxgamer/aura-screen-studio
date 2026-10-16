# Loom Desktop Clone (v1.0.0)

> **Clone completo do aplicativo Loom Desktop**, reconstruído em **Electron + React 19 + TypeScript + Vite + TailwindCSS**, com todas as funcionalidades e sons autênticos do Loom.

---

## 🚀 Funcionalidades Implementadas (1:1 com o Loom)

### 1. Modos de Gravação Flexíveis
- **Tela + Câmera (Screen + Cam):** Gravação de tela combinada com a bolha flutuante circular da webcam.
- **Somente Tela (Screen Only):** Grava a área de trabalho ou qualquer janela aberta com áudio.
- **Somente Câmera (Cam Only):** Grava a webcam em alta resolução.

### 2. Bolha Flutuante de Câmera (Camera Bubble)
- Janela flutuante circular transparente que permanece sempre no topo (*Always-on-Top*).
- **Redimensionável em tempo real:**
  - **P (Pequena):** 170x170px
  - **M (Média):** 250x250px
  - **G (Grande):** 340x340px
  - **Tela Cheia:** Expansão imediata
- **Arrastável:** O usuário pode mover a bolha para qualquer canto ou monitor.
- **Espelhamento (Mirror):** Inverter imagem horizontalmente.
- **Estilos de Moldura:** Borda padrão, brilho suave, coral ativo e gradiente.
- **Avatar Mode:** Exibe avatar elegante com indicação de voz quando a câmera for desligada.

### 3. Barra Flutuante de Controle (Control Bar)
- Barra de controle flutuante compacta e discreta.
- **Botão Parar Gravação:** Exibe cronômetro em tempo real (`00:15`) e botão de parada instantânea.
- **Pausar / Retomar:** Pausa e continua sem perder sincronia de áudio/vídeo.
- **Reiniciar (Restart):** Reinicia a gravação descartando a tentativa atual.
- **Descartar (Trash):** Cancela e exclui a gravação atual.
- **Anotar (Caneta / Draw):** Ativa a tela de desenho interativo.

### 4. Tela de Desenho e Anotação em Tempo Real (Canvas Drawing)
- **Tinta Mágica (*Vanishing Ink*):** Traços desenhados na tela somem automaticamente após 3 segundos (recurso característico das apresentações do Loom).
- **Ferramentas:** Caneta livre, marca-texto translúcido e borracha.
- **Paleta de Cores Loom:** Coral, Roxo, Verde, Amarelo, Azul e Branco.
- **Espessuras de Traço:** 2px, 5px e 10px.

### 5. Áudio e Mixer Multicanal
- Captura de **Microfone** com medidor **VU Meter** dinâmico e responsivo no painel de controle.
- Captura de **Áudio do Sistema (Loopback)** para gravar sons do Windows, reuniões e vídeos tocados no computador.
- Mixer Web Audio com cancelamento de eco e supressão de ruído.

### 6. Efeitos Sonoros Autênticos do Loom
- Utiliza os sons originais extraídos do pacote do aplicativo:
  - `loom_start.mp3` ao iniciar
  - `loom_pause.mp3` ao pausar
  - `loom_complete.mp3` ao finalizar
  - `start-recording.mp3` na contagem regressiva
  - `end-recording.mp3` ao parar
  - `airhorn.mp3` & `screenshot-camera-shutter.mp3`

### 7. Contagem Regressiva 3... 2... 1...
- Animação de contagem regressiva centralizada com efeito de pulso, onda sonora e transição suave para o início da gravação.

### 8. Estúdio de Revisão e Player Pós-Gravação (Preview Studio)
- Abre automaticamente após a conclusão com efeito de confetes (*Confetti*).
- Player com barra de progresso ajustável, controle de volume, fullscreen e seletor de velocidade (`1x`, `1.25x`, `1.5x`, `2x`).
- **Ferramenta de Trimming / Corte:** Define ponto de início e fim do vídeo.
- **Abrir Pasta:** Revela o arquivo `.webm` salvo diretamente no Windows Explorer.
- **Copiar Caminho:** Copia o caminho completo do vídeo para a área de transferência.

### 9. Biblioteca Local de Vídeos (Library)
- Histórico completo de todas as gravações salvas em `Vídeos\LoomCloneRecordings`.
- Miniatura, título, duração, tamanho em MB, resolução e data/hora.
- Ações para abrir e excluir gravações.

### 10. Atalhos Globais de Teclado
- **Iniciar / Parar Gravação:** `Alt + Shift + L` (ou `Ctrl + Shift + L`)
- **Pausar / Retomar Gravação:** `Alt + Shift + P` (ou `Ctrl + Shift + P`)

---

## 🛠️ Como Executar

### Pré-requisitos
- Node.js instalado (v18+)

### Iniciar o Aplicativo
No diretório `D:\clone\2`:
```powershell
npm start
```

### Desenvolvimento com Hot-Reload (Opcional)
```powershell
# Terminal 1: Iniciar Vite
npm run dev

# Terminal 2: Iniciar Electron
$env:VITE_DEV_SERVER_URL="http://localhost:5174"
npm start
```

### Recompilar
```powershell
npm run build:electron
npm run build
```

---

## 📁 Estrutura do Projeto
```
D:\clone\2\
├── electron/
│   ├── main.ts         # Orquestrador de janelas, atalhos, capturas e IPC
│   ├── preload.ts      # Bridge seguro de APIs (contextBridge)
│   └── types.ts        # Tipagem forte compartilhada
├── src/
│   ├── components/     # Componentes reutilizáveis
│   ├── services/
│   │   ├── audioService.ts     # Gerenciamento dos efeitos sonoros Loom
│   │   └── recorderService.ts  # Motor de gravação MediaRecorder e Web Audio
│   ├── types/          # Tipos e extensões globais
│   ├── views/
│   │   ├── PreRecordingView.tsx # Painel inicial de configuração e launcher
│   │   ├── CameraBubbleView.tsx # Bolha flutuante circular da webcam
│   │   ├── ControlBarView.tsx   # Barra flutuante de controle da gravação
│   │   ├── DrawingOverlayView.tsx # Tela de anotação/desenho com tinta mágica
│   │   ├── CountdownView.tsx    # Contagem regressiva 3... 2... 1...
│   │   ├── PreviewView.tsx      # Player pós-gravação com corte e exportação
│   │   └── LibraryView.tsx      # Biblioteca de vídeos gravados
│   ├── App.tsx         # Roteador de janelas por query parameter
│   ├── main.tsx        # Ponto de entrada React
│   └── index.css       # Estilos Tailwind e customizações
├── public/
│   └── assets/
│       ├── sounds/     # Sons autênticos extraídos do Loom
│       ├── application-icons/ # Ícones de bandeja e janelas
│       └── img/        # Assets gráficos
├── dist/               # Build compilado do React
├── dist-electron/      # Build compilado do Electron
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

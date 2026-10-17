# Aura Screen Studio v2.4.1 — Anti-Cutoff Layout Overhaul, Sticky Studio Actions & Responsive Window Hierarchy

Bem-vindo ao **Aura Screen Studio v2.4.1**! Esta versão soluciona de forma definitiva o problema de corte visual da tela inicial e de outros componentes do aplicativo, garantindo que o botão principal de gravação, controles flutuantes e ferramentas de estúdio estejam sempre 100% visíveis e acessíveis em monitores de qualquer resolução (desde 720p/768p até 4K).

---

## 🎯 Correções Críticas e Otimizações de Layout

### 1. Barra Inferior Fixa (Sticky Action Footer) na Tela Inicial
- **Visibilidade Absoluta:** O botão principal **`INICIAR GRAVAÇÃO`**, o botão **`COMPARTILHAR TELA AO VIVO (60 FPS)`**, os atalhos de teclado e o status de versão foram movidos para um rodapé fixo (`sticky footer`) na base da janela.
- **Zero Truncamento:** O usuário nunca mais precisará rolar para encontrar a ação principal de gravar. Mesmo com configurações avançadas abertas ou em telas pequenas, o botão está sempre à vista e a um clique de distância.
- **Corpo Central com Rolagem Fluida:** Toda a área de opções (Modo, Fonte, Câmera, Áudio, Preferências) agora rola de forma isolada e suave, equipada com uma barra de rolagem estilizada no padrão Nocturne Blue.

### 2. Dimensionamento Inteligente e Redimensionamento da Janela Principal
- **Janela Redimensionável (`resizable: true`):** A janela principal do launcher agora é livremente ajustável pelo usuário (`minWidth: 440`, `minHeight: 560`, `maxWidth: 620`, `maxHeight: 1000`).
- **Altura Dinâmica e Centralização Segura:** A janela ajusta sua altura proporcionalmente à área de trabalho (`workAreaSize`) e se centraliza verticalmente, evitando qualquer colisão ou sobreposição com a barra de tarefas do Windows.

### 3. Reorganização das Preferências de Gravação & Saída
- **Grid Compacto e Elegante:** A seção de preferências foi condensada em um layout inteligente de duas linhas:
  - Linha 1: Seletores de Qualidade (Resolução 1080p/720p/4K) + FPS (60/30) + Contagem Regressiva (0s/3s/5s).
  - Linha 2: Chaves rápidas de Som do Sistema, Destacar Cursor e Teleprompter.
- **Economia de mais de 100px verticais**, permitindo que quase todo o conteúdo caiba sem necessidade de rolagem em telas convencionais.

### 4. Correção da Barra Flutuante de Gravação (`ControlBarView`)
- **Largura Expandida para 600px:** Acomoda com folga todos os 10 controles e ferramentas (incluindo o alternador de Câmera adicionado na v2.4.0 e os botões "Regravar" e "Nova Cena" quando pausado).
- **Sem Quebra ou Corte de Botões:** `shrink-0` e alinhamento horizontal perfeitamente centralizado na tela.

### 5. Correção da Barra Flutuante de Transmissão ao Vivo (`ZoomShareBarView`)
- **Largura Adaptativa até 990px:** Permite que o badge de 60 FPS, contadores de público, botões de anotação, QR Code e parada caibam simultaneamente sem estourar as margens.

### 6. Controles da Bolha de Câmera (`CameraBubbleView`)
- **Escala Proporcional no Tamanho Pequeno (P):** O menu de ferramentas suspenso agora adapta seu espaçamento e tamanho de botões quando a bolha está em modo compacto, eliminando o corte lateral dos botões.
- **Dimensões Calibradas:** Pequeno (190px), Médio (260px) e Grande (350px).

### 7. Teleprompter & Notas (`SpeakerNotesView`)
- **Proteção de Largura Mínima (380px):** O cabeçalho com título, métricas de WPM, presets de tamanho (P/M/G) e transparência agora utiliza layout flexível sem corte.

### 8. Player & Estúdio de Vídeo (`PreviewView`)
- **Contenção Vertical do Player (`max-h-[50vh]`):** O player de vídeo não empurra mais a timeline com waveform real e os controles de corte para fora da tela em monitores menores.

---

## 📦 Artefatos Oficiais de Instalação e Atualização

- `Aura-Screen-Studio-Setup-2.4.1.exe` (Instalador Completo NSIS x64)
- `Aura-Screen-Studio-Setup-2.4.1.exe.blockmap` (Suporte a atualização rápida incremental)
- `latest.yml` (Metadados de autoupdate para o `electron-updater`)

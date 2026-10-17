# Aura Screen Studio v2.5.0 — Canvas Studio, Screen Studio Window Framing, Cinematic Smooth Zoom & Descript Voice Engine

Bem-vindo ao **Aura Screen Studio v2.5.0**! Esta versão eleva o produto para o mais alto padrão da indústria internacional (competindo diretamente com Screen Studio para macOS, CleanShot X, Loom e Descript), transformando gravações de tela simples em vídeos profissionais de apresentação cinematográfica prontos para publicação global.

---

## 🚀 Principais Novidades da Versão 2.5.0

### 1. 🎨 Estúdio de Moldura e Canvas Presentation (Estilo Screen Studio)
- **Aba dedicada "Moldura & Canvas Studio"**: Acesse diretamente no player Studio para envelopar qualquer gravação de tela em molduras elegantes.
- **6 Wallpapers de Estúdio Exclusivos**:
  - `Nocturne Obsidian`: Gradiente assinatura Aura em tons índigo e obsidiana profunda.
  - `Sunset Aura`: Tons quentes de carmesim e crepúsculo cinematográfico.
  - `Neon Cyberpunk`: Roxo elétrico e azul meia-noite de alta energia.
  - `Emerald Forest`: Verde esmeralda escuro sofisticado ideal para tutoriais e código.
  - `Frosted Glass`: Acabamento de vidro jateado moderno no padrão Apple HIG.
  - `Preto Puro (Flat)`: Fundo neutro limpo sem bordas externas.
- **Barra de Janela macOS Autêntica**:
  - Botões traffic lights estilo macOS (🔴 🟡 🟢).
  - Título centralizado do vídeo e badge com resolução nativa.
  - Alternância rápida visível/oculta com um clique.
- **Formatação de Proporção Multi-Plataforma**:
  - `16:9 Widescreen`: Padrão para YouTube, Loom, Loom SDK e apresentações corporativas.
  - `9:16 Vertical`: Otimizado para Shorts, Instagram Reels e TikTok.
  - `1:1 Quadrado`: Formato perfeito para feeds do LinkedIn, Twitter/X e redes sociais.
  - `4:3 Pitch Deck`: Ideal para apresentações clássicas de produto e slides.
- **Controles de Profundidade e Sombra**:
  - 4 perfis de elevação: Nenhuma, Sutil 2D, 3D Studio e Aura Glow dinâmico.
  - Inset padding ajustável (0%, 8%, 12%, 20%).
  - Arredondamento de bordas customizável (0px, 12px, 16px, 24px).

---

### 2. 🔍 Motor de Zoom Cinematográfico & Pan Suave (Cubic-Bezier)
- **4 Níveis Progressivos de Zoom**: `1.0x` (visão completa), `1.4x` (ênfase sutil), `1.8x` (foco em detalhes) e `2.2x` (zoom macro).
- **5 Quadrantes de Foco (Pan Grid)**:
  - Top-Left (TL), Top-Right (TR), Centro, Bottom-Left (BL), Bottom-Right (BR).
- **Curva de Movimento Fluida**: Transições aceleradas via curva cubic-bezier `(0.2, 0.8, 0.2, 1)`, garantindo movimento fluido e sem solavancos.
- **Atalho Express Tecla Z**: Pressione `Z` para ciclar instantaneamente entre os níveis de zoom.

---

### 3. 🎙️ Motor de Áudio "Voz de Estúdio" (Estilo Descript Studio Sound)
- **Cadeia DSP de Alta Fidelidade em Tempo Real**:
  - **Filtro de Presença Vocal**: Boost de `+3.5 dB` com pico em `3.2 kHz` (Q=1.2) para clareza e inteligibilidade máxima da fala.
  - **De-Esser Inteligente**: Atenuação seletiva de `-3.0 dB` em `6.8 kHz` (Q=1.5) para eliminar sibilâncias incômodas (sons de "s" e "ch").
  - **Calor Acústico (Warmth)**: Highpass suave em `90 Hz` para corte de ruídos de mesa mantendo o corpo da voz.
  - **Limitador Brickwall de Estúdio**: Compressor transparente com threshold de `-2.5 dB` e ratio 16:1.
- **Controle Rápido no Player**: Botão com indicador de ondas pulsantes ativas e atalho global `Ctrl+E`.

---

### 4. 📸 Captura Instantânea de Frame PNG & Mockup Screen Studio
- **Exportação Inteligente com 1 Clique**:
  - Na aba **Assistir & Capítulos**: captura o frame puro do vídeo em resolução nativa (`1080p`, `4K`).
  - Na aba **Moldura & Canvas Studio**: gera e renderiza o mockup completo com o wallpaper de estúdio selecionado, sombra 3D, bordas arredondadas e cabeçalho macOS com traffic lights (🔴 🟡 🟢).
- **Cópia Automática para o Clipboard**: Pronto para colar diretamente no Slack, GitHub Pull Requests, WhatsApp ou Figma com feedback de confetes.
- **Atalho Rápido Tecla P**: Pressione `P` a qualquer momento para capturar o frame.

---

### 5. ⌨️ Modal Interativo de Atalhos de Teclado (Cheat-Sheet)
- **Acesso Rápido Tecla `?` ou Botão na Barra Superior**:
  - Modal suspenso moderno com todos os atalhos organizados por categoria: Reprodução & Linha do Tempo, Estúdio de Corte, Canvas & Zoom Cinematográfico e Compartilhamento.
  - Fechamento instantâneo via tecla `Esc`.

---

## 🛠️ Verificação e Confiabilidade
- **129 testes unitários e de integração** executados e aprovados com 100% de sucesso.
- **4 baterias completas de testes automatizados de QA** validadas em processos reais do Electron.
- Compatibilidade total com o mecanismo de auto-atualização silencioso (`latest.yml`).

---

## 📦 Arquivos da Release
- `Aura-Screen-Studio-Setup-2.5.0.exe` (Instalador NSIS x64 Completo)
- `Aura-Screen-Studio-Setup-2.5.0.exe.blockmap` (Atualizações delta rápidas)
- `latest.yml` (Manifesto assinado para o Electron-Updater)

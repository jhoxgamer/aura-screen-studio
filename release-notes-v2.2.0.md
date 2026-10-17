# Aura Screen Studio v2.2.0 — Midnight Signal Design System & 60 FPS Ultra-HD Live Sharing

Bem-vindo ao **Aura Screen Studio v2.2.0**! Esta versão traz uma reformulação visual completa e de alto nível com o sistema de design **Midnight Signal**, streaming de tela ao vivo a **60 FPS** com qualidade ultra-alta, padronização rigorosa da identidade de marca e novo conjunto de ícones oficiais.

---

### 🎨 Sistema de Design "Midnight Signal"
- **Tokens de Design Centralizados:** Paleta Midnight Signal aplicada de forma consistente em todo o aplicativo através do Tailwind CSS e variáveis CSS (`#0B1117`, `#111A22`, `#18242E`, `#202E39`, `#31414D`, Signal Mint `#3AD6C6`, Hover `#65E6D8`, Coral `#FF5F6D`, Amber `#FFBD66`, Green `#4CD6A0`).
- **Contraste & Acessibilidade:** Conformidade estrita com padrões WCAG 2.2 AA (mínimo de 4.5:1 para texto normal e 3:1 para elementos de destaque).
- **Refinamento Geral de Todas as Telas:**
  - **Launcher / Pré-Gravação:** Interface de estúdio sóbria, hierarquia tipográfica clara, botões de ação com feedback vibrante em Signal Mint.
  - **Barra de Controle Flutuante (HUD):** Layout elegante com badges de status, contadores de cena e cronômetro de alta precisão.
  - **Bolha de Câmera (Webcam):** Anel de pulso áudio-reativo em Signal Mint, controles flutuantes polidos e modo avatar escuro.
  - **Overlay de Desenho & Anotações:** Doca retrátil "Anotações Aura Studio", paleta de 6 cores Midnight Signal e atalhos numéricos 1-6.
  - **Player Studio (Preview):** Timeline avançada, botões de exportação, corte e transcrição com novos contrastes Midnight.
  - **Biblioteca de Gravações:** Cards de vídeo com badges modernos, busca em tempo real e ações de compartilhamento com feedback tátil.
  - **Screenshot Studio & Seletor de Corte:** Controles de corte com presets 16:9, 4:3, 1:1, 9:16 e nudging por setas.
  - **Teleprompter / Speaker Notes:** Janela translúcida com indicador de linha de visão Signal Mint e controle de rolagem por velocidade.

---

### ⚡ Transmissão de Tela ao Vivo a 60 FPS & 1080p
- **Suporte Nativo a 60 FPS:** Motor de captura atualizado com taxa de quadros máxima de 60 quadros por segundo e intervalo de frame de ~16.6ms para movimento ultra-fluido.
- **Resolução 1080p Nativa:** Escalonamento automático de captura até 1920x1080 com compressão de alta fidelidade (0.88 quality).
- **Alternador de Taxa de Quadros (60 FPS / 30 FPS):** Botão na barra flutuante da live para alternar instantaneamente entre modo 60 FPS Ultra-Fluido e 30 FPS Econômico com base na conexão.
- **Medidor de FPS em Tempo Real:** Monitor de frames por segundo em tempo real integrado na barra de transmissão.
- **Borda de Transmissão Neon:** Moldura iluminada em Signal Mint com efeito neon e indicador de pausa em tom Amber.
- **Visualizador Web & Dashboard:** Interface pública do espectador modernizada com chat, perguntas ao vivo e reações de emojis instantâneas.

---

### 🏷️ Identidade de Marca & Novo Ícone Oficial
- **Padronização do Nome:** Unificação em **Aura Screen Studio** em todos os títulos de janelas, tooltips, cabeçalhos, rodapés e instalador. Remoção de referências externas herdadas.
- **Novo Ícone de Estúdio:** Novo design vetorial moderno combinando o enquadramento de estúdio em Signal Mint (`#3AD6C6`) com o núcleo de gravação Coral (`#FF5F6D`).
- **Geração Multi-Formato:** Ícones atualizados para instalador Windows NSIS, bandeja do sistema (tray), atalho da área de trabalho e barra de tarefas.

---

### 🧪 Qualidade & Verificação (QA)
- **115 Testes Unitários e de Integração:** 100% de aprovação em todos os módulos e formatters.
- **4 Etapas de QA Automatizado com Electron Real:**
  1. Compilação TypeScript e bundle Vite de produção.
  2. Testes de interface e IPC em janelas reais do Electron (13 de 13 testes passaram).
  3. Nós físicos do Web Audio DSP (Gain 1.6x, Highpass 160Hz, Notch 3500Hz, Limiter -2.5dB).
  4. Persistência de configurações entre múltiplos processos do sistema operacional (PIDs independentes).

---

### 📦 Artefatos da Release
- `Aura-Screen-Studio-Setup-2.2.0.exe` (Instalador Completo NSIS x64)
- `Aura-Screen-Studio-Setup-2.2.0.exe.blockmap` (Blockmap para atualização incremental)
- `latest.yml` (Manifesto oficial para o auto-atualizador do aplicativo)

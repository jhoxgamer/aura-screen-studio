# Aura Screen Studio v2.3.0 — Nocturne Blue Design System & Precision Video Trimming Studio

Bem-vindo ao **Aura Screen Studio v2.3.0**! Esta atualização resolve definitivamente o fluxo e a lógica da tela de corte de vídeo, introduz o novo sistema de design profissional **Nocturne Blue** (eliminando tons verdes e cianos), traz o novo ícone oficial de estúdio e aprimora a responsividade da barra flutuante de transmissão ao vivo.

---

### ✂️ Solução Definitiva do Bug da Tela de Corte (Video Trimming)
- **Corte Frame-Accurate de Alta Precisão (FFmpeg):** O corte agora é executado diretamente no processo principal do Electron com FFmpeg (`-ss [início] -to [fim] -c copy`), proporcionando processamento sem perdas (lossless) em frações de segundo (~0.02s) e eliminando qualquer risco de perda de sincronia entre áudio e vídeo.
- **Fallback com Preservação de Áudio:** Caso o FFmpeg não esteja disponível, o fallback em navegador agora garante que o canal de áudio seja capturado desmutado, prevenindo que gravações salvas percam a faixa sonora.
- **Cancelamento Instantâneo & Recuperação de Estado:** Adicionado botão "Cancelar Corte" durante o processamento com cancelamento imediato de timers e watchdogs, restaurando o player de vídeo sem travamentos ou estados corrompidos.
- **Barra de Progresso em Tempo Real:** Feedback visual com porcentagem de conclusão e indicador dinâmico de status.
- **Timeline e Scrubbing Aperfeiçoados:** O looping do trecho ("Loop Trecho Ativo") não interfere mais na busca livre de pontos de corte pela timeline quando o vídeo está pausado.
- **Atalhos e Marcação Rápida:** Botões "Cursor (I)" e "Cursor (O)" para definir pontos com precisão no segundo atual, e botão "Resetar" para restaurar a seleção total do vídeo.
- **Recarregamento Instantâneo:** Ao finalizar o corte, a timeline e o player de vídeo são recarregados imediatamente com o arquivo atualizado.

---

### 🎨 Sistema de Design "Nocturne Blue"
- **Remoção Completa de Tons Verdes e Cianos:** Toda a interface agora adota a estética sóbria e refinada do Nocturne Blue:
  - Fundo principal: `#0B0E14`
  - Superfície principal: `#121722`
  - Painel elevado: `#191F2B`
  - Superfície de hover: `#222B39`
  - Bordas e divisores: `#303A4B`
  - Texto principal: `#F3F5F9`
  - Texto secundário: `#B7C0CE`
  - Texto de apoio: `#929CAF`
  - Azul principal: `#78A5FF`
  - Hover do azul: `#9AB9FF`
  - Texto sobre azul: `#101A32`
  - Fundo de seleção: `#1A2A47`
  - Aviso (âmbar): `#F2B66D`
  - Sucesso (azul claro): `#83B8FF`
  - Gravação e erro (coral): `#FF647C`
  - Ação destrutiva: `#B83A48`
- **Revisão Visual em Todas as Telas:** Launcher (`PreRecordingView`), Barra de Controle (`ControlBarView`), Bolha de Webcam (`CameraBubbleView`), Anotações (`DrawingOverlayView`), Player Studio (`PreviewView`), Biblioteca (`LibraryView`), Screenshot Studio, Seletor de Corte e Visualizador Web de Transmissão.

---

### 🎯 Redesenho do Ícone Oficial de Estúdio
- **Design Minimalista e Elegante:** Novo símbolo geométrico combinando a moldura de estúdio em Nocturne Blue (`#78A5FF`) com o ponto focal de gravação em Coral (`#FF647C`) sobre base grafite escuro (`#0B0E14`).
- **Alta Legibilidade em Escalas Pequenas:** Sem gradientes pesados ou detalhes minúsculos, perfeito para a barra de tarefas do Windows e a bandeja do sistema (tray).
- **Formatos Atualizados:** `app-logo.ico` (executável e instalador NSIS), `app-icon-tray.ico` (bandeja do sistema), `app-logo.png`, `aura-logo-512.png`, `aura-logo-256.png` e `favicon.ico`.

---

### ⚡ Correção na Barra Flutuante de Compartilhamento ao Vivo
- **Eliminação de Quebras de Linha e Elementos Apertados:** Aplicado `shrink-0 whitespace-nowrap` no badge de taxa de quadros e botões, corrigindo o problema visual em que `60 FPS` e `(real)` quebravam em linhas separadas.
- **Largura Adaptada:** Janela flutuante no Electron redimensionada para 860px para acomodar todos os controles confortavelmente.
- **Moldura Neon Nocturne Blue:** Borda luminosa de transmissão ao vivo atualizada para `#78A5FF`.

---

### 🧪 Garantia de Qualidade (QA)
- **117 Testes Unitários e de Integração:** 100% aprovados (`npm test`).
- **4 Etapas de QA Automatizado com Electron Real (`npm run test:qa`):**
  1. Build de produção TypeScript e Vite.
  2. UI Runner com 13 testes em janelas reais (preferências, biblioteca, atalhos, gravação).
  3. Nós Web Audio DSP físicos (Gain 1.6x, Highpass 160Hz, Notch 3500Hz, Limiter -2.5dB).
  4. Persistência de dados entre múltiplos PIDs do sistema operacional.
- **Teste de Corte Real com FFmpeg & FFprobe:** Validado corte em arquivo WebM com verificação de codecs VP9 e Opus preservados.

---

### 📦 Artefatos da Release
- `Aura-Screen-Studio-Setup-2.3.0.exe` (Instalador Completo NSIS x64)
- `Aura-Screen-Studio-Setup-2.3.0.exe.blockmap` (Blockmap para atualização incremental)
- `latest.yml` (Manifesto oficial com SHA-512 para detecção pelo atualizador do app)

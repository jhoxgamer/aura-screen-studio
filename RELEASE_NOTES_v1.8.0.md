# Aura Screen Studio v1.8.0 — Precision Crop Nudge, Teleprompter Pro & Countdown Abort Guard

A versão **1.8.0** é um marco de evolução para o **Aura Screen Studio**, trazendo ajustes finos milimétricos no seletor de área, agilidade fluida no teleprompter e proteção instantânea na contagem regressiva:

---

### 📐 1. Ajuste Fino por Setas e Atalhos de Proporção no Crop Selector
- **Navegação Cirúrgica por Setas (`↑`, `↓`, `←`, `→`):** Nivele o enquadramento de captura pixel por pixel. Pressionar as setas desloca o retângulo de seleção em 2px, ou 10px segurando `Shift`, sem necessidade de tentar posicionar bordas usando apenas o mouse.
- **Atalhos Rápidos de Proporção (`1` a `5`):**
  - `1`: Proporção Livre
  - `2`: Widescreen 16:9
  - `3`: Vertical 9:16 (Shorts / TikTok / Reels)
  - `4`: Quadrado 1:1
  - `5`: Formato Clássico 4:3
- **Novo Botão 4:3:** Adicionado botão dedicado para telas clássicas e monitores auxiliares.

---

### 📜 2. Teleprompter & Checklist Ágil para Criadores
- **Alternância de Modos por Atalhos (`1`, `2`, `3`):** Alterne diretamente entre a visualização do Teleprompter (`1`), Tópicos & Checklist (`2`) e Editor de Roteiro (`3`).
- **Avanço Inteligente de Tópicos (`Espaço` ou `Enter`):** No modo de tópicos, o apresentador pode pressionar a barra de espaço ou Enter para marcar automaticamente o próximo item da lista como concluído, permitindo avançar sua pauta sem desviar a atenção da câmera.

---

### ⏱️ 3. Guarda de Aborto Imediato na Contagem Regressiva (`ESC` para Cancelar)
- **Cancelamento Instantâneo:** Ao iniciar a gravação, se o apresentador notar que o microfone ou a webcam não estão no enquadramento ideal durante os 3s ou 5s de contagem regressiva, basta pressionar `ESC` para abortar imediatamente.
- **Pílula Visual de Orientação:** Exibe distintamente o indicador `[ESC] Cancelar` logo abaixo do anel de contagem regressiva.

---

### 🧪 4. Validação & QA Completo (100% de Sucesso)
- **92 Testes Unitários e de Integração:** Todos aprovados (`npm test`).
- **QA Automatizado em 4 Etapas (`npm run test:qa`):** Cobertura completa de DSP Web Audio, nós de áudio físicos, streaming com seeking HTTP, persistência cross-process no Windows e fluxos de UI.
- **Auto-Updater Pronto:** Metadados `latest.yml` e mapa de blocos `.blockmap` gerados para download e atualização transparente.

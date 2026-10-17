# Aura Screen Studio v1.7.8 — Drawing Undo, Bubble Shortcuts & Studio Polish

A versão **1.7.8** do **Aura Screen Studio** traz três grandes melhorias funcionais centradas na experiência ao vivo do apresentador, agilidade na edição e gerenciamento de arquivos na biblioteca:

---

### 🎨 1. Sistema Completo de Desfazer Desenhos (Drawing Undo Engine)
- **Atalhos Instantâneos (`Ctrl+Z`, `Cmd+Z`, `U`):** Agora você pode desfazer o último traço ou anotação sem precisar limpar todo o quadro ou perder anotações anteriores.
- **Botão Dedicado no Dock:** Novo botão "Desfazer Último Traço" adicionado à barra de ferramentas flutuante de anotações.
- **Restauração de Numeração dos Badges (Stamp Tool):** Ao desfazer uma anotação de carimbo numerado `(1)`, `(2)`, `(3)...`, o contador interno de passos retrocede automaticamente para o número anterior correto.
- **Feedback Visual HUD:** Notificação instantânea informando que o traço foi desfeito com sucesso.

---

### 🎙️ 2. Atalhos Express & HUD Interativo na Bolha de Câmera
- **Atalhos Numéricos Diretos (`1`, `2`, `3`):** Alterne o tamanho da bolha de câmera instantaneamente sem tirar as mãos do teclado (`1` = Pequeno, `2` = Médio, `3` = Grande).
- **Atalhos Rápidos de Produção:**
  - `M`: Inverte / espelha a câmera horizontalmente.
  - `S`: Alterna o formato físico entre Círculo e Squircle moderno.
  - `F`: Percorre os filtros e iluminação de estúdio (*Natural*, *Bokeh Blur*, *Studio Light*, *Vibrante*).
  - `V`: Alterna entre câmera ativa e modo avatar com anel reativo à voz.
- **HUD Toasts Flutuantes:** A bolha exibe confirmação visual de 1.8 segundos com o novo estado configurado ao usar os atalhos.
- **Tooltips Informativos:** Todos os botões do dock inferior agora exibem claramente a tecla de atalho correspondente.

---

### 📂 3. Cópia Direta de Caminho de Arquivo e Contador Dinâmico na Biblioteca
- **Botão "Copiar Caminho do Arquivo":** Copie o caminho absoluto no disco (`C:\Users\...\Videos\...webm`) com apenas 1 clique para colar direto no Premiere Pro, DaVinci Resolve, Slack ou Discord.
- **Contador Dinâmico de Filtro:** A barra superior da Biblioteca agora detalha o número exato de vídeos filtrados pela busca (ex: `2 de 15 vídeos`) mantendo o total de espaço ocupado em disco visível.

---

### 🧪 4. Cobertura de Testes & Engenharia de Qualidade (QA 100%)
- **86 Testes Unitários e de Integração:** Todos aprovados com 100% de sucesso.
- **QA de 4 Etapas Automatizadas:** Validação física de DSP de áudio (Gain, Highpass, Notch, Limiter brickwall anti-clipping), IPC multijanela, persistência cross-process no Windows e ciclo de gravação/retake.
- **Distribuição e Auto-Updater:** Instalador empacotado para Windows x64 com suporte total ao canal de atualizações automáticas via `latest.yml`.

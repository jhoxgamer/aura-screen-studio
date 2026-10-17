# Aura Screen Studio v1.7.9 — Discard Guard, Studio Precision Scrubbing & Screenshot Hotkeys

A versão **1.7.9** do **Aura Screen Studio** traz um novo conjunto robusto de proteções contra perda de dados, controles profissionais de edição/corte e agilidade com atalhos no estúdio de anotações:

---

### 🛡️ 1. Proteção de Descarte em 2 Etapas na Barra Flutuante (Discard Safety Guard)
- **Prevenção Ativa Contra Perda de Gravações Longas:** Clicar no botão da lixeira durante uma gravação em andamento não descarta mais o vídeo imediatamente.
- **Confirmação Visual Inteligente:** O ícone passa a pulsar em vermelho com o texto *"Clique no lixo novamente para confirmar o descarte"*.
- **Auto-Cancelamento de Segurança:** Se o segundo clique não for efetuado em 3.5 segundos, o estado de confirmação é desarmado automaticamente, preservando o vídeo intacto.

---

### 🎬 2. Controles Profissionais de Edição no Studio Preview (In/Out, Scrubbing por Quadro & Volume)
- **Marcação Instantânea de Início e Fim (`I` e `O`):** Use as teclas padrão da indústria cinematográfica `I` (Mark In) e `O` (Mark Out) para definir os pontos de corte no segundo exato em que a agulha de reprodução está posicionada, com feedback em toast.
- **Navegação Quadro a Quadro (`.` e `,`):** Avance (`.`) ou retroceda (`,`) exatamente 1 quadro (+/- 1/30s) com o player pausado para alinhar cortes e capítulos com precisão cirúrgica.
- **Ajuste de Volume com as Setas (`↑` e `↓`):** Ajuste o volume em incrementos de 10% diretamente pelo teclado sem tirar o foco do vídeo.
- **Cópia Rápida de Caminho no Disco:** Novo botão na barra superior do Preview para copiar o caminho absoluto do arquivo (`C:\...webm`).

---

### 📸 3. Atalhos Express & Rollback do Contador no Screenshot Studio
- **Atalhos de Tecla Única:** Alterne ferramentas de captura instantaneamente:
  - `C`: Recorte de área (Crop)
  - `A`: Seta direcional (Arrow)
  - `R`: Retângulo de destaque (Box)
  - `S`: Passos numerados `(1)`, `(2)`, `(3)...`
  - `P`: Caneta livre (Pen)
  - `B`: Tarja de confidencialidade (Blur / Redact)
  - `T`: Inserção de texto
- **Desfazer com Rollback de Passos:** Ao desfazer (`Ctrl+Z` ou `U`) uma etapa numerada, o contador automático de passos é decrementado, mantendo a sequência de etapas consistente.

---

### 🧪 4. Validação & QA Completo (100% de Sucesso)
- **89 Testes Unitários e de Integração:** Todos aprovados (`npm test`).
- **QA Completo em 4 Etapas (`npm run test:qa`):** Verificação física de nós Web Audio (Gain, Highpass, Notch, Limiter brickwall anti-clipping), streaming HTTP com seeking, persistência Windows cross-process e controles multijanela.
- **Compatibilidade do Auto-Updater:** Instalador empacotado para Windows x64 com suporte total ao canal de atualizações automáticas via `latest.yml`.

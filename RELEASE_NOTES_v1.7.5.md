# Aura Screen Studio v1.7.5 🚀

Esta versão traz refinamentos fundamentais de usabilidade para a Biblioteca e o Editor de Gravações, tornando o fluxo de gravação, organização e exportação ainda mais ágil e intuitivo.

---

### ✨ Novidades e Melhorias

1. **Renomeação Rápida na Biblioteca (Inline Title Editing)**:
   - Renomeie suas gravações diretamente na lista da Biblioteca sem precisar abrir o player Studio.
   - Clique no ícone de lápis que surge ao passar o mouse sobre o título do vídeo para editar.
   - Confirmação com `Enter` ou botão de salvar, cancelamento rápido com `Esc`.
   - Persistência imediata via IPC no arquivo de metadados.

2. **Timestamps Relativos Inteligentes nas Gravações**:
   - Os cards da biblioteca agora exibem quando a gravação foi feita com formatação relativa em português: *"Agora mesmo"*, *"Há 5 min"*, *"Há 2h"*, *"Ontem"* ou data calendário.
   - Inclui tooltip com data e hora completas ao passar o mouse.

3. **Marcadores Rápidos de Corte no Studio ("Atual")**:
   - No editor de vídeo (Trimming), novos botões **"Atual"** ao lado dos campos de **Início** e **Fim** sincronizam automaticamente os pontos de corte com a posição exata da reprodução do vídeo.
   - Elimina a necessidade de digitar valores numéricos manualmente ao recortar trechos indesejados.

4. **Robustez e Cobertura de Testes**:
   - Adicionada suíte de testes unitários para o formatador de data relativa (`tests/formatters.test.ts`).
   - 75 testes unitários e de integração executados com 100% de aprovação.
   - Todas as 4 etapas de QA automatizado (compilação, UI Electron, isolamento de processos e cadeia Web Audio DSP) validadas com sucesso.

---

### 📦 Instalação e Atualização

- **Atualização Automática**: Usuários de versões anteriores podem simplesmente clicar em **"Buscar Atualizações"** na tela inicial do Aura Screen Studio ou aguardar a notificação automática para receber esta versão.
- **Instalação Limpa**: Baixe o instalador executável `Aura-Screen-Studio-Setup-1.7.5.exe` abaixo.

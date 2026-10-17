# Aura Screen Studio v1.7.7 🚀

Esta versão traz atualizações substanciais em três fluxos centrais do aplicativo: mecanismo de contagem regressiva configurável, controle aprimorado do player de vídeo no Studio e teleprompter inteligente com pausa ao passar o mouse.

---

### ✨ Novidades e Melhorias Substanciais

1. **Mecanismo de Contagem Regressiva Configurável (0s / 3s / 5s)**:
   - **Novo Seletor de Contagem**: Escolha entre **0s (Direto)**, **3s (Padrão)** e **5s (Relaxado)** nas configurações avançadas de gravação.
   - **Início Instantâneo (0s)**: Para gravações rápidas e apresentadores experientes, a gravação inicia imediatamente sem abrir a janela de contagem, eliminando qualquer atraso.
   - **Suporte a 5 Segundos**: Tempo estendido para apresentadores respirarem, arrumarem a câmera e focarem na gravação.
   - **Sincronização Dinâmica do Anel e Áudio**: O anel SVG e os chimes de áudio via Web Audio se adaptam matematicamente ao tempo total selecionado.
   - Persistência automática da preferência em disco.

2. **Player do Studio: Controle Deslizante de Volume & Atalhos de Velocidade 1.25x**:
   - **Slider de Volume de Alta Fidelidade**: Controle gradual e preciso do volume de reprodução (0% a 100%) diretamente na barra do player, com sincronização automática do botão de mudo.
   - **Preset 1.25x de Velocidade**: Inclusão da taxa de 1.25x (padrão da indústria em Loom/YouTube) no ciclo de velocidades e no teclado (`1` = 1x, `2` = 1.25x, `3` = 1.5x, `4` = 2x).
   - Volume restaurado automaticamente ao abrir qualquer gravação da biblioteca ou do gravador.

3. **Teleprompter Inteligente: Pausa ao Passar o Mouse & Zoom de Fonte pelo Teclado**:
   - **Smart Pause on Hover**: Novo botão de ativação na barra de ferramentas do prompter. Quando ligado, posicionar o cursor sobre o roteiro congela suavemente a rolagem automática para leitura detalhada de pensamentos não ensaiados; mover o cursor para fora retoma a rolagem suave a 60 FPS.
   - **Badge de Status de Pausa**: Indicação visual elegante *"Pausa por Mouse"* quando a rolagem estiver temporariamente suspensa pelo cursor.
   - **Zoom Rápido de Fonte**: Teclas `+` / `=` aumentam e `-` / `_` diminuem o tamanho da tipografia instantaneamente durante a apresentação.

4. **Bateria de Testes e Garantia da Qualidade**:
   - 83 testes unitários e de integração automatizados aprovados (0 falhas).
   - 4 etapas de QA automatizado (compilação TypeScript estrita, testes de UI Electron headless, isolamento de processos do SO e nós Web Audio DSP) validadas com 100% de sucesso.

---

### 📦 Instalação e Atualização

- **Atualização Automática**: Usuários de versões anteriores (`v1.7.6` ou anteriores) podem clicar em **"Buscar Atualizações"** na tela inicial ou aguardar a notificação automática para receber esta versão.
- **Instalação Limpa**: Baixe o instalador executável `Aura-Screen-Studio-Setup-1.7.7.exe` abaixo.

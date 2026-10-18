# Aura Screen Studio v2.6.0 — Live Share Beta (MSE/WebSocket + Áudio), Aura Broadcast Beta (YouTube Live RTMPS), safeStorage & Smart Trimmer

Bem-vindo ao **Aura Screen Studio v2.6.0**! Esta versão introduz avanços arquiteturais de alta performance e segurança no compartilhamento e na transmissão de tela, consolidando implementações robustas de engenharia com separação clara de recursos experimentais e transparência epistemológica.

---

## 🚀 Principais Novidades da Versão 2.6.0

### 1. 📡 Live Share Beta — Transporte MSE via WebSocket com Áudio Opus Integrado
- **Transporte Híbrido com Padrão Conservador**:
  - O transporte padrão universal continua sendo o **MJPEG**, garantindo compatibilidade imediata e zero quebra em redes existentes.
  - O novo transporte **MSE (Media Source Extensions) via WebSocket** foi disponibilizado como recurso **Beta/Experimental** selecionável na barra flutuante.
- **Áudio em Alta Definição Multiplexado**:
  - Captura e transmissão contínua de áudio do microfone/sistema via codec **Opus Stereo a 48 kHz (128 kbps)** junto ao vídeo **VP8** em contêiner WebM.
- **Motor WebSocket Nativo e Conformidade RFC 6455**:
  - Implementação nativa (`NativeWebSocket`) com handshake RFC 6455 rigoroso, mascaramento estrito de frames de cliente, suporte a comprimentos estendidos de 16/64 bits e encerramento limpo (códigos 1000..1011).
  - Fila FIFO com drenagem sequencial sincronizada no registro de listeners (`newListener`), eliminando condições de corrida.
- **Mitigação de Buffer Bloat e Backpressure Seguro (Código 1008)**:
  - Monitoramento de acúmulo de saída (`writableLength > 2 MB`). Clientes lentos são desconectados de forma limpa sem corrupção do bitstream WebM e reconectam recebendo o cabeçalho EBML em cache (Init Segment de 189 bytes) e o último keyframe, sem congelamento do host.
- **Evicção Periódica de Memória no Player Web**:
  - Fila serializada de operações no `SourceBuffer` com evicção a cada 5 segundos de dados anteriores a `currentTime - 10s`, protegendo a cabeça de reprodução contra estouro de memória.

---

### 2. 🔴 Aura Broadcast Beta — Transmissão Direta para YouTube Live (RTMPS) & safeStorage
- **Orquestração de Streaming FFmpeg com Parâmetros Oficiais do Google**:
  - Resolução 1080p ($1920 \times 1080$) a 60 FPS.
  - Controle de taxa estritamente **CBR** (`-b:v 6000k -minrate 6000k -maxrate 6000k -bufsize 12000k`).
  - Intervalo de keyframes de exatamente **2,0 segundos** (`-g 120 -keyint_min 120 -sc_threshold 0` a 60 fps).
  - Áudio AAC Estéreo 128 kbps a 48 kHz via RTMPS seguro (`rtmps://a.rtmps.youtube.com/live2/<chave>`).
  - *Identificação Clara:* O recurso está sinalizado com badge **BETA** na interface e no modal de controle.
- **Proteção Criptográfica safeStorage com Fallback Seguro**:
  - Invocação estrita após o ciclo `app.whenReady()`.
  - Criptografia nativa DPAPI no Windows.
  - Detecção ativa de backend no Linux (`getSelectedStorageBackend()`): caso retorne `basic_text` ou a criptografia esteja indisponível, a aplicação **não grava a chave em disco em hipótese alguma**, mantendo-a estritamente na memória volátil durante a sessão ativa com aviso transparente ao usuário.
- **Telemetria com Segregação Estrita de Descartes (OBS Guidelines)**:
  - Métricas em tempo real diferenciando descartes por saturação de rede (`droppedFramesNetwork`) de atrasos por sobrecarga de processador/encoder (`encoderLagFrames`).

---

### 3. ⚡ Smart Trimmer — Corte Rápido de Vídeo no FFmpeg
- Reestruturação dos comandos de corte com busca rápida alinhada ao keyframe mais próximo (`-ss` pré-input com duração `-t`).
- Stream copy (`-c copy`) imediato em menos de 2 segundos para arquivos suportados.
- Transcodificação acelerada por formato (`libvpx-vp9` com `-deadline realtime -cpu-used 4` e `libx264` com `-preset veryfast`), eliminando regressões para tempos de 1.0x.

---

### 4. 🛡️ Hardening de Segurança CSP & Análise do Instalador
- Política estrita de Content-Security-Policy configurada em `index.html`, eliminando 100% dos avisos de segurança no Electron.
- Inclusão do binário `cloudflared.exe` mantida no instalador com acréscimo real comprimido de apenas ~13,7 MB a 18,2 MB (algoritmo LZMA do NSIS), garantindo operação offline imediata sem riscos de ataques de rede em downloads dinâmicos.

---

## 🔬 Relatório de Validação e Limitações

### Testes e Verificações Executadas:
- **181 testes automatizados (unitários e de integração)** executados e aprovados com 100% de sucesso (50 suítes, 0 falhas).
- **13 testes de interface no Electron** (`npm run test:ui`) aprovados com 100% de sucesso.
- **4 etapas completas de QA** (`npm run test:qa`) aprovadas com sucesso (testes de código, UI Electron, nós DSP Web Audio e persistência inter-processos).
- **Soak Tests de Confiabilidade em Tempo Real**:
  - *Sessão 1 (15 min / 900s):* 26.279 quadros apresentados (29,13 FPS efetivos), jitter de 8,20 ms, p99 de 66,70 ms, 0 stalls em regime ativo. Working Set variou +58,26 MB e Private Bytes +51,48 MB.
  - *Sessão 2 (30 min / 1.800s):* 53.788 quadros apresentados (29,85 FPS efetivos, 99,5% do nominal), jitter de 6,13 ms, p99 de 54,60 ms, 0 stalls em regime ativo. Working Set variou +52,75 MB e Private Bytes +49,78 MB.
  - *Sessão 3 (60 min):* **Dispensada por decisão expressa do usuário**.

### Ressalvas Epistemológicas e Limitações Mantidas:
- **Status do Plano Global:** **PARCIALMENTE CONCLUÍDO**.
- **Dispositivos Móveis Físicos em Rede Celular (4G/5G):** **NÃO VERIFICADO** (testes em aparelhos iPhone reais com Safari/WebKit e Android com Chrome sob conexões móveis fora da LAN permanecem pendentes de hardware externo físico).
- **Ingestão RTMPS Real no YouTube Studio:** **NÃO VERIFICADA** (a conformidade dos presets, CLI e safeStorage foi comprovada; a transmissão em canal real ao vivo depende de conta e chave privada fornecidas pelo usuário em evento de teste).
- **Interpretação de Memória:** A desaceleração acentuada do crescimento de memória após os primeiros 300 segundos foi demonstrada; contudo, uma amostragem de 30 minutos é insuficiente para concluir se o crescimento residual indica retenção contínua ou estabilização assintótica, abstendo-se de inferir ausência de vazamento.

---

## 📦 Arquivos da Release
- `Aura-Screen-Studio-Setup-2.6.0.exe` (Instalador NSIS x64 Completo)
- `Aura-Screen-Studio-Setup-2.6.0.exe.blockmap` (Mapa de blocos para autoupdate rápido)
- `latest.yml` (Manifesto assinado com hash SHA-512 para o `electron-updater`)

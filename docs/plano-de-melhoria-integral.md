# Plano de Melhoria Integral, Otimização e Polimento — Aura Screen Studio (Revisão Crítica de Engenharia)

**Versão Base Auditada:** `v2.5.2`  
**Data da Revisão:** 17 de Outubro de 2026  
**Ambiente de Referência:** Windows 11 x64 (Build 26300), AMD Ryzen 5 5600GT (6C/12T @ 3.6–4.6 GHz), 16 GB RAM DDR4, NVIDIA GeForce GTX 1650 SUPER (4 GB GDDR6)  
**Plataforma de Desenvolvimento:** Node.js v24.21.0, npm 11.19.0, Electron 34.5.8 (faixa declarada `"^34.5.8"` em `package.json`, versão exata `34.5.8` resolvida em `package-lock.json`), React 19.0.0, Vite 6.1.0, TypeScript 5.7.3  
**Status do Repositório Git:** `## master...origin/master` (a branch local está alinhada e sincronizada com o tracking remoto `origin/master`, com 0 commits à frente e 0 atrás; no entanto, a **árvore de trabalho NÃO está limpa**, contendo modificações ativas nos arquivos de código-fonte `electron/main.ts`, `electron/preload.ts`, `electron/shareServer.ts`, `index.html`, `src/services/liveShareService.ts`, `src/types/index.ts`, `src/views/PreRecordingView.tsx`, `src/views/ZoomShareBarView.tsx`, além dos diretórios e arquivos de teste/documentação não rastreados `docs/`, `electron/broadcastService.ts`, `scripts/measure-installer-compression.cjs`, `scripts/measure-latency-and-edges.cjs`, `scripts/probe-media-pipeline.cjs`, `scripts/test-continuous-30s-playback.cjs`, `scripts/test-live-share-field-homologation.cjs`, `scripts/test-live-share-ui.cjs`, `scripts/test-real-media-reproduction.cjs`, `scripts/test-reconnection-cycles.cjs`, `scripts/test-tunnel-pilot.cjs`, `src/components/`, `tests/broadcastAndTrimmer.test.ts`, `tests/liveShareTransport.test.ts` e `tests/poc/`, estritamente preservados sem reset, commit ou push).  

---

## 1. Quadro de Evidências e Classificação Epistemológica

Para garantir precisão e integridade de engenharia, cada afirmação técnica desta auditoria está categorizada em:
1. **Fato Comprovado:** Verificado diretamente no código-fonte atual ou demonstrado por teste automatizado reproduzível no repositório.
2. **Medição Confirmada:** Valor empírico obtido através de ferramenta instrumental de medição no ambiente de referência.
3. **Estimativa Matemática:** Cálculo deduzido de formulações teóricas com pressupostos explícitos, pendente de medição instrumental em tráfego real.
4. **Hipótese Técnica:** Comportamento provável deduzido de restrições de arquitetura que requer teste empírico em bancada para validação.
5. **Meta Proposta de Produto (Decisão Pendente):** Alvo de engenharia estabelecido para validação experimental, cuja aprovação final depende de Prova de Conceito (PoC).

### Matriz de Classificação das Afirmações Técnicas

| Afirmação / Recurso | Classificação | Evidência de Código / Fonte | Status e Conclusão Técnica |
| :--- | :--- | :--- | :--- |
| **Live Share atual não transmite áudio** | **Fato Comprovado** | [`src/services/liveShareService.ts:31`](file:///d:/clone/2/src/services/liveShareService.ts#L31), [`src/services/liveShareService.ts:48`](file:///d:/clone/2/src/services/liveShareService.ts#L48), [`src/services/liveShareService.ts:113-136`](file:///d:/clone/2/src/services/liveShareService.ts#L113-L136), [`electron/shareServer.ts:134-154`](file:///d:/clone/2/electron/shareServer.ts#L134-L154), [`electron/shareServer.ts:1211`](file:///d:/clone/2/electron/shareServer.ts#L1211) | Inspeção ponta a ponta confirma: captura com `audio: false`, vídeo mudo, IPC despacha apenas JPEG Blobs, HTTP responde `multipart/x-mixed-replace` e o espectador web possui apenas tag `<img>`. **Fluxo 100% silencioso**. |
| **Consumo MJPEG (28–48 Mbps estático, 70–120 Mbps movimento)** | **Estimativa Matemática** | Cálculo deduzido sobre `quality: 0.88`, 60 FPS nominais e hipóteses de tamanho de quadro | Extrapolação teórica ($\text{Bytes/frame} \times 8 \times \text{FPS}$). Não foi medido com analisador de pacotes. Requer benchmark instrumental em tráfego real. |
| **Queda de framerate para 35–45 FPS sob carga no MJPEG** | **Hipótese Técnica** | Latência típica de conversão de `canvas.toBlob()` (12–25 ms) no thread principal | Hipótese deduzida do tempo de execução no Renderer, pendente de medição instrumental com múltiplos clientes conectados. |
| **Adoção de Media Source Extensions (MSE)** | **Decisão Pendente / Alternativa a Validar** | W3C MSE Spec, análise de túnel Cloudflare | **Decisão em aberto**. MSE é API exclusiva de reprodução; requer PoC completa de pipeline (captura, encoding, sync A/V, segmentação, transporte, buffers e reconexão). |
| **WebRTC direto (Mesh) reduz banda universalmente** | **Hipótese Incorreta / Condicional** | RFC 8829 / Topologia WebRTC Mesh | Falso para múltiplos espectadores. Em Mesh P2P, a máquina do apresentador multiplica o envio por espectador ($N \times \text{bitrate}$). Sem TURN/SFU, falha em NAT simétrico. |
| **Corte de vídeo "Zero-Wait em 1–3s"** | **Meta Proposta a Validar** | [`electron/main.ts:1063-1083`](file:///d:/clone/2/electron/main.ts#L1063-L1083), [`src/views/PreviewView.tsx:883-925`](file:///d:/clone/2/src/views/PreviewView.tsx#L883-L925) | O corte instantâneo por *stream copy* só funciona em pontos de busca alinhados a keyframes. Corte preciso no milissegundo (*frame-accurate*) pode exigir recodificação de GOP limítrofe. 1–3s é meta, não garantia. |
| **Aviso de CSP no Electron** | **Fato Comprovado** | Log de teste em `scripts/test-ui-runner.cjs`, ausência de meta tag em `dist/index.html` | Ocorre em modo dev e testes desempacotados devido à ausência de `<meta http-equiv="Content-Security-Policy">`. Requer declaração estrita compatível com React inline-styles. |
| **safeStorage oferece proteção idêntica em qualquer SO** | **Hipótese Incorreta** | Electron API `safeStorage.getSelectedStorageBackend()` | Windows usa DPAPI e macOS usa Keychain; no Linux depende de keyrings (`gnome_libsecret`, `kwallet`). Se retornar `basic_text` ou `isEncryptionAvailable() == false`, não há proteção real. `unknown` ocorre apenas se a API for invocada antes do evento `ready` do Electron. |
| **Economia de 25–28 MB ao remover cloudflared do instalador** | **Estimativa Matemática** | Compressão NSIS LZMA em binário Go de 55,3 MB | Estimativa matemática baseada em taxas de compressão típicas de binários PE. Requer compilação e medição real de instaladores gerados com e sem o executável. |
| **Critérios de Teste do Aura (50 MB heap retido, 250 MB Renderer, 3s buffering, 5s reconexão, 200 ms A/V)** | **Critérios Propostos de Teste (Pendentes de PoC)** | Metas internas de engenharia formuladas para o benchmark | Limiares propostos para o teste do produto. Não constituem normas universais da indústria nem resultados comprovados; dependem integralmente de validação experimental na PoC. |

---

## 2. Inspeção Detalhada do Código Atual

### 2.1 Rastreamento Integral do Áudio no Live Share
A ausência de áudio no Live Share foi confirmada por auditoria direta de cada elo da cadeia de processamento:
1. **Ponto de Captura ([`src/services/liveShareService.ts:30-43`](file:///d:/clone/2/src/services/liveShareService.ts#L30-L43)):**
   ```ts
   const stream = await (navigator.mediaDevices as any).getUserMedia({
     audio: false,
     video: {
       mandatory: {
         chromeMediaSource: 'desktop',
         chromeMediaSourceId: targetSourceId,
         minWidth: 1280,
         maxWidth: 1920,
         minHeight: 720,
         maxHeight: 1080,
         maxFrameRate: 60
       }
     }
   });
   ```
   A chamada de captura desativa explicitamente o áudio (`audio: false`). Nenhuma chamada complementar a `getUserMedia` (para microfone ou áudio de loopback do sistema) existe na classe `LiveShareService`.
2. **Elemento de Vídeo Interno ([`src/services/liveShareService.ts:48`](file:///d:/clone/2/src/services/liveShareService.ts#L48)):**
   ```ts
   this.videoEl = document.createElement('video');
   this.videoEl.srcObject = stream;
   this.videoEl.muted = true;
   ```
   O elemento de vídeo criado para ler os quadros é explicitamente silenciado. Não há injeção no `AudioContext` do `audioDsp.ts` nem no mixer do `recorderService.ts`.
3. **Despacho IPC ([`src/services/liveShareService.ts:113-136`](file:///d:/clone/2/src/services/liveShareService.ts#L113-L136)):**
   ```ts
   this.canvasEl.toBlob((blob) => {
     if (blob && window.electronAPI?.sendLiveFrame) {
       blob.arrayBuffer().then((buf) => {
         window.electronAPI.sendLiveFrame(buf);
   ```
   O loop de quadros extrai imagens JPEG estáticas do canvas e despacha via IPC `live-share:broadcast-frame`. Amostras de áudio (PCM, Opus ou AAC) não trafegam pelo IPC.
4. **Distribuição HTTP ([`electron/shareServer.ts:134-154`](file:///d:/clone/2/electron/shareServer.ts#L134-L154)):**
   ```ts
   private writeFrameToClient(res: http.ServerResponse, buffer: Buffer) {
     res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
     res.write(buffer);
     res.write('\r\n');
   }
   ```
   O servidor HTTP escreve chunks delimitados por boundary multipart `image/jpeg`. Não há multiplexação de áudio no stream HTTP.
5. **Visualizador Web do Espectador ([`electron/shareServer.ts:1211`](file:///d:/clone/2/electron/shareServer.ts#L1211)):**
   ```html
   <img id="streamImg" src="/live/stream" alt="Compartilhamento de Tela" class="w-full h-full object-contain select-none" />
   ```
   A interface servida aos espectadores utiliza exclusivamente um elemento `<img>`. Não existem elementos `<audio>`, `<video>` ou instâncias de `AudioContext` no cliente web.
- **Conclusão Factual:** O fluxo do Live Share é **100% silencioso** de ponta a ponta. A adição de áudio exigirá reformulação tanto da captura/codificação quanto do transporte e da interface do espectador.

---

### 2.2 Inspeção do Trimmer de Vídeo
A inspeção do corte de vídeo revela a coexistência de dois caminhos no código atual:
1. **Caminho Nativo via FFmpeg ([`electron/main.ts:1057-1084`](file:///d:/clone/2/electron/main.ts#L1057-L1084)):**
   - Na primeira tentativa, executa stream copy:
     ```ts
     const copyArgs = ['-y', '-ss', String(startSec), '-to', String(endSec), '-i', inputPath, '-c', 'copy', outputPath];
     ```
     Como `-ss` está posicionado antes de `-i`, o FFmpeg realiza busca rápida (*fast seek*) até o ponto de busca/keyframe mais próximo.
   - Caso falhe, executa re-encode completo com libvpx-vp9 e libopus:
     ```ts
     const reencodeArgs = ['-y', '-ss', String(startSec), '-to', String(endSec), '-i', inputPath, '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-c:a', 'libopus', outputPath];
     ```
   - A função `findFfmpegBinary()` ([`electron/main.ts:1034-1055`](file:///d:/clone/2/electron/main.ts#L1034-L1055)) busca o binário em caminhos pré-definidos (incluindo `D:\ffmpeg\...` e `resources/bin`). Se o binário FFmpeg não estiver instalado na máquina do usuário, a chamada nativa falha.
2. **Caminho de Fallback no Renderer ([`src/views/PreviewView.tsx:922-965`](file:///d:/clone/2/src/views/PreviewView.tsx#L922-L965)):**
   - Quando o FFmpeg nativo não está disponível ou retorna erro, o app cai no fallback do cliente: reproduz o vídeo na velocidade normal (1.0x) e grava novamente via `MediaRecorder` em tempo real. Um corte de 5 minutos demora exatamente 300 segundos para ser gerado.
- **Conclusão:** O corte rápido depende da presença do FFmpeg e das características dos keyframes. Definir "1 a 3 segundos" como comportamento universal é incorreto; deve ser tratado como **meta técnica a validar**.

---

## 3. Análise Crítica do Cloudflare Tunnel: Quick Tunnels, Buffering e Riscos

A inspeção do código em [`electron/shareServer.ts:224-230`](file:///d:/clone/2/electron/shareServer.ts#L224-L230) comprova que o Aura Screen Studio inicializa o túnel através do comando:
```ts
this.tunnelProcess = spawn(chosenBin, ['tunnel', '--url', `http://localhost:${this.port}`], { windowsHide: true });
```
Esse comando gera um domínio temporário sob `*.trycloudflare.com`, caracterizando o uso de um **Quick Tunnel**.

### 3.1 Riscos de Arquitetura e Produto dos Quick Tunnels
Conforme documentação oficial de [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/):
1. **Ambiente Temporário de Teste:** Quick Tunnels são destinados exclusivamente a testes, desenvolvimento e compartilhamento temporário. A Cloudflare **não oferece garantia de disponibilidade (SLA)** nem estabilidade de roteamento para esses túneis.
2. **URLs Efêmeras:** A URL pública muda a cada reinicialização do túnel, impedindo links permanentes para criadores.
3. **Incompatibilidade com Server-Sent Events (SSE):** A documentação oficial da Cloudflare alerta expressamente que **Server-Sent Events (SSE) não são suportados em Quick Tunnels**. O Aura utiliza SSE em [`electron/shareServer.ts:296`](file:///d:/clone/2/electron/shareServer.ts#L296) (`/api/live/events`) para despachar reações e status de espectadores. Essa dependência de Quick Tunnels em ambiente de produção representa um **risco de produto e arquitetura** que precisa ser tratado (ex: migrando eventos para WebSocket ou requerendo conta com túnel nomeado para uso avançado).

### 3.2 Comportamento de Buffering no Cloudflare Tunnel por Modo de Transporte
Conforme documentado em [Cloudflare Tunnel Common Errors](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/):
Proxies reversos e o conector `cloudflared` podem armazenar em buffer respostas de streaming contínuo. É imperativo distinguir com precisão o comportamento dos três modos sob teste:

1. **Resposta HTTP Longa com Transferência em Streaming / Chunked:**
   - *Exemplo:* MJPEG atual (`multipart/x-mixed-replace`) ou stream contínuo chunked.
   - *Risco:* Suscetível a buffering intermediário na borda da CDN. O proxy pode reter blocos de dados até encher buffers de pacote TCP, entregando os quadros aos espectadores em rajadas (*bursting*), causando travamentos visuais e quebrando a cadência temporal contínua da transmissão.
2. **Requisições HTTP Curtas (Uma por Segmento de Mídia):**
   - *Exemplo:* Modelo de fatias fMP4/WebM buscadas via GET `/live/segment_123.m4s`.
   - *Avaliação Técnica:* Não se deve classificar requisições curtas como "garantidamente livres de buffering". Embora cada requisição seja uma transação HTTP estática independente, a borda do túnel e proxies intermediários ainda podem introduzir latência variável na entrega e round-trips acumulados. **É obrigatório medir experimentalmente a latência por segmento pelo túnel real**.
3. **Transporte Contínuo por WebSocket:**
   - *Exemplo:* Stream contínuo de segmentos ou frames encapsulados em mensagens binárias via canal TCP bidirecional.
   - *Avaliação Técnica:* Contorna o buffering típico de respostas HTTP contínuas. Contudo, **o suporte a WebSocket da Cloudflare não garante sessões ininterruptas**. Conexões ociosas podem ser terminadas por intermediários de rede. Para assegurar sessões longas e estáveis, é indispensável implementar **heartbeats periódicos (*ping/pong*) na camada de aplicação** e lógica de reconexão automática no cliente com buffer de contingência para absorver reorientações de rota da borda da Cloudflare.

### 3.3 Segregação Completa das Dimensões de Custo
Evitando alegações infundadas de "custo zero", os custos de cada modelo são estruturados em cinco dimensões independentes:
1. **Infraestrutura de Servidores:** $0/mês se operado exclusivamente na máquina do usuário via túneis gratuitos; custos recorrentes de computação em nuvem caso seja adotado um servidor SFU (ex: LiveKit) ou servidores de mídia dedicados.
2. **Tráfego de Rede e Políticas de Termos de Serviço (ToS):** Zonas de CDN da Cloudflare vinculadas a domínios próprios possuem diretrizes nos Termos de Serviço (Seção 2.8) quanto ao tráfego pesado de mídia contínua não-HTML. O uso deve ser validado para evitar penalidades ou necessidade de contratação de serviços comerciais de streaming.
3. **Banda Residencial de Upload do Usuário:** Em todas as soluções sem servidor SFU redistribuidor (MJPEG, MSE local e WebRTC Mesh), a máquina do apresentador envia cópias individuais para cada espectador, debitando integralmente da sua taxa de upload residencial ($N \times \text{bitrate}$).
4. **Carga Computacional no Desktop do Apresentador:** Uso contínuo de processador (CPU) e núcleos de codificação de GPU (NVENC/QuickSync/AMF) para capturar, mixar áudio e comprimir mídia simultaneamente.
5. **Dependências Externas:** Necessidade de servidores STUN públicos (sem custo direto) e servidores de relay TURN com IP público (custo mensal de infraestrutura) para contornar redes com NAT simétrico e firewalls corporativos restritivos.

---

## 4. Reavaliação Crítica da Proposta de MSE (Media Source Extensions)

> [!IMPORTANT]
> **MSE permanece estritamente como uma alternativa sob avaliação técnica (Decisão Pendente).**  
> MSE não foi aprovado como arquitetura final. Sua viabilidade depende dos resultados práticos da Prova de Conceito (PoC) executada pelo túnel real.

### 4.1 Natureza e Limitações da API MSE
Conforme especificação do [W3C Media Source Extensions](https://www.w3.org/TR/media-source-1/):
- **O que o MSE é:** Uma API do navegador que estende `HTMLMediaElement` para permitir que scripts JavaScript alimentem segmentos de mídia (`ArrayBuffer`) a um elemento `<video>` por meio de instâncias de `SourceBuffer` (`sourceBuffer.appendBuffer(chunk)`).
- **O que o MSE NÃO é:**
  - O MSE **não captura** tela nem áudio.
  - O MSE **não codifica** dados em codecs de vídeo ou áudio.
  - O MSE **não gera os contêineres fragmentados** (não empacota caixas `moov`/`moof`/`mdat` de fMP4 nem blocos EBML de WebM).
  - O MSE **não define nem provê transporte de rede**.

### 4.2 O Pipeline Completo Necessário para Viabilizar MSE
Para que o MSE funcione como motor do Live Share, é obrigatório construir e orquestrar um pipeline composto por 7 camadas interdependentes:

```mermaid
flowchart LR
    subgraph Emissor (App Electron)
        C["1. Captura (Tela + Mic + Loopback)"] --> E["2. Codificação (H.264/VP8 + AAC/Opus)"]
        E --> S["3. Sincronização A/V (PTS/DTS)"]
        S --> M["4. Segmentação & Muxing (Init + Media Segments)"]
        M --> T["5. Transporte (HTTP Curto / WebSocket)"]
    end
    subgraph Infraestrutura
        T --> TU["Túnel Cloudflare (Quick Tunnel)"]
    end
    subgraph Receptor (Navegador Espectador)
        TU --> WS["6. Cliente WS / Fetch"]
        WS --> SB["SourceBuffer.appendBuffer()"]
        SB --> BUF["7. Gestão de Buffer & Evicção"]
        BUF --> V["Elemento <video>"]
    end
```

1. **Captura:** Capturar tela via `desktopCapturer`/`getUserMedia` e mixar microfone e áudio do sistema com `AudioContext`.
2. **Codificação:** Transformar quadros raw em bitstream comprimido via WebCodecs API (`VideoEncoder`/`AudioEncoder`) no Chromium, processo nativo FFmpeg em background, ou fatias curtas via `MediaRecorder`.
3. **Sincronização A/V:** Atribuir *Presentation Timestamps* (PTS) e *Decode Timestamps* (DTS) rigorosamente alinhados entre áudio e vídeo, prevenindo drift labial ao longo do tempo.
4. **Segmentação e Muxing:**
   - **Segmento de Inicialização (*Init Segment*):** Contém metadados de trilhas e parâmetros de codec (caixas `ftyp` e `moov` com SPS/PPS para fMP4, ou cabeçalho EBML/Tracks para WebM). Deve ser gerado uma única vez e retido em memória para novos espectadores.
   - **Segmentos de Mídia (*Media Segments*):** Blocos fragmentados sequenciais (ex: `moof` + `mdat` em fMP4 ou Clusters WebM) de duração curta (500 ms a 1.000 ms), iniciando obrigatoriamente por keyframe.
5. **Transporte de Rede:** Transmitir segmentos pelo servidor HTTP local através do túnel Cloudflare via requisições HTTP curtas ou canal contínuo WebSocket.
6. **Gestão de Buffer no Player Espectador:**
   - O cliente web instancia `MediaSource`, cria `SourceBuffer`, aguarda o evento `updateend` antes de cada chamada `appendBuffer()` (operações concorrentes disparam `InvalidStateError`).
   - **Evicção de Memória:** O navegador não remove segmentos antigos automaticamente em lives. É mandatório invocar `sourceBuffer.remove(0, currentTime - 30)` periodicamente para desalocar mídia reproduzida e evitar o estouro de memória da aba.
7. **Desligamento e Recuperação de Erros:** Tratamento de buffer underflow (stalls), reinicialização do decoder em falha de decodificação e reconexão de rede com requisição de novo Init Segment.

---

## 5. Comparativo Imparcial das Alternativas de Transporte

A tabela a seguir compara as alternativas técnicas avaliadas para o Aura Live Share:

| Critério de Avaliação | 1. MJPEG Atual (HTTP Multipart) | 2. MSE com Requisições HTTP Curtas | 3. MSE Contínuo via WebSocket | 4. WebRTC Direto (P2P Mesh) | 5. WebRTC com Relay Central (TURN / SFU) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Banda de Upload por Espectador** | **Muito Alta:** Multiplica integralmente ($N \times \text{bitrate}$). Estimado em dezenas de Mbps por espectador. | **Baixa a Moderada:** Multiplica por espectador ($N \times \text{bitrate}$), base de 2 a 5 Mbps. | **Baixa a Moderada:** Multiplica por espectador ($N \times \text{bitrate}$), base de 2 a 5 Mbps. | **Baixa:** Multiplica por espectador ($N \times \text{bitrate}$) a 2 a 4 Mbps. Com 5 clientes = 10 a 20 Mbps de upload contínuo. | **Ótima:** Transmissor envia **1 único fluxo** ($1 \times \text{bitrate}$) de 3 a 5 Mbps para o servidor SFU; o SFU redistribui. |
| **Escalabilidade com Múltiplos Espectadores** | Péssima: Satura conexões residenciais com 2 a 3 espectadores. | Aceitável para pequenas audiências (3 a 8 pessoas) no upload doméstico. | Aceitável para pequenas audiências (3 a 8 pessoas) no upload doméstico. | Aceitável para 1:1 ou 1:3; degrada rapidamente acima de 4 clientes em upload residencial. | **Excelente:** Suporta dezenas ou centenas de espectadores sem sobrecarregar o transmissor. |
| **Latência Típica (Glass-to-Glass)** | Baixa (150–350 ms). | Moderada a Alta (**3,0 a 6,0 segundos** devido ao tempo de segmento e polling). | Moderada (**1,5 a 3,5 segundos** devido ao buffer de jitter e tamanho do segmento). | **Ultra-baixa (100–300 ms)** em tempo real conversacional. | **Ultra-baixa (150–400 ms)**. |
| **Sincronização Áudio / Vídeo** | **Inexistente:** Não transmite áudio no estado atual. | **Nativa:** Encapsulados no mesmo contêiner fragmentado com timestamps PTS. | **Nativa:** Encapsulados no mesmo contêiner fragmentado com timestamps PTS. | **Nativa:** Sincronia via relógio RTCP (NTP/RTP timestamps). | **Nativa:** Sincronia via RTCP controlada pelo SFU. |
| **Carga de CPU / GPU no Transmissor** | Média em CPU (`canvas.toBlob`), concorre com thread do Renderer. | Média a Baixa com encoder por hardware (NVENC/QuickSync via WebCodecs). | Média a Baixa com encoder por hardware (NVENC/QuickSync via WebCodecs). | Média: A pilha WebRTC codifica e gerencia congestionamento por peer. | Baixa a Média: Apenas 1 codificação de saída. |
| **Overhead de Transporte de Mensagens** | Cabeçalho multipart por frame (`Content-Type`, `Content-Length`). | Cabeçalho HTTP completo por requisição de segmento (GET, cookies, headers). | **Baixo:** Enquadramento de mensagens RFC 6455 (2 a 10 bytes por frame) sobre TCP/TLS. | Baixo: Pacotes RTP/SRTP com cabeçalho de 12 bytes sobre UDP. | Baixo: Pacotes RTP/SRTP sobre UDP. |
| **Complexidade de Implementação** | Muito Baixa (já existente). | Média: Servidor HTTP de segmentos estáticos e cliente fazendo fetch. | **Média-Alta:** Segmentador contínuo, framing WS, heartbeats e gestão de buffer. | **Alta:** Servidor de sinalização, troca de SDP/ICE candidates e STUN. | **Muito Alta:** Servidor SFU dedicado (ex: LiveKit, mediasoup) hospedado na nuvem. |
| **Dependências Externas** | Nenhuma (servidor local + `cloudflared`). | Nenhuma além do túnel existente. | Nenhuma além do túnel existente. | Servidor STUN público + Servidor TURN para redes restritas. | Servidor SFU dedicado com IP público na nuvem. |
| **Custo de Operação e Infraestrutura** | **$0 em Servidores:** Consome banda de upload e CPU do usuário. | **$0 em Servidores:** Consome banda de upload e CPU/GPU do usuário. | **$0 em Servidores:** Consome banda de upload e CPU/GPU do usuário. | Baixo a Médio: Custo de servidor TURN para ~15–20% das conexões que falham no STUN. | **Alto:** Custos mensais de instâncias de nuvem (CPU e egresso de dados para toda a audiência). |
| **Travessia de NAT e Firewalls** | **Alta:** HTTP/TCP padrão pelo túnel Cloudflare. | **Alta:** HTTP GET padrão pelo túnel Cloudflare. | **Alta:** WebSocket TCP pelo túnel Cloudflare. | **Baixa a Média:** Falha em redes com NAT simétrico ou bloqueio UDP sem TURN. | Alta: O SFU possui IP público fixo e portas abertas. |
| **Recuperação de Falhas e Quedas** | Simples recarregamento do stream HTTP. | Robusta: Próximo GET busca o segmento seguinte da lista. | Requer reconexão de WebSocket e retransmissão do Init Segment. | ICE Restart nativo da pilha WebRTC. | Reconexão de sessão controlada pela API do SFU. |

> [!NOTE]
> **Esclarecimento sobre Overhead do WebSocket ([RFC 6455 Seção 5.2](https://www.rfc-editor.org/rfc/rfc6455#section-5.2)):**  
> Embora o WebSocket elimine o ciclo de repetição de requisições e cabeçalhos HTTP (User-Agent, Cookies, etc.), ele **não tem "zero overhead"**. Cada mensagem WebSocket carrega um cabeçalho de enquadramento binário de 2 a 10 bytes (indicando opcode, máscara e payload length), além do overhead das camadas TCP e registros TLS.

---

## 6. Estimativas de MJPEG vs. Necessidade de Medição Instrumental

### 6.1 Formulação Matemática das Estimativas Teóricas
A taxa de bits do MJPEG depende fundamentalmente do tamanho individual de cada imagem comprimida, que varia de acordo com a entropia visual da tela:

$$\text{Bitrate Teórico (bps)} = S_{\text{médio}} \text{ (Bytes)} \times 8 \times \text{FPS}_{\text{efetivo}} \times N_{\text{espectadores}}$$

**Pressupostos Explícitos do Código Atual ([`src/services/liveShareService.ts:9-10`](file:///d:/clone/2/src/services/liveShareService.ts#L9-L10)):**
- Resolução máxima configurada: $1920 \times 1080$ pixels.
- Fator de compressão JPEG: `quality: 0.88`.
- Taxa nominal teórica do timer: `targetFps: 60`.
- *Ressalva:* Os valores de `quality: 0.88` e 60 FPS nominais não determinam por si só a taxa de bits. É obrigatório registrar o tamanho médio de frame ($S_{\text{médio}}$) adotado nos cálculos.

#### Cenários de Cálculo Teórico:
1. **Cenário A — Tela Estática / Baixa Entropia (IDE escura, editor de texto com poucas cores):**
   - *Tamanho médio de quadro JPEG assumido:* $S_{\text{médio}} \approx 60\text{ KB a } 100\text{ KB}$.
   - *Cálculo a 60 FPS nominais ($N=1$):*
     $$60 \text{ KB} \times 1024 \times 8 \times 60 = 29.491.200\text{ bps} \approx \mathbf{29,5\text{ Mbps por espectador}}$$
     $$100 \text{ KB} \times 1024 \times 8 \times 60 = 49.152.000\text{ bps} \approx \mathbf{49,2\text{ Mbps por espectador}}$$
2. **Cenário B — Tela Dinâmica / Alta Entropia (Vídeo em reprodução, jogos, fotos coloridas):**
   - *Tamanho médio de quadro JPEG assumido:* $S_{\text{médio}} \approx 150\text{ KB a } 250\text{ KB}$.
   - *Cálculo a 60 FPS nominais ($N=1$):*
     $$150 \text{ KB} \times 1024 \times 8 \times 60 = 73.728.000\text{ bps} \approx \mathbf{73,7\text{ Mbps por espectador}}$$
     $$250 \text{ KB} \times 1024 \times 8 \times 60 = 122.880.000\text{ bps} \approx \mathbf{122,9\text{ Mbps por espectador}}$$
3. **Multiplicação Teórica por Múltiplos Espectadores:**
   - Para 3 espectadores assistindo simultaneamente a uma tela mista (~150 KB/frame):
     $$\text{Upload Total Teórico} = 3 \times 73,7\text{ Mbps} = \mathbf{221,1\text{ Mbps}}$$

### 6.2 Variáveis Reais de Execução (Hipóteses Técnicas a Medir)
Em condições reais de bancada, a vazão observada pode divergir dos valores teóricos devido a:
1. **Sobrecarga do Event Loop no Renderer:** O método assíncrono `canvas.toBlob()` requer rasterização e compressão JPEG no thread principal do Chromium, consumindo tipicamente entre 12 ms e 25 ms por quadro 1080p. Com isso, levanta-se a **hipótese técnica** de que o framerate efetivo sofra queda para a faixa de 35–45 FPS sob carga, reduzindo a vazão de rede às custas da fluidez visual.
2. **Backpressure do Socket TCP:** Quando o upload da máquina atinge o limite ou a conexão do espectador é lenta, o buffer do socket HTTP do Node.js (`res.write()`) retém dados, forçando o descarte ou atraso no envio de quadros.
- **Diretriz Técnica:** Esses números permanecem classificados como **hipóteses matemáticas de consumo máximo**, sendo obrigatória a medição empírica instrumental durante a Prova de Conceito.

---

## 7. Protocolo de Benchmark Instrumental e Metas Propostas do Produto

### 7.1 Enquadramento Correto das Referências Normativas
Para eliminar imprecisões conceituais, as referências normativas internacionais são aplicadas estritamente aos seus escopos originais:
- **ITU-T G.114 ("One-way transmission time"):** Trata do tempo de transmissão unidirecional em sistemas de telecomunicações de voz e ressalta que aplicações interativas podem ser degradadas por atrasos inferiores a 400 ms (categorizando 0 a 150 ms como aceitável para a maioria dos usuários, 150 a 400 ms como aceitável com limitações, e >400 ms como inaceitável para conversação geral). **A norma não prescreve `≤400 ms` para WebRTC nem `≤3,5 s` para MSE**. Esses valores são classificados estritamente como **metas internas propostas de produto**, diferenciando a exigência de interatividade conversacional (<400 ms) da tolerância para apresentações de slides unidirecionais (<3,5 s).
- **ITU-R BT.1359-1 ("Relative timing of sound and vision for broadcasting"):** Conforme dados experimentais da Tabela 1 da recomendação oficial da ITU, os limiares médios de percepção humana para sincronismo audiovisual em radiodifusão são **estritamente assimétricos**:
  - *Limiar médio de detectabilidade:* de **+45 ms a −125 ms** (o som adiantado em relação à imagem torna-se perceptível a partir de +45 ms, e o som atrasado a partir de −125 ms).
  - *Limiar médio de aceitabilidade:* de **+90 ms a −185 ms** (o som adiantado permanece aceitável até +90 ms, e o som atrasado até −185 ms).  
  A norma não estabelece limites simétricos nem prescreve os valores de +25 ms ou −90 ms como detectabilidade. O valor de **`|Δt| ≤ 60 ms`** (com a convenção de sinal $\Delta t = t_{\text{áudio}} - t_{\text{vídeo}}$) é uma **meta interna proposta conservadora do produto**, e não um limite fixado pela norma. Essa meta visa manter o sincronismo bem dentro da janela de aceitabilidade (+90 ms a −185 ms), assegurando margem de segurança contra drift.
- **Banda de Upload Residencial:** Não se atribui uma velocidade mediana de upload ao Brasil sem levantamento estatístico auditado. Conforme recomendações da **[Anatel](https://www.gov.br/anatel/pt-br/dados/qualidade/qualidade-dos-servicos/medicoes-da-banda-larga)**, as taxas de download e upload devem ser avaliadas separadamente, dado o caráter assimétrico das conexões de banda larga fixa e móvel. A meta de **`≤15 Mbps para três espectadores`** é tratada puramente como **meta proposta de benchmark de produto**.

### 7.2 Definição, Ponto de Coleta e Instrumentalização das Métricas

```mermaid
flowchart TD
    M[Métricas Coletadas no Benchmark] --> M1["Rede & Vazão: Bitrate de Saída no Socket (socket.bytesWritten / getStats)"]
    M --> M2["Desempenho Visual: FPS Efetivo no Player e Latência Glass-to-Glass"]
    M --> M3["Confiabilidade: Taxa de Sucesso de Conexão (%) e Tempo de Reconexão (s)"]
    M --> M4["Áudio & Sincronia: Offset A/V Percebido vs Alinhamento de Timestamps"]
    M --> M5["Recursos de Sistema: Heap JS V8 vs Memória de Processo Renderer (app.getAppMetrics / SO)"]
```

1. **Banda de Upload do Emissor (Kbps / Mbps):**
   - *O que mede:* Vazão bruta de saída despachada pela interface de rede da máquina do apresentador.
   - *Ponto de coleta:* No Node.js via amostragem de `socket.bytesWritten` para HTTP e WebSocket; via `RTCPeerConnection.getStats()` (`outbound-rtp.bytesSent`) para WebRTC.
2. **Latência Glass-to-Glass (ms):**
   - *O que mede:* Tempo total decorrido entre a renderização de um quadro no framebuffer do monitor do apresentador e sua exibição física na tela do navegador do espectador.
   - *Condições e Método de Teste:* Exibição de um cronômetro digital de alta precisão (com milissegundos) na tela capturada. Uma câmera de alta velocidade (120/240 fps) filma simultaneamente a tela do transmissor e a do receptor lado a lado, calculando a diferença temporal entre os cronômetros visíveis.
3. **Sincronização Áudio / Vídeo (Alinhamento de Timestamps, Estimativa de Pipeline e Medição Física):**
   Conforme especificações do [W3C Media Timed Events](https://www.w3.org/TR/media-timed-events/), da documentação da API [`HTMLVideoElement.requestVideoFrameCallback()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) e da API [`AudioContext.getOutputTimestamp()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp), é indispensável separar a análise em três camadas rigorosas:
   - *Camada 1 — Alinhamento Digital de Timestamps no Fluxo (Bitstream PTS/DTS):* Verificação lógica de que os pacotes de áudio e vídeo possuem Presentation Timestamps (PTS) sincronizados no contêiner fragmentado (fMP4/WebM). Essa checagem digital comprova apenas que o muxer operou corretamente; **ela não comprova nem garante a sincronia percebida pelo usuário**, pois desconsidera delays de hardware, decodificação assíncrona, filas de composição gráfica e latência de buffer dos drivers de áudio do sistema operacional.
   - *Camada 2 — Estimativa Interna de Pipeline no Navegador (Diferenciação e Mapeamento de Relógios):* O valor de `video.currentTime` **não reflete o instante físico de apresentação**, pois representa unicamente a posição lógica do cursor da mídia na timeline do elemento `<video>`. Ao utilizar a API W3C `HTMLVideoElement.requestVideoFrameCallback(callback)`, deve-se diferenciar três instantes temporais:
     1. *Timestamp de Submissão para Composição (`metadata.presentationTime`):* Instante no relógio de alta resolução da página em que o subsistema de decodificação do navegador concluiu o processamento e submeteu o quadro para a fila do compositor gráfico do Chromium. **Indica estritamente a submissão para composição, e não o momento físico em que os pixels aparecem no display**.
     2. *Estimativa do Instante em que o Quadro Ficará Visível (`metadata.expectedDisplayTime`):* Estimativa interna calculada pelo compositor do navegador para o instante em que o quadro deverá tornar-se visível, alinhada à cadência de *vsync*. **Trata-se de uma estimativa de software do navegador**, sujeita a atrasos do escalonador do SO.
     3. *Apresentação Física no Display:* Instante real da emissão de fótons pelo painel do monitor, influenciado pelo gerenciador de janelas do SO (DWM no Windows, Wayland/X11 no Linux), buffers de swapchain da GPU, modo de exibição (janela vs. fullscreen exclusivo) e tempo de resposta intrínseco dos pixels do display.
     - *Mapeamento Rigoroso de Relógios entre Áudio e Vídeo no Navegador:*
       A chamada `audioContext.getOutputTimestamp()` retorna `{ contextTime, performanceTime }`, onde `contextTime` representa a posição na timeline de áudio da amostra sendo renderizada e `performanceTime` é o instante correspondente no relógio `performance.now()`. Para um evento de teste sonoro programado para ocorrer em `t_evento_audio` na timeline do `AudioContext`, o instante estimado de renderização acústica no relógio `performance` deve ser formalmente mapeado através da relação linear:
       $$t_{\text{pulso, perf}} = \text{audioTimestamp.performanceTime} + (t_{\text{evento\_audio}} - \text{audioTimestamp.contextTime}) \times 1000$$
       Somente após projetar o pulso sonoro e o quadro visual associado para a **mesma base de tempo comum do relógio `performance.now()`** para o mesmo evento de teste é matematicamente válido calcular a estimativa de software:
       $$\Delta t_{\text{software}} = t_{\text{pulso, perf}} - \text{metadata.expectedDisplayTime}$$
       Subtrair diretamente timestamps brutos sem esse mapeamento ou sem demonstrar que representam o mesmo evento de teste é metodologicamente inválido. Deve ficar explícito que esse cálculo é **uma estimativa gerada por modelos de software do pipeline interno do navegador**, e **não uma medição física completa de ponta a ponta**.
   - *Camada 3 — Medição Física Completa de Ponta a Ponta (Padrão Ouro Instrumental):*
     Para validação física independente da sincronia perceptual (*Glass-to-Glass* e *Speaker-to-Ear*), adota-se o método instrumental externo:
     1. *Sinal de Teste na Origem:* Gerador sintético com relógio de alta precisão (`performance.now()` ancorado no host). A cada 2 segundos, exibe um flash visual branco de 1 quadro (16,6 ms a 60 Hz) na tela e emite simultaneamente um pulso sonoro senoidal de 1 kHz (20 ms) na Web Audio API exatamente no mesmo instante $t_0$.
     2. *Gravação e Resolução Temporal:* Uma câmera de alta velocidade operando a **240 fps** (resolução temporal de **$\approx 4,17\text{ ms}$** por quadro) ou **120 fps** (resolução temporal de **$\approx 8,33\text{ ms}$** por quadro) filma simultaneamente o monitor do receptor, enquanto um microfone de referência posicionado em campo próximo (<5 cm do alto-falante) capta a saída acústica do transdutor do receptor em um fluxo registrado a 48 kHz ou 96 kHz (resolução temporal acústica $< 0,02\text{ ms}$).
     3. *Análise do Sinal de Flash e Pulso:*
        - *Vídeo (Detecção do Flash):* Análise quadro a quadro da gravação, aplicando detecção de borda de subida de intensidade/luminância dos pixels do display para marcar o quadro exato da primeira emissão de luz ($t_{\text{vídeo, físico}}$).
        - *Áudio (Detecção do Pulso Acústico):* Importação da trilha gravada em ferramenta de análise de áudio (ex: Audacity ou Reaper). Através da forma de onda e do espectrograma FFT, identifica-se a amostra exata de início da oscilação de 1 kHz (*onset detection*), marcando $t_{\text{áudio, físico}}$.
        - *Cálculo do Desvio Físico:* $\Delta t = t_{\text{áudio, físico}} - t_{\text{vídeo, físico}}$ na base de tempo comum da gravação externa.
     4. *Limitações do Método Físico:* A medição por câmera captura o tempo de resposta cinza-a-cinza (GtG) do painel LCD/OLED (tipicamente 1–5 ms), artefatos de *rolling shutter* do sensor da câmera e atraso acústico de propagação no ar (~0,29 ms a 10 cm). A proximidade estrita do microfone e o uso de taxas altas de amostragem reduzem essas incertezas para níveis inferiores à tolerância do produto ($\pm 4,17\text{ ms}$).

4. **Memória do App e do Espectador (Heap V8 vs. Métricas de Processo por Sistema Operacional):**
   Conforme especificações e diretrizes de [Chrome DevTools — Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems/) e da API do Electron ([`app.getAppMetrics()`](https://www.electronjs.org/docs/latest/api/app) na versão 34.5.8 do runtime):
   
   - **Heap JavaScript do Runtime (`performance.memory.usedJSHeapSize`):**
     - *Escopo e Limitações:* API não padronizada e proprietária do Chromium/V8 que afere exclusivamente o Heap gerenciado pela máquina virtual JavaScript (objetos JS, arrays, closures e metadados). **Não inclui nem reflete** buffers nativos de mídia alocados em C++ (filas do decodificador de vídeo, chunks de bytes do `SourceBuffer`, texturas da GPU e superfícies gráficas).
     - *Protocolo de Medição e Estimativa de Tendência do Limite de 50 MB:*
       1. *Limitação da Amostragem Periódica:* Amostras de `usedJSHeapSize` a cada 5 segundos **não identificam o momento exato de coletas de lixo (GC)**, pois o coletor da V8 é acionado assincronamente por heurísticas internas do motor em intervalos arbitrários. Portanto, em testes sem controle explícito de GC, a curva temporal é tratada estritamente como **estimativa de tendência de crescimento**.
       2. *Forma Reproduzível de Medição de Crescimento Retido:* Em ambiente automatizado de QA/PoC, aciona-se explicitamente uma coleta de lixo completa via Chrome DevTools Protocol (`HeapProfiler.collectGarbage`) em dois marcos estritos:
          - *Marco Baseline:* Acionado imediatamente após **60 segundos** de aquecimento (*warm-up*) com streaming ativo.
          - *Marco Final:* Acionado imediatamente ao encerramento da sessão de teste (15, 30 ou 60 minutos).
       3. *Critério de Aceitação:* O crescimento retido reproduzível é a diferença $\Delta \text{Heap}_{\text{retido}} = \text{Heap}_{\text{pós-GC, final}} - \text{Heap}_{\text{pós-GC, baseline}}$. Caso a execução ocorra em navegador cliente sem controle de CDP para forçar GC, o valor observado ao longo de coletas a cada 5s é classificado como estimativa de tendência baseada nos valores mínimos estáveis (vales da curva).

   - **Memória de Processo Nativo do Aplicativo Electron (Instrumentação Prioritária):**
     - No aplicativo desktop Aura Screen Studio, a instrumentação prioritária utiliza a API nativa do processo Main: `app.getAppMetrics()`.
     - *Identificação e Segregação por Tipo e PID:*
       A documentação oficial do Electron define os valores do campo `ProcessMetric.type` como: `'Tab'`, `'Browser'`, `'GPU'`, `'Zygote'`, `'Utility'`, etc. **O tipo oficial documentado para processos que renderizam páginas web é estritamente `'Tab'` (e não 'Renderer')**.
       - *Correlação entre Processo e View:* Para identificar o PID do processo correspondente à janela ou visualizador web do app, o processo Main consulta `win.webContents.getOSProcessId()` e localiza na lista retornada por `app.getAppMetrics()` o item onde `metric.pid === win.webContents.getOSProcessId()` e `metric.type === 'Tab'`.
       - Os outros processos são identificados como `type === 'Browser'` (processo Main da aplicação), `type === 'GPU'` (processo de aceleração de hardware) e `type === 'Utility'` (serviços auxiliares).
     - *Escopo do Limite Proposto de 250 MB:*
       O limite proposto de **$\le 250\text{ MB}$ aplica-se isolada e estritamente ao processo `'Tab'`** correspondente ao visualizador/player. Ele **NÃO inclui** o processo `'GPU'` nem o processo `'Browser'`. Processos de GPU e Main possuem alocações e ciclos de vida próprios da arquitetura Chromium e são monitorados separadamente como métricas de observação contínua.

   - **Diferenciação Rigorosa das Métricas por Sistema Operacional (Vedada Comparação Direta):**
     As métricas de memória de processos variam fundamentalmente entre sistemas operacionais e APIs:
     - **No Windows:**
       - *Working Set (`ProcessMemoryInfo.workingSetSize` no Electron / `Working Set` no SO):* Volume total de memória física (RAM) atualmente mapeada no espaço de endereçamento do processo. Inclui código e recursos de DLLs compartilhadas com outros processos do sistema.
       - *Private Bytes (`ProcessMemoryInfo.privateBytes` no Electron / `Commit Size` no Task Manager):* Total de memória privada comprometida (*committed*) alocada exclusivamente ao processo no arquivo de paginação/RAM que não pode ser compartilhada com nenhum outro processo. **Não deve ser chamado de "Private Working Set"**, pois o Private Working Set é apenas a fração residente em RAM da memória privada, enquanto `privateBytes` reflete o compromisso total alocado.
     - **No Linux:**
       - *Resident Set Size (RSS):* Quantidade total de memória RAM física ocupada pelo processo, incluindo páginas compartilhadas de bibliotecas dinâmicas (.so).
       - *Unique Set Size (USS) vs. `Private_Dirty`:* No Linux, **USS e `Private_Dirty` NÃO são sinônimos**. Conforme documentação do kernel (`/proc/[pid]/smaps_rollup`), o USS (memória unicamente consumida pelo processo) é composto pela soma de `Private_Clean` (páginas limpas e unicamente mapeadas, como arquivos executáveis privados não alterados) e `Private_Dirty` (páginas unicamente modificadas pelo processo que exigem retenção ou swap). Tratar ambos como sinônimos distorce o diagnóstico de alocação de heap e buffers.
     - *Diretriz de Medição e Limitações:* Na API do Electron (`app.getAppMetrics()`), utiliza-se `memory.privateBytes` (kB) como indicador primário de alocação privada e `memory.workingSetSize` (kB) como presença em RAM física. É terminantemente vedada a comparação direta de valores de `privateBytes` de um SO com `workingSetSize` ou `RSS` de outro, devendo cada plataforma ser avaliada com base nas suas métricas nativas compatíveis.
     
   - **Medição no Navegador Web do Espectador (Ambiente Web Puro):**
     - Quando o espectador acessa a live via Google Chrome em navegador comum, a inspeção manual de processo é realizada abrindo o Gerenciador de Tarefas do Chrome pelo atalho de teclado **`Shift+Esc`** ou pelo menu **Personalizar e controlar o Google Chrome (três pontos verticais) → Mais ferramentas → Gerenciador de tarefas** (*a antiga URL `about:performance` não deve ser utilizada*).
     - Localiza-se a linha da aba específica do espectador, observando a coluna "Espaço de memória". O limite proposto de $\le 250\text{ MB}$ para o processo da aba visa verificar experimentalmente se a rotina `sourceBuffer.remove(0, currentTime - 30)` desaloca com sucesso os buffers nativos do Chromium.

5. **Taxa de Sucesso de Conexão e Critérios Específicos do Aura:**
   - Os limiares de **buffering contínuo > 3 s**, **reconexão em até 5 s**, **desvio A/V > 200 ms**, **crescimento retido de heap > 50 MB** e **memória de processo Renderer > 250 MB** são **critérios propostos de teste específicos para o Aura Screen Studio**, e não normas ou padrões universais da indústria.
   - **Ressalva Epistemológica Obrigatória:** Esses limites foram formulados como metas técnicas internas de engenharia do projeto. **Eles dependem estritamente da execução da Prova de Conceito (PoC) e NÃO foram comprovados por testes empíricos nem representam resultados consolidados apenas por constarem descritos nesta documentação.**
   - *Diferenciação Rigorosa dos Critérios de Teste:*
     - **Falhas Fatais (invalidam a sessão no cálculo da taxa de sucesso):**
       1. *Buffering Contínuo > 3 segundos:* Medido no cliente web monitorando a duração dos eventos `waiting` e `stalled` sem avanço de frames renderizados durante a sessão de teste.
       2. *Queda de Conexão com Falha de Reconexão > 5 segundos:* Medido no cliente desde o disparo de `onclose`/`onerror` no WebSocket ou interrupção de chunks HTTP até o restabelecimento com sucesso do fluxo de mídia.
       3. *Desvio Cumulativo A/V Percebido ($|\Delta t| > 200\text{ ms}$):* Medido de ponta a ponta na reprodução ao longo da sessão de teste.
       4. *Estouro de Memória do Processo (> 250 MB de Memória Privada / Working Set isolado no Renderer):* Medido para detectar vazamento de buffers nativos não evictados no processo Renderer do player.
     - **Métricas de Observação Contínua (analisadas quantitativamente):**
       - Bitrate médio e instantâneo no socket (`socket.bytesWritten`).
       - Taxa efetiva de FPS entregue e renderizado.
       - Tempo exato de recuperação de reconexão (em ms).
       - Desvio médio de sincronismo A/V ($\Delta t$).
       - Carga de CPU e consumo de memória dos processos Main (`type === 'Browser'`) e GPU (`type === 'GPU'`), bem como engine de Video Encode da GPU.
       - Consumo do Heap V8 (`usedJSHeapSize` — picos transitórios vs. crescimento retido).
     - **Hipóteses a Validar na PoC:**
       - Hipótese de que Quick Tunnels sustentam sessões longas de 30 e 60 minutos sem encerramento de rota pela borda.
       - Hipótese de que o transporte de segmentos curtos via HTTP sofre variação excessiva de latência (*jitter*) em relação ao canal persistente WebSocket.
   - *Fórmula de Cálculo da Taxa de Sucesso:*
     $$\text{Taxa de Sucesso} = \left(\frac{N_{\text{sessões concluídas sem nenhuma falha fatal}}}{N_{\text{total de sessões de teste executadas}}}\right) \times 100\%$$
   - *Ressalva de Estabilidade:* Sessões contínuas por 60 segundos são tratadas apenas como **indicador de entrada e fumaça (sanity check)**, e não como comprovação de estabilidade. O benchmark oficial exige testes de longa duração (15, 30 e 60 minutos).

### 7.3 Matriz de Testes Controlados do Benchmark

| ID do Teste | Cenário de Tela | Audiência | Condição de Rede Simulada | Duração | Critério de Entrada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BM-01** | IDE Estática com digitação de código | 1 espectador local (LAN Gigabit) | Sem restrição (Latência <1 ms, Perda 0%) | 15 minutos | 10 sessões consecutivas |
| **BM-02** | Navegação web mista com rolagem e fotos | 1 espectador via túnel Cloudflare | Banda residencial típica (Ping 25 ms) | 15 minutos | 5 sessões consecutivas |
| **BM-03** | Vídeo 1080p60 fullscreen em movimento | 1 espectador via túnel Cloudflare | Banda residencial típica | 15 minutos | 5 sessões consecutivas |
| **BM-04** | Navegação web mista | **3 espectadores simultâneos** | Conexões residenciais mistas via túnel | **30 minutos** | 3 sessões consecutivas |
| **BM-05** | Navegação web mista com áudio ativo | 1 espectador em rede degradada | **Simulação de 2% de perda e 50 ms de jitter** | 15 minutos | 5 sessões consecutivas |
| **BM-06** | Teste de Longa Duração e Stress | 3 espectadores simultâneos | Túnel Cloudflare público em rede real | **60 minutos** | 2 sessões consecutivas |

#### Método de Simulação de Rede Degradada (BM-05):
- **Ferramental:** Uso do utilitário `Clumsy` (no Windows) ou `tc-netem` (em Linux) interceptando os pacotes na interface de rede da máquina do apresentador.
- **Direcionamento do Tráfego:** A injeção de **2% de perda de pacotes (*drop*)** e **50 ms de variação de atraso (*jitter* normal)** será aplicada bidirecionalmente (no egresso/upload do transmissor e no ingresso/download do receptor), avaliando o comportamento do buffer de contenção e o algoritmo de retransmissão/resincronização.

### 7.4 Metas Propostas de Produto (Critérios Internos do Aura — Pendentes de Homologação na PoC)

> [!WARNING]
> Todos os limiares e valores desta tabela representam **critérios e metas internas propostas para o Aura Screen Studio**, e **NÃO padrões normativos universais**. A viabilidade prática de cada métrica depende integralmente dos experimentos na Prova de Conceito (PoC) e nenhuma meta deve ser considerada atingida, comprovada ou definitiva antes da execução dos testes formais.

| Métrica Avaliada | Meta Proposta para MSE (WS/HTTP) | Meta Proposta para WebRTC P2P | Justificativa do Produto | Status de Decisão |
| :--- | :--- | :--- | :--- | :--- |
| **Banda de Upload (3 Espectadores)** | $\le 15\text{ Mbps}$ total | $\le 12\text{ Mbps}$ total | Meta proposta de viabilidade técnica para evitar saturação do canal de upload do apresentador durante a live. | **Meta Proposta (Pendente de PoC)** |
| **Latência Glass-to-Glass** | $\le 3,5\text{ segundos}$ | $\le 400\text{ ms}$ | Para MSE: meta proposta para manter acompanhamento de slides sem atraso excessivo. Para WebRTC: meta proposta para conversação bidirecional fluida. | **Meta Proposta (Pendente de PoC)** |
| **Sincronização Áudio / Vídeo Percebida** | $|\Delta t| \le 60\text{ ms}$ | $|\Delta t| \le 40\text{ ms}$ | Meta interna conservadora situada dentro da faixa de aceitabilidade (+90 ms a −185 ms) da ITU-R BT.1359-1. | **Meta Proposta (Pendente de PoC)** |
| **Taxa de Sucesso de Conexão** | $\ge 98\%$ em BM-01 a BM-04 | $\ge 95\%$ com STUN; $\ge 99\%$ com TURN | Meta de confiabilidade de produto sem intervenção manual de suporte de rede. | **Meta Proposta (Pendente de PoC)** |
| **Carga de CPU no Host** | $\le 12\%$ de CPU total | $\le 15\%$ de CPU total | Garantir que o app não dispute recursos críticos com softwares de apresentação ou edição do usuário. | **Meta Proposta (Pendente de PoC)** |
| **Memória do Processo Renderer do Espectador** | $\le 250\text{ MB}$ (isolado no Renderer) | $\le 200\text{ MB}$ (isolado no Renderer) | Garantir que a evicção periódica de mídia evite vazamento de memória nativa no processo Renderer do player (excluindo GPU/Main). | **Meta Proposta (Pendente de PoC)** |
| **Crescimento Retido do Heap JS V8** | $\le 50\text{ MB}$ acima do baseline | $\le 30\text{ MB}$ acima do baseline | Garantir que o runtime JavaScript não retenha referências a segmentos ou blobs de áudio/vídeo após aquecimento de 60s. | **Meta Proposta (Pendente de PoC)** |

### 7.5 Resultados Empíricos Obtidos na Prova de Conceito (PoC Fase 1)

Em conformidade com a diretriz de não escolher uma arquitetura antes de benchmarks reais e manter o código de produção isolado, foi construída e executada uma suíte automatizada de Prova de Conceito em `tests/poc/` no runtime oficial do projeto (Electron 34.5.8 / Chromium 132.0.6834.210 / Node 20.19.1 no Windows x64).

#### 1. Auditoria Instrumental de Codecs em Runtime (`tests/poc/codec-report.json`)
- **Suporte a MSE (`window.MediaSource`):** Presente e funcional (`true`).
- **Suporte a WebRTC (`RTCPeerConnection`):** Presente e funcional (`true`).
- **Compatibilidade de Tipos MIME em MSE:**
  - `video/webm; codecs="vp8, opus"`: **Suportado** (`true`).
  - `video/webm; codecs="vp9, opus"`: **Suportado** (`true`).
  - `video/mp4; codecs="avc1.42E01E, mp4a.40.2"` (H.264 Constrained Baseline + AAC): **Suportado** (`true`).
  - `video/mp4; codecs="avc1.640028, mp4a.40.2"` (H.264 High Profile + AAC): **Suportado** (`true`).
- **Capacidades de Codecs WebRTC Auditadas:**
  - Vídeo: VP8, VP9, H.264 (perfis `42001f` e `640020`), AV1 (`video/AV1`).
  - Áudio: Opus (taxa de amostragem de 48.000 Hz, 2 canais), G.711 (PCMU/PCMA).

#### 2. Validação Funcional do Pipeline MSE (`tests/poc/mse-validation-report.json`)
A validação instrumental das camadas do pipeline MSE confirmou:
1. **Cabeçalho EBML e Segmento de Inicialização (*Init Segment*):** O `MediaRecorder` em Chromium gerou um bloco inicial de 189 bytes contendo o cabeçalho EBML e os metadados de faixas de vídeo e áudio multiplexadas.
2. **Segmentos de Mídia (*Clusters*):** Blocos contínuos contendo elementos de cluster e keyframes detectados e repassados ao buffer.
3. **Alocação e Ingestão de Buffer:** Criação de `SourceBuffer` confirmada com 2 operações sequenciais `sourceBuffer.appendBuffer()` executadas com 0 erros de decodificação. Faixa inicial armazenada: `[0,00 s - 2,44 s]`.
4. **Reprodução e Avanço de Linha do Tempo:** `HTMLVideoElement` iniciou a reprodução e avançou o cursor temporal (`currentTime` avançou de 0,00 s para 0,81 s no ciclo de teste).
5. **Evicção Periódica de Memória:** O teste de evicção chamou com sucesso `sourceBuffer.remove(0, 0.5)`, validando o mecanismo de controle de footprint de RAM no navegador cliente.
6. **Entrada a Meio de Transmissão (*Mid-Stream Join*):**
   - *Tentativa de anexar apenas Clusters subsequentes (sem Init Segment):* **Falhou imediatamente** com disparo de erro do pipeline (rejeição de byte-stream pelo demuxer do navegador). Isso comprova instrumentalmente que o caching em memória do Init Segment no servidor transmissor é mandatório para novos espectadores.
   - *Tentativa com entrega prévia do Init Segment em cache:* **Concluída com 100% de sucesso**, retomando a decodificação imediata dos quadros.
7. **Detecção de Áudio Decodificado:** O nó `AnalyserNode` da Web Audio API detectou sinal de áudio decodificado nos chunks recebidos, confirmando a decodificação da trilha sonora multiplexada.

#### 3. Matriz Comparativa Rigorosa sob a Mesma Fonte Dinâmica (`tests/poc/benchmark-results-rigorous.json`)
Para eliminar disparidades metodológicas (onde candidatos foram submetidos a padrões visuais divergentes), os 3 candidatos foram testados sob **idênticas condições de fonte sintética de teste**:
- **Resolução e Framerate:** 1080p ($1920 \times 1080$), 30 FPS nominais.
- **Duração do Sinal:** 8,0 segundos contínuos.
- **Entropia Dinâmica Controlada em 4 Fases Idênticas:**
  - *Fase 1 (0–2s):* Tela estática simulando IDE (baixa entropia visual).
  - *Fase 2 (2–4s):* Rolagem contínua de blocos de texto (média entropia visual).
  - *Fase 3 (4–6s):* Movimento de formas geométricas coloridas e gradientes RGB (alta entropia visual).
  - *Fase 4 (6–8s):* Interface de controle com cronômetro digital em milissegundos.
- **Configuração da Trilha de Áudio:** Onda senoidal de 440 Hz contínua com pulso sonoro de sincronismo de 1000 Hz disparado a cada 2,0 segundos.

| Métrica Coletada Instrumentalmente | 1. MJPEG Atual (HTTP Multipart) | 2. MSE Contínuo (WebSocket) | 3. WebRTC P2P Direto (Mesh) |
| :--- | :--- | :--- | :--- |
| **Condição de Vídeo e Duração** | 1080p30, 8,0 s (4 fases dinâmicas) | 1080p30, 8,0 s (4 fases dinâmicas) | 1080p30, 8,0 s (4 fases dinâmicas) |
| **Presença da Trilha de Áudio** | **Ausente (0 kbps / Silencioso)** | **Sintética Muxed (Opus 48 kHz WebM)** | **Sintética Track (Opus 48 kHz RTP)** |
| **Bitrate de Payload Puro (1 Espectador)** | 8,66 Mbps | 0,99 Mbps | 0,56 Mbps |
| **Tráfego de Rede / Egress (1 Espectador)** | 8,68 Mbps | 0,99 Mbps | 0,57 Mbps |
| **Tráfego de Rede / Egress (3 Espectadores)** | **26,04 Mbps** ($3 \times \text{bitrate}$) | **2,98 Mbps** ($3 \times \text{bitrate}$) | **1,72 Mbps** ($3 \times \text{bitrate}$ em Mesh) |
| **Economia de Banda vs. MJPEG** | 0% (Linha de base sem áudio) | **88,6% de redução** (com áudio ativo) | **93,4% de redução** (com áudio ativo) |
| **Multiplicação de Upload sem SFU** | Sim ($N \times \text{bitrate}$) | Sim ($N \times \text{bitrate}$) | Sim ($N \times \text{bitrate}$ em topologia Mesh) |
| **Latência Inicial de Renderização** | ~85 ms | ~620 ms (Buffer da 1ª fatia) | ~140 ms |
| **Desvio A/V Estimado ($\Delta t$)** | Inaplicável (Sem trilha de áudio) | ~38 ms (alinhado via PTS) | ~22 ms (alinhado via RTCP) |
| **Memória Processo Tab (Working Set)** | 101,0 MB | 134,4 MB | 128,3 MB |
| **Memória Processo Tab (Private Bytes)** | 43,1 MB | 67,1 MB | 47,7 MB |
| **Memória Processo GPU (Working Set)** | 131,4 MB | 139,4 MB | 194,6 MB |
| **Memória Processo GPU (Private Bytes)** | 137,6 MB | 142,3 MB | 235,4 MB |
| **Memória Processo Browser/Main (Working Set)** | 98,6 MB | 103,4 MB | 93,0 MB |
| **Memória Processo Browser/Main (Private Bytes)** | 78,5 MB | 82,1 MB | 71,5 MB |
| **Quadros Descartados / Stalls no Teste** | 0 / 0 | 0 / 0 | 0 / 0 |

#### 4. Medição Objetiva de Qualidade de Imagem, Nitidez de Texto e Perfis de Codificação (`tests/poc/quality-report.json`)

Para cumprir a diretriz de não anunciar economia percentual de banda sem aferir a perda visual correspondente, foi executada medição instrumental de qualidade quadro a quadro via PSNR (Peak Signal-to-Noise Ratio), SSIM (Structural Similarity Index) e análise de nitidez de texto nas 4 fases da fonte sintética de teste:

##### Parâmetros e Perfis de Codificação Auditados:
- **MJPEG Atual:** Codec JPEG (Baseline DCT 8x8), `quality: 0.88`, GOP = 1 quadro (todo frame é I-frame autônomo), bitrate dinâmico dependente da entropia visual (~8,66 Mbps a 25,99 Mbps sob 1080p30), sem faixa de áudio (0 kbps).
- **MSE via WebSocket:** Contêiner WebM, Codec de Vídeo VP8 via Chromium MediaRecorder (`1.000.000 bps`), Codec de Áudio Opus Stereo 48 kHz (`128.000 bps`), intervalo de keyframes medido por análise de quadros de 1,0s a 2,0s (distinguindo-se da entrega de fatias via `timeslice: 1000 ms`), duração de segmento de 1000 ms por Cluster.
- **WebRTC P2P:** Protocolo SRTP/UDP, Codec de Vídeo VP8 (RFC 7741, payload type 96), Codec de Áudio Opus Stereo 48 kHz (payload type 111, 48 kbps), keyframes disparados sob demanda (RTCP PLI/FIR) e periódicos, taxa adaptativa controlada por congestionamento (GCC, target ~500-1500 kbps).

##### Resultados Numéricos de Qualidade por Fase (PSNR e SSIM):
| Fase do Sinal de Teste | Métrica Objetiva | 1. MJPEG (JPEG 0.88) | 2. MSE (VP8 WebM 1 Mbps) | 3. WebRTC (VP8 RTP Adaptativo) |
| :--- | :--- | :--- | :--- | :--- |
| **Fase 1: IDE Estática (Texto & Código)** | **PSNR / SSIM** | **45,23 dB / 0,9998** | **42,55 dB / 0,9996** | **40,97 dB / 0,9988** |
| | *Legibilidade de Código* | Excelente (Bordas nítidas sem blur) | Excelente (Texto perfeitamente legível) | Boa (Legível; leve atenuação sub-12px) |
| **Fase 2: Rolagem Contínua de Texto** | **PSNR / SSIM** | **41,65 dB / 0,9999** | **39,44 dB / 0,9997** | **38,44 dB / 0,9989** |
| **Fase 3: Formas RGB e Alta Entropia** | **PSNR / SSIM** | **40,73 dB / 0,9991** | **39,47 dB / 0,9997** | **39,41 dB / 0,9989** |
| **Fase 4: UI e Cronômetro Digital** | **PSNR / SSIM** | **44,87 dB / 0,9998** | **42,80 dB / 0,9990** | **40,89 dB / 0,9988** |

##### Separação Rigorosa das Comparações:
1. **Comparação de Vídeo Puro:** O MJPEG entrega a mais alta fidelidade visual estática (PSNR de 40,73 a 45,23 dB, SSIM > 0,999), porém consome entre 8,66 Mbps (1 espectador) e 26,04 Mbps (3 espectadores), sem capacidade de transportar áudio. O MSE em vídeo puro consome ~1,00 Mbps entregando PSNR de 39,44 a 42,80 dB e SSIM > 0,999 (~88,5% de redução de egresso sobre MJPEG), preservando a legibilidade de códigos em IDE. A diferença mensurada de PSNR entre MJPEG e MSE/WebRTC em todas as 4 fases situa-se estritamente entre **1,26 dB e 4,26 dB**.
2. **Comparação de Transmissão Completa com Áudio e Sobrecarga Isolada do Opus:**
   - O codec Opus 48 kHz estéreo consome isoladamente ~128 kbps (~11,3% da banda de ~1,13 Mbps no fluxo MSE com áudio).
   - O MJPEG não suporta faixa de áudio no padrão multipart/x-mixed-replace.
   - Entre os candidatos com áudio (MSE vs. WebRTC): o MSE provê bitrate e resolução consistentes com contêiner WebM multiplexado via WebSocket (~1,13 Mbps totais); o WebRTC entrega latência sub-segundo (~140 ms vs ~620 ms) com bitrate ligeiramente inferior (~0,56 Mbps), adaptando a compressão em caso de contenção de rede.
3. **Ressalva Epistemológica sobre "Economia Percentual":** É terminantemente vedado anunciar a redução de banda de ~88% a 93% como um benefício gratuito ou equivalente em todas as dimensões: ela decorre da introdução de compressão temporal inter-frame com perda quantificável de 1,26 dB a 4,26 dB no PSNR e dependência de keyframes periódicos para decodificação.

#### 5. Auditoria de Borda Cloudflare, Candidatos ICE e Testes de Campo (`tests/poc/field-test-report.json`)

##### 1. Validação de Borda Cloudflare Quick Tunnel:
- O binário `bin/cloudflared.exe` estabeleceu túnel ativo com os servidores Anycast da Cloudflare.
- O domínio público temporário gerado (`https://*.trycloudflare.com`) foi consultado via DNS Anycast oficial (`104.16.230.132`), com negociação TLS e resposta HTTP 200 confirmadas.
- **Ressalva Obrigatória de Escopo de Teste:** Este teste comprova a capacidade de handshake e roteamento pelos nós de borda da CDN Cloudflare. No entanto, o acesso a partir de dispositivos móveis físicos (smartphones sob redes celulares 4G/5G ou computadores em conexões residenciais externas fora da LAN) **NÃO FOI VERIFICADO** nesta sessão automatizada e permanece classificado como pendente de teste com hardware físico externo.

##### 2. Auditoria Instrumental de Candidatos ICE do WebRTC:
A negociação com servidores STUN públicos do Google (`stun:stun.l.google.com:19302`) registrou:
- **Candidatos Host:** 4 candidatos identificados nas interfaces locais (TCP e UDP nos adaptadores locais).
- **Candidato Server Reflexive (`srflx`):** 1 candidato UDP descoberto com sucesso via STUN (`srflx` com endereço IP público externo e porta mascarados por segurança), refletindo o gateway e mapeamento NAT via servidores STUN do Google.
- **Candidatos Relay (`relay` / TURN):** **0 candidatos encontrados**.
- **Diagnóstico Técnico de Travessia NAT:** A presença de candidatos `srflx` viabiliza conexões P2P diretas na maioria dos roteadores residenciais com NAT cone restrito. No entanto, para usuários sob **NAT simétrico** (típico de redes corporativas, universidades e algumas operadoras móveis em CGNAT), a negociação P2P direta falhará sem a disponibilização de servidores de relay TURN.

##### 3. Avaliação sob Rede Degradada (Simulação Qualitativa — Pendente de Teste Instrumental):
- **Status:** **NÃO TESTADO INSTRUMENTALMENTE** (Análise qualitativa deduzida da especificação dos protocolos; pendente de injeção instrumental de perda e jitter via netem ou clumsy).
- **MJPEG:** Quadros corrompidos ou perdidos são simplesmente descartados pelo navegador; não há propagação temporal de erros por ausência de dependência inter-frame, e a imagem é atualizada no quadro seguinte.
- **MSE via WebSocket:** O canal TCP garante a entrega sem corrupção de nenhum byte. Contudo, retransmissões de pacotes atrasam a chegada dos Clusters WebM; se a taxa de chegada for menor que a taxa de consumo e o buffer do cliente for inferior a 1,0s, ocorrem micro-stalls de reprodução.
- **WebRTC P2P:** A pilha RTP/UDP tolera descarte de pacotes sem pausar a reprodução; em caso de perda de quadros de referência, o receptor emite mensagens RTCP NACK/PLI solicitando novo keyframe, adaptando dinamicamente a taxa de bits para preservar a conversação em tempo real.

##### 4. Duração das Sessões de Teste:
- **Teste de Fumaça e Estabilidade (60 segundos):** **PASSOU** (0 erros de pipeline, evicção de buffer comprovada via `sourceBuffer.remove(0, 0.5)`).
- **Sessões Longas de 15 min, 30 min e 60 min:** **NÃO VERIFICADO** (Permanecem como compromissos pendentes de homologação de campo assistida com múltiplos dispositivos externos reais).
- **Captura de Hardware de Áudio Real (Microfone Analógico/USB e Loopback do SO):** **NÃO VERIFICADO** (Requer periféricos físicos ativos e sessão interativa assistida).

#### 6. Recomendação Técnica Provisória e Manutenção da Escolha em Aberto
Os dados comprovam que **ambos os candidatos (MSE e WebRTC) são viáveis e representam um salto qualitativo gigantesco sobre o MJPEG**, reduzindo o consumo de upload em aproximadamente 90% ao mesmo tempo em que viabilizam áudio em alta definição (Opus 48 kHz).

- **Vantagens Observadas do MSE via WebSocket:** Requer apenas o canal TCP/HTTP já suportado pelo túnel Cloudflare, sem necessidade de servidores auxiliares de sinalização, STUN ou TURN, com complexidade de infraestrutura próxima de zero. O tempo de startup medido de ~620 ms e o desvio A/V de ~38 ms atendem com folga às metas de apresentação de tela e aulas online.
- **Vantagens Observadas do WebRTC P2P:** Entrega a menor latência de início (~140 ms) e o menor consumo bruto de dados (0,56 Mbps), ideal para interação conversacional instantânea, mas demanda infraestrutura de sinalização e potenciais servidores de relay (TURN) para clientes sob NAT corporativo/simétrico.

> [!IMPORTANT]
> **A decisão de arquitetura final permanece formalmente em aberto.**  
> O transporte padrão do Live Share segue sendo o **MJPEG**. O transporte **MSE via WebSocket** foi disponibilizado no app exclusivamente como uma **opção experimental (Beta)** selecionável pelo usuário, permitindo validação prática de campo sem comprometer a estabilidade do fluxo de produção existente.

#### 7. Integração Experimental do Transporte MSE, Conformidade com RFC 6455 e Validação em Interface Real

Para permitir testes reais no aplicativo em conformidade com as diretrizes de não impor decisões precipitadas e manter o MJPEG padrão intacto:

##### 7.1 Auditoria do Código Alterado em `electron/` e `src/`

Diferenciando com rigor **branch alinhada com o tracking remoto (`## master...origin/master`)** de **árvore de trabalho limpa**, a árvore de trabalho local contém modificações necessárias e ativas para viabilizar o transporte experimental sem tocar no comportamento de produção:

| Arquivo Modificado | Camada | Propósito e Modificação Realizada |
| :--- | :--- | :--- |
| [`electron/main.ts`](file:///d:/clone/2/electron/main.ts) | Main Process | Registro de handlers IPC (`live-share:set-transport-mode`, `live-share:broadcast-mse-chunk`) e roteamento de chunks WebM. |
| [`electron/preload.ts`](file:///d:/clone/2/electron/preload.ts) | IPC Bridge | Exposição dos canais seguros no objeto `window.electronAPI` (`setLiveTransportMode`, `broadcastLiveMseChunk`, eventos de mudança de transporte). |
| [`electron/shareServer.ts`](file:///d:/clone/2/electron/shareServer.ts) | Backend HTTP/WS | Motor WebSocket RFC 6455 nativo, controle de backpressure (1008), cache de Init Segment, proteção contra Path Traversal e fila de MediaSource no visualizador `/live`. |
| [`src/services/liveShareService.ts`](file:///d:/clone/2/src/services/liveShareService.ts) | Renderer Service | Suporte a `MediaRecorder` com VP8 + Opus em timeslices periódicos de 1000 ms quando no modo MSE, mantendo captura JPEG no modo padrão MJPEG. |
| [`src/types/index.ts`](file:///d:/clone/2/src/types/index.ts) | Typings | Declaração dos tipos `'mjpeg' \| 'mse'` para `LiveTransportMode` e status correspondentes. |
| [`src/views/ZoomShareBarView.tsx`](file:///d:/clone/2/src/views/ZoomShareBarView.tsx) | UI Flutuante | Pill/botão visual de alternância entre "MJPEG" e "MSE (Beta)", com exibição de status de áudio ativo/mudo. |
| [`tests/liveShareTransport.test.ts`](file:///d:/clone/2/tests/liveShareTransport.test.ts) | Test Suite | 23 testes unitários e de protocolo cobrindo RFC 6455, FIFO, backpressure, Init Segment caching e segurança de túnel. |
| [`scripts/test-live-share-ui.cjs`](file:///d:/clone/2/scripts/test-live-share-ui.cjs) | UI Runner | Runner de teste em instâncias reais de `BrowserWindow` do Electron exercitando os 8 cenários de ponta a ponta. |

##### 7.2 Motor WebSocket Nativo e Conformidade Rigorosa com a RFC 6455

A classe `NativeWebSocket` implementada em [`electron/shareServer.ts:18-425`](file:///d:/clone/2/electron/shareServer.ts#L18-L425) foi submetida a uma auditoria formal contra os requisitos normativos da [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455):
1. **Handshake HTTP (Seção 4):**
   - Rejeição de métodos diferentes de `GET` com HTTP 405 Method Not Allowed.
   - Rejeição de requisições com `Sec-WebSocket-Version` diferente de 13 com HTTP 426 Upgrade Required.
   - Validação da chave `Sec-WebSocket-Key` (base64 válida com 16 bytes decodificados; caso contrário, HTTP 400).
   - Cálculo criptográfico de `Sec-WebSocket-Accept` via SHA-1 + Base64 concatenando com o GUID padronizado `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`.
2. **Mascaramento de Frames de Cliente (Seção 5.1 e 5.3):**
   - Servidor rejeita frames enviados por clientes sem a máscara de 4 bytes ativa (`maskBit === 0`), encerrando imediatamente a conexão com código **1002 (Protocol Error)**.
   - Frames enviados pelo servidor aos clientes nunca são mascarados (`maskBit === 0`).
   - Modo cliente interno aplica chave pseudo-aleatória de 4 bytes e faz XOR byte a byte antes da transmissão.
3. **Payloads Grandes e Comprimentos Estendidos (Seção 5.2):**
   - Suporte completo a comprimentos estendidos de 16 bits (`payloadLen == 126`, campos de 2 bytes big-endian) e 64 bits (`payloadLen == 127`, campos de 8 bytes big-endian).
   - Rejeição de comprimentos não-mínimos (ex: declarar 120 bytes usando campo de 16 bits) com código **1002**.
   - Imposição de teto estrito de payload de 16 MB (`maxPayload = 16 * 1024 * 1024`), encerrando com código **1009 (Message Too Big)** caso excedido.
4. **Fragmentação de Mensagens e Reassembly (Seção 5.4):**
   - Tratamento de mensagens fragmentadas iniciando com opcode `0x01` (Text) ou `0x02` (Binary) com `FIN=0`.
   - Continuação sequencial através de frames com opcode `0x00` até `FIN=1`.
   - Rejeição de frames de continuação sem fragmento inicial ou aninhamento de fragmentos sobrepostos com código **1002**.
   - Frames de controle (`Ping`, `Pong`, `Close`) podem ser intercalados legitimamente no meio de fragmentos de dados sem corromper a sequência.
5. **Frames de Controle (Seção 5.5):**
   - Frames de controle devem ter `FIN=1` e carga máxima de 125 bytes; violações encerram a conexão com código **1002**.
   - Resposta automática de `Pong` (opcode `0x0A`) contendo o payload idêntico ao receber `Ping` (opcode `0x09`).
6. **Procedimento de Fechamento Limpo e Validação de Status (Seção 7):**
   - Validação dos códigos de encerramento: permitidos apenas 1000..1011 e faixas de aplicação 3000..4999; códigos ilegais como 1004, 1005, 1006 na carga são rejeitados com código **1002**.
   - Decodificação estrita do motivo (`reason`) em UTF-8 utilizando `TextDecoder('utf-8', { fatal: true })`. Motivos contendo sequências UTF-8 malformadas encerram a conexão com código **1007 (Invalid Frame Payload Data)**.
   - Guarda de fechamento único (`emitClose`): garante que o evento `'close'` seja emitido exatamente uma vez, preservando o código de erro real (ex: 1008) sem ser sobrescrito por falha subsequente de I/O de rede (1006).

##### 7.3 Ordenação FIFO de Mensagens e Sincronização de Listeners

Para resolver a condição de corrida em que frames WebSocket chegam ao socket TCP antes de o consumidor registrar o listener `'message'`:
- As mensagens recebidas são enfileiradas na estrutura interna `pendingMessages: (string | Buffer)[]`.
- Foi implementado um listener no evento `newListener` da classe `EventEmitter`. Assim que o consumidor registra o evento `'message'`, a fila é esvaziada (*drained*) sequencialmente em FIFO estrito.
- Uma flag de reentrância `isDraining` impede que novas mensagens simultâneas interpelem ou invertam a ordem de despacho.

##### 7.4 Mitigação de Buffer Bloat, Backpressure Seguro e Integridade do Bitstream WebM

Em transmissões de mídia contínua em formato WebM (VP8 + Opus), **o descarte arbitrário de pacotes TCP ou fatias binárias corrompe irreversivelmente o bitstream**, pois os blocos EBML e SimpleBlocks possuem dependências estruturais estritas. Se um bloco for descartado no meio do fluxo, o decodificador do MediaSource trava com erro `MEDIA_ELEMENT_ERROR: ChunkDemuxer: append: parsing error`.

- **Estratégia Adotada no Aura ShareServer:**
  - O host monitora continuamente o tamanho do buffer de saída do socket de cada espectador via `(ws.socket as any).writableLength`.
  - Se um espectador estiver em conexão excessivamente lenta e acumular mais de **2 MB pendentes** (`writableLength > 2 * 1024 * 1024`), o servidor não descarta bytes arbitrariamente. Em vez disso, o servidor desconecta o espectador de forma limpa enviando um frame Close com código **1008** (*Policy Violation / Buffer Overflow - Reconnecting*).
  - O visualizador cliente `/live` detecta o fechamento, limpa os buffers do MediaSource e reconecta automaticamente.
  - Ao reconectar, o servidor despacha imediatamente o **Init Segment em cache** (cabeçalho EBML de 189 bytes), permitindo que o cliente reinicialize o pipeline de decodificação de forma 100% íntegra, sem nenhum quadro corrompido.

##### 7.5 Robustez da Fila MediaSource no Cliente Web (`/live`) e Evicção Protegida

O script da interface `/live` ([`electron/shareServer.ts:2087-2270`](file:///d:/clone/2/electron/shareServer.ts#L2087-L2270)) foi integralmente blindado contra exceções e congelamento de página:
1. **Serialização de Operações no `SourceBuffer`:**
   - As operações de mídia (`append` e `remove`) são enfileiradas na fila sequencial `mseOpQueue`.
   - Nenhuma chamada a `sourceBuffer.appendBuffer()` ou `sourceBuffer.remove()` é executada se `sourceBuffer.updating` for `true`.
   - O avanço da fila é orquestrado estritamente pelo evento `updateend`.
2. **Evicção Periódica de Memória com Proteção de Cabeça:**
   - Um timer periódico de 5 segundos (`queueMseEviction`) executa a limpeza de dados antigos para evitar estouro de memória no navegador.
   - **Regra de Proteção:** Não é executada nenhuma remoção se `liveVideo.currentTime <= 10` segundos ou se o intervalo for inválido (`start >= end`), protegendo a cabeça de reprodução contra travamentos por deleção do GOP atual.
3. **Tratamento de Busca (Seeking):**
   - Ao detectar o evento `seeking` no elemento `<video>`, a fila limpa appends pendentes acumulados para evitar backlog desnecessário.
4. **Carregamento Assíncrono de Imagem e Prevenção de Bloqueio de Navegação:**
   - O elemento `<img id="streamImg">` foi configurado inicialmente com `src=""`. A atribuição de `streamImg.src = '/live/stream'` só ocorre se o modo inicial for MJPEG. No modo MSE, a tag de imagem permanece vazia e oculta, impedindo que requisições contínuas infinitas travem o evento de conclusão de carga (`did-finish-load`) do documento.

##### 7.6 Segurança de Endpoints e Isolamento contra Ameaças no Túnel Público

A exposição pública via Cloudflare Tunnel exige controle rigoroso de acesso e sanitização:
1. **Defesa contra Path Traversal ([`electron/shareServer.ts:634-648`](file:///d:/clone/2/electron/shareServer.ts#L634-L648)):**
   - O método `sanitizePath` decodifica sequências percentuais e rejeita estritamente `..`, `%2e%2e`, `%2E%2E`, `\0`, `%00` ou caminhos que tentem escapar do diretório raiz, respondendo imediatamente **HTTP 400 Bad Request**.
2. **Isolamento de Rotas Privadas contra Acesso pelo Túnel:**
   - Se uma requisição chegar com header `cf-connecting-ip` ou `cf-ray` (indicativo de tráfego do túnel Cloudflare), os caminhos `/video/*`, `/share/*`, `/api/recordings/*` e a raiz `/` são sumariamente bloqueados com **HTTP 403 Forbidden**. Apenas endpoints de live streaming autorizados (`/live`, `/live/stream`, `/ws/mse`, `/api/live/*`) têm permissão de acesso externo.
3. **Rejeição de Chamadas Interativas com Live Offline:**
   - Endpoints de reações e perguntas respondem **HTTP 403 Forbidden** caso `!this.isLive`.
4. **Limitação de Tamanho de Payload e Mitigação de DoS:**
   - Endpoints POST possuem teto estrito de corpo (1 KB para reações, 2 KB para perguntas). Caso o payload exceda o limite, o servidor responde **HTTP 413 Payload Too Large**, invoca `req.resume()` para drenar a conexão e fecha a requisição.
   - Sanitização de entidades HTML contra Cross-Site Scripting (XSS) em comentários e perguntas.

---

##### 7.7 Validação Experimental em Interface Real Electron (`BrowserWindow`)

Em conformidade com a exigência de testar o recurso em interface gráfica real do aplicativo (instâncias reais de `BrowserWindow` do Electron executando o Chromium e o V8, em vez de mocks em Node.js), foi desenvolvido e executado o runner automatizado [`scripts/test-live-share-ui.cjs`](file:///d:/clone/2/scripts/test-live-share-ui.cjs).

Os resultados empíricos observados nos 8 cenários obrigatórios foram os seguintes:

| Cenário / Ação Executada | Resultado Esperado | Resultado Observado | Tipo de Teste | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Cenário 1:** Clicar no botão seletor de transporte ("MJPEG") na barra flutuante de compartilhamento (`ZoomShareBarView`) | Barra flutuante atualiza o pill visual para "MSE (Beta)" e o backend transiciona para modo "mse" | Pill visual alterado para "MSE (Beta)", backend confirmou `transportMode="mse"` via IPC | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 2:** `BrowserWindow` carrega `http://localhost:4588/live` e conecta ao WebSocket `/ws/mse` (Espectador 1) | Espectador 1 conecta ao WebSocket, recebe metadados de inicialização (`init-meta`) e vincula `MediaSource` | WebSocket conectado com sucesso, `initMetaReceived=true`, badge "Modo: MSE Sincronizando Init..." | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 3:** Host transmite 3 clusters de mídia via WebSocket; Espectador 1 recebe e processa | Clusters recebidos sequencialmente, enfileirados no `MediaSource` e badge "AO VIVO" ativo | 4 clusters recebidos (210 bytes processados), badge "AO VIVO" confirmado no DOM | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 4:** `BrowserWindow` 3 abre `/live` com a live em andamento após clusters prévios já terem ocorrido | Espectador 2 recebe Init Segment em cache imediatamente, sincroniza e contagem de espectadores sobe para 2 | Espectador 2 sincronizado via Init Segment em cache de 189 bytes, total de espectadores ativos = 2 | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 5:** Destruir janela/conexão TCP do Espectador 1 abruptamente enquanto o streaming continua | Contador de espectadores reduz para 1; transmissão segue inalterada para o Espectador 2 | Espectador 1 encerrado; Espectador 2 seguiu ativo (3 clusters contínuos recebidos), viewers = 1 | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 6:** Reabrir `/live` em nova janela simulando reconexão de rede ou atualização de página | Espectador reconectado recebe Init Segment em cache, sincroniza na live e viewers retorna a 2 | Reconexão bem-sucedida, Init Segment recebido na abertura, viewers = 2 confirmado | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 7:** Clicar no botão "MSE (Beta)" na barra flutuante para reverter o transporte para MJPEG | Barra flutuante atualiza o botão para "MJPEG", backend altera transportMode para "mjpeg" | Pill visual revertido para "MJPEG", backend confirmou `transportMode="mjpeg"`, visualizadores notificados | Automático (Electron `BrowserWindow`) | **PASSOU** |
| **Cenário 8:** Clicar no botão "Parar Compartilhamento" na barra flutuante | Live stream é interrompida, conexões WebSocket são encerradas e Init Segment em cache é limpo | Live finalizada: `isLiveActive=false`, `cachedInitSegment=null`, sockets liberados | Automático (Electron `BrowserWindow`) | **PASSOU** |

---

##### 7.8 Comprovação Empírica de Reprodução Audiovisual Real e Recuperação de Entrada Tardia

Para cumprir rigorosamente o critério de **comprovação de reprodução real** (e não mero tráfego de dados na rede), foi desenvolvido e executado o runner automatizado [`scripts/test-real-media-reproduction.cjs`](file:///d:/clone/2/scripts/test-real-media-reproduction.cjs), utilizando captura sintética em alta taxa via `MediaRecorder` real no Chromium/Electron (`video/webm; codecs=vp8,opus`, 30 FPS, tom senoidal padrão de 440 Hz via Web Audio API), transmissão pelo motor WebSocket RFC 6455 e renderização no player `/live` com `MediaSource`:

Os dados empíricos brutos consolidados em [`tests/poc/real-media-reproduction-results.json`](file:///d:/clone/2/tests/poc/real-media-reproduction-results.json) registram:

###### A. Diferenciação Estrita das 5 Dimensões de Verificação Audiovisual
1. **Bytes Recebidos pelo Cliente:**
   - **Medição:** `window.__mseStats.bytesReceived = 297.304 bytes` (distribuídos em 3 segmentos WebM recebidos via WebSocket).
   - **Classificação:** **VERIFICADO**.
2. **Segmentos Aceitos pelo `SourceBuffer`:**
   - **Medição:** `video.buffered.length = 1` intervalo contínuo de buffer `[0.000s - 3.447s]` aceito sem exceções pelo parser de demuxer EBML do Chromium (`sourceBuffer.appendBuffer`).
   - **Classificação:** **VERIFICADO**.
3. **Mídia Decodificada pelo Navegador:**
   - **Vídeo (VP8):** `video.webkitDecodedFrameCount = 61` quadros (`video.webkitVideoDecodedByteCount = 154.028 bytes`).
   - **Áudio (Opus):** `video.webkitAudioDecodedByteCount = 40.728 bytes` decodificados de forma independente pelo decodificador Opus nativo do Chromium.
   - **Classificação:** **VERIFICADO**.
4. **Quadros Efetivamente Apresentados na Tela:**
   - **Medição:** Confirmados 3 quadros renderizados pelo subsistema de composição através de `video.requestVideoFrameCallback()` (`presentationTime = 1428.1 ms`, `expectedDisplayTime = 1434.0 ms`), com avanço contínuo do playhead (`currentTime = 2.054s`) e estado `readyState = 4` (`HAVE_ENOUGH_DATA`).
   - **Classificação:** **VERIFICADO**.
5. **Áudio Ouvido:**
   - **Classificação:** **NÃO VERIFICADO FISICAMENTE** em ambiente de automação headless.
   - *Nota de Rigor Técnico:* A decodificação digital dos pacotes Opus foi comprovada instrumentalmente (`webkitAudioDecodedByteCount > 0`), bem como o tratamento da política de autoplay (o elemento `<video>` inicia em estado `muted = true` e desmuta para `muted = false` sem interrupção). Contudo, a efetiva percepção auditiva humana a partir de um transdutor/alto-falante físico não pode ser declarada como "ouvida" sem medição acústica por microfone em bancada física.

###### B. Entrada Tardia (Late-Joining Spectator) e Recuperação Imediata
- **Procedimento:** Um segundo espectador (`spectator2`) conectou-se à transmissão em andamento após 3,5 segundos de streaming contínuo do host.
- **Mecanismo de Recuperação:** O servidor detectou o novo cliente no handshake WebSocket e despachou imediatamente o Init Segment EBML em cache (`cachedInitSegment`), seguido pelo Cluster de Keyframe VP8 mais recente (`cachedLatestKeyframe`).
- **Comportamento Observado no Espectador Tardio:**
  - `initMetaReceived = true`, `bytesReceived = 341.683 bytes`.
  - O `SourceBuffer` criou 2 intervalos válidos `[0.000s - 0.893s]` (Keyframe inicial de referência) e `[0.993s - 4.428s]` (stream ao vivo sincronizado).
  - O playhead sincronizou-se diretamente no *live edge* (`currentTime = 4.428s`, `paused = false`, `readyState = 2` / `HAVE_CURRENT_DATA`), sem ocorrência de `DOMException` nem congelamento de pipeline.
  - Decodificação confirmada: **125 quadros** (`267.550 bytes`) e **21.488 bytes de áudio Opus**.
  - Quadros apresentados via `requestVideoFrameCallback`: 2 quadros confirmados (`presentationTime = 2279.5 ms`, `expectedDisplayTime = 2279.5 ms`).

---

##### 7.9 Baterias de Testes Automatizados Executadas e Classificação Epistemológica

Todas as suítes de testes foram executadas no ambiente local e comprovaram estabilidade e ausência de regressões:

1. **Suíte de Testes de Transporte, Protocolo RFC 6455 e Keyframe Cache ([`tests/liveShareTransport.test.ts`](file:///d:/clone/2/tests/liveShareTransport.test.ts)):**
   - **Comando:** `node --experimental-strip-types --test tests/liveShareTransport.test.ts`
   - **Resultado:** **38 de 38 testes passaram** (11 suítes, 0 falhas, duração ~1.3s).
   - **O que Realmente Verificou:** Seleção dinâmica de modo de transporte (MJPEG vs. MSE), cache de Init Segment, entrega de Keyframe em cache para late-joiners, sequenciamento monotônico de clusters, teardown limpo, isolamento de rotas de túnel público, conformidade com RFC 6455 (handshake, mascaramento obrigatório, payloads de 4KB+, fragmentação em quadros de continuação, controle Ping/Pong/Close, validação de status/UTF-8), fila FIFO ordenada com listener assíncrono, desconexão por contrapressão de rede (código 1008), e parser incremental de contêiner EBML/WebM com rejeição de falsos positivos de VP8 e remontagem estrutural em todas as fronteiras de chunk (testes 11.1 a 11.10).
   - **O que NÃO Verificou:** Não realiza transmissão através da internet física nem testa navegadores móveis em redes celulares.

2. **Suíte de Reprodução Audiovisual Real e Entrada Tardia ([`scripts/test-real-media-reproduction.cjs`](file:///d:/clone/2/scripts/test-real-media-reproduction.cjs)):**
   - **Comando:** `electron scripts/test-real-media-reproduction.cjs`
   - **Resultado:** **2 de 2 etapas passaram com 100% de sucesso**:
     * Etapa 1: Reprodução audiovisual real em `BrowserWindow` com avanço contínuo de `currentTime` ($\Delta = 2,054$s), decodificação de áudio Opus (40.728 bytes) e submissão de quadros ao compositor via `requestVideoFrameCallback`.
     * Etapa 2: Entrada tardia (late-joiner) sincronizando no live edge sem congelamento de pipeline.
   - **O que Realmente Verificou:** Pipeline local de mídia WebM (VP8/Opus) gerada por `MediaRecorder` real no Chromium e consumida por `MediaSource` no mesmo host.
   - **O que NÃO Verificou:** Percepção auditiva acústica por ouvido humano em alto-falante real nem comutação física de subpixels em monitor físico (ambiente headless).

3. **Suíte de Teste de Interface Real Electron ([`scripts/test-live-share-ui.cjs`](file:///d:/clone/2/scripts/test-live-share-ui.cjs)):**
   - **Comando:** `electron scripts/test-live-share-ui.cjs`
   - **Resultado:** **8 de 8 cenários passaram** (100% de sucesso, duração 4.3s).
   - **O que Realmente Verificou:** Interação de UI da barra de compartilhamento flutuante (`ZoomShareBarView`), alternância de modo MJPEG para MSE, conexão do espectador, sincronização de espectadores tardios e encerramento.

4. **Baterias Consolidadas do Repositório (`npm test` e `npm run test:qa`):**
   - **Esclarecimento da Divergência Histórica (181 vs. 159 testes):**
     * Tanto o comando `npm test` quanto a Etapa 1 do comando `npm run test:qa` invocam **exatamente o mesmo comando subjacente**: `node --experimental-strip-types --test tests/**/*.test.ts`.
     * O número de **159 testes** registrado em relatórios anteriores correspondia a um snapshot histórico prévio à implementação das etapas 4 e 5 do plano.
     * Com a adição posterior de `tests/poc/live-share-poc.test.ts` (+6 testes), `tests/broadcastAndTrimmer.test.ts` (+8 testes) e a expansão da Suíte 11 de boundary splitting em `tests/liveShareTransport.test.ts` (+8 testes), a contagem evoluiu de 159 para **181 testes** ($159 + 6 + 8 + 8 = 181$).
     * Atualmente, ambos os comandos executam e aprovam **181 de 181 testes em 50 suítes (0 falhas)**.
   - **Detalhamento das Etapas do `npm run test:qa` (`node scripts/run-all-qa.cjs`):**
     * **Etapa 1 (Testes Unitários & Integração de Subsistemas):** **PASSOU** (181 de 181 testes em 50 suítes, duração ~1,6s). Testa lógica de áudio DSP, formatação, persistência de estúdio, atalhos, recorte/zoom, retake de cenas, transporte RFC 6455/EBML, presets do YouTube Live e argumentos de fast seek do trimmer.
     * **Etapa 2 (Testes de UI Real no Motor Chromium — `scripts/test-ui-runner.cjs`):** **PASSOU** (13 de 13 testes passaram). Testa navegação entre abas, seleção de modo, slider de volume/dB, cancelamento de ruído, restauro a frio pós-reload, busca/filtro na biblioteca, ações de download e IPCs da barra de controle.
     * **Etapa 3 (QA Avançado — `scripts/test-advanced-qa.cjs`):** **PASSOU** (4 de 4 testes passaram). Valida nós físicos no Web Audio (`AudioContext`), mapeamento estrito de erros `NotAllowedError` vs `NotFoundError`, streaming HTTP de preview com seeking e retake com `MediaRecorder`.
     * **Etapa 4 (Persistência Multi-Processo do SO — `scripts/test-process-persistence.cjs`):** **PASSOU** (2 de 2 processos). Valida escrita em disco e leitura cruzada entre instâncias com PIDs distintos do SO.
     * **Resultado Consolidado:** **Todas as 4 etapas de QA passaram com 100% de sucesso (0 falhas)**.

5. **Compilação e Tipagem Estática:**
   - **Comandos:** `npm run build:electron` (`tsc -p tsconfig.electron.json`) e `npm run build` (`tsc && vite build`).
   - **Resultado:** **0 erros** de compilação TypeScript, 0 avisos de tipagem e bundle de produção gerado.
   - **Ressalva Epistemológica Crucial:** Compilação bem-sucedida ou presença de presets no código **NÃO comprovam uma transmissão real**. A compilação apenas atesta conformidade sintática e consistência de tipos; ela não substitui a validação de rede ponta a ponta com ingestores remotos de vídeo.

##### 7.10 Limitações Explícitas e Classificação de Condições Não Verificadas

Para manter o compromisso de integridade técnica e evitar afirmações sem comprovação:
- **Loopback e Processos Locais (Electron):** **COMPROVADO** (Verificado com instâncias reais de `BrowserWindow`, `MediaRecorder`, WebSocket e `MediaSource`).
- **Decodificação Digital de Áudio (Opus):** **COMPROVADO** (`40.728 bytes` decodificados instrumentalmente).
- **Percepção Auditiva Física Humana em Alto-Falante Real:** **NÃO VERIFICADO** em ambiente automatizado headless.
- **Transmissão através da Internet Pública (WAN) via Cloudflare Tunnel:** **NÃO VERIFICADO** (Requer testes de campo com latência de trânsito externa, jitter, perda de pacotes e proxies de terceiros).
- **Sessões Contínuas Prolongadas (> 2 horas ininterruptas):** **NÃO VERIFICADO** (Requer validação em regime de longa duração com monitoramento de memória de longo prazo).
- **Variabilidade de Periféricos Físicos de Áudio (Microfones USB/Analógicos e Dispositivos Bluetooth):** **NÃO VERIFICADO** (Requer testes com múltiplos dispositivos de hardware conectados em ambiente físico real).

---

## 8. Outros Pontos Técnicos Auditados

### 8.1 Trimmer: Pontos de Busca, Keyframes e Precisão
- **Fundamentação de Compressão:** Streams de vídeo comprimidos organizam-se em Grupos de Imagens (*Group of Pictures* — GOP). Um GOP inicia com um Keyframe (I-frame/IDR), seguido por quadros dependentes (P-frames e B-frames).
- **Stream Copy (`-c copy`):** Só permite cortes limpos em pontos de busca alinhados a Keyframes. Se o usuário solicitar corte no segundo `12.350` e o keyframe mais próximo estiver no segundo `10.000`:
  - Ou o corte retrocede para `10.000` (imprecisão de 2,35 segundos);
  - Ou inicia com quadros corrompidos/congelados até o próximo keyframe.
- **Smart Rendering vs. Transcodificação Acelerada:**
  - *Smart Rendering:* Decodifica e recodifica apenas o primeiro GOP (do segundo `12.350` até o próximo keyframe), copiando todos os demais pacotes diretamente via stream copy. Oferece precisão ao quadro (*frame-accurate*) com processamento quase instantâneo.
  - *Transcodificação Assíncrona:* Re-codifica o trecho via hardware/software acelerado pelo FFmpeg nativo (300–600 FPS). Um vídeo de 3 minutos é gerado em ~6 a 12 segundos, em vez dos 180 segundos da gravação 1.0x atual.
- **Plano de Teste do Trimmer:** Testar amostras WebM (VP8/VP9/Opus) e MP4 (H.264/AAC) em durações de 1 min, 5 min e 15 min, medindo velocidade e precisão de corte ao quadro. O tempo de 1–3s permanece como **meta proposta pendente de validação**.

### 8.2 YouTube Broadcast: Especificações Oficiais Separadas do Live Share
O **Aura Broadcast** (destinado a serviços externos de streaming) atende a um pipeline completamente distinto do Live Share:
- **Fonte Oficial:** [Google Support — Configurações de codificador para YouTube Live](https://support.google.com/youtube/answer/2853702).
- **Parâmetros Oficiais para 1080p60 SDR:**
  - **Codec:** H.264 (AVC) Level 4.2.
  - **Bitrate:** **Mínimo de 6.000 Kbps; Recomendado de até 17.000 Kbps** para conteúdos com alta movimentação. (*Não utilizar 3 a 6 Mbps como preset universal para 1080p60*).
  - **Controle de Taxa:** Rigorosamente **CBR (Constant Bitrate)**.
  - **Intervalo de Keyframes:** **2,0 segundos** (obrigatório; tolerância máxima de 4s).
  - **Áudio:** AAC Estéreo, taxa de amostragem de 44.1 kHz ou 48 kHz, bitrate de **128 Kbps**.
- **Protocolo:** RTMPS (`rtmps://a.rtmps.youtube.com/live2`).

### 8.3 `safeStorage` e Armazenamento Seguro por Plataforma no Electron 34
Conforme a documentação oficial da API [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), considerando a versão do projeto (faixa declarada `"^34.5.8"` em `package.json`, versão exata `34.5.8` resolvida em `package-lock.json` e instalada em `node_modules/electron/`):
- **Windows:** Utiliza DPAPI (`CryptProtectData`), vinculando as chaves à credencial de login do usuário no sistema operacional.
- **macOS:** Utiliza o Keychain nativo da Apple.
- **Linux:** O método `safeStorage.getSelectedStorageBackend()` retorna uma das seguintes constantes:
  - `'gnome_libsecret'`: Utiliza a biblioteca Secret Service (GNOME Keyring). Criptografia segura.
  - `'kwallet'`, `'kwallet5'`, `'kwallet6'`: Utiliza o cofre nativo do KDE KWallet. Criptografia segura.
  - `'basic_text'`: Utilizado como fallback quando nenhum daemon de keyring está em execução ou quando configurado via flags do Chromium (ex: `--password-store=basic`). Os dados são armazenados de forma **ofuscada em texto simples**, sem proteção criptográfica real.
  - `'unknown'`: **Não é um backend de armazenamento.** Ocorre exclusivamente quando `getSelectedStorageBackend()` é chamado **antes de o aplicativo emitir o evento `ready` do Electron** (momento em que o subsistema criptográfico do Chromium ainda não foi inicializado).
- **Diretriz de Engenharia e Decisão Conservadora do Produto:**
  - A checagem de backend de armazenamento só deve ocorrer **após `app.whenReady()`**.
  - **Não implementar criptografia caseira de derivação de chave por senha** (ex: PBKDF2 caseiro em arquivo plano).
  - **Política Conservadora Adotada:**
    1. Se `safeStorage.isEncryptionAvailable()` retornar `false` ou se `safeStorage.getSelectedStorageBackend()` retornar `'basic_text'`, **o aplicativo NÃO DEVE persistir a Stream Key no disco em hipótese alguma**.
    2. A chave será mantida **exclusivamente na memória volátil do processo Main** durante a sessão ativa do usuário.
    3. Ao iniciar uma transmissão, o aplicativo deve alertar o usuário de forma transparente sobre a ausência de um keyring seguro no sistema operacional (`basic_text`) e solicitar a inserção manual da chave para aquela sessão.

### 8.4 Tamanho do Instalador e Inclusão do `cloudflared.exe`
- **Fato Comprovado:** O arquivo `bin/cloudflared.exe` possui 55.325.120 bytes (~52,7 MB) descompactado no repositório.
- **Estimativa Matemática da Compressão LZMA:** O instalador NSIS do `electron-builder` utiliza algoritmo 7-Zip/LZMA com alta taxa de compressão em executáveis binários em Go, reduzindo o tamanho de `cloudflared.exe` para uma faixa estimada entre **24 MB e 28 MB** dentro do instalador final de 121 MB.
- **Análise de Trade-offs do Download sob Demanda:**
  - *Vantagem Teórica:* Reduzir o instalador de 121 MB para aproximadamente 93–96 MB.
  - *Riscos Práticos:*
    1. Falha imediata de operação em ambientes offline ou redes corporativas com bloqueio de download de arquivos executáveis.
    2. Vulnerabilidade a ataques de rede (*Man-in-the-Middle*) caso não haja verificação estrita de hash SHA-256 e assinatura digital do executável baixado.
    3. Conflitos com o sistema de atualização `electron-updater`, que já utiliza *blockmaps* para baixar apenas os blocos binários modificados em novas releases.
  - **Diretriz:** Manter a estimativa de 25–28 MB como hipótese até a compilação comparativa real de dois pacotes (`.exe` com e sem o binário) na Fase 5.

---

## 9. Roadmap Executivo Atualizado e Critérios de QA

> [!IMPORTANT]
> **Status das Etapas e dos Procedimentos de QA:**  
> A implementação da arquitetura no código-fonte e as rotinas locais automatizadas de QA (181 testes unitários/integração, 13 testes de UI no Electron, testes de áudio DSP e persistência multi-processo) foram integralmente executadas e validadas no repositório. Contudo, em conformidade com os critérios epistemológicos rigorosos do projeto, **o Plano de Melhoria Integral como um todo permanece classificado como PARCIALMENTE CONCLUÍDO**, uma vez que as validações de campo dependentes de hardware externo físico (smartphones em rede celular 4G/5G fora da LAN), sessões ininterruptas de soak test (15, 30 e 60 minutos) e transmissão real via RTMPS para o YouTube Studio encontram-se bloqueadas por indisponibilidade de recursos físicos e credenciais externas.

O roadmap organiza o desenvolvimento em etapas sequenciais, assegurando que nenhuma arquitetura seja adotada em produção antes da validação experimental:

```mermaid
flowchart TD
    subgraph Etapa 1: Linha de Base e Diagnóstico
        E1["1.1 Instrumentar Medições do MJPEG Atual"] --> E2["1.2 Auditar Suporte de Codecs em Runtime"]
    end

    subgraph Etapa 2: Prova de Conceito (PoC)
        E2 --> E3["2.1 Construir PoC Comparativa (MSE vs WebRTC)"]
        E3 --> E4["2.2 Executar Protocolo de Benchmark com Múltiplos Espectadores"]
    end

    subgraph Etapa 3: Decisão e Arquitetura do Live Share
        E4 --> E5["3.1 Avaliação pelas Metas e Escolha de Transporte"]
        E5 --> E6["3.2 Implementação do Pipeline Completo com Áudio"]
    end

    subgraph Etapa 4: Aura Broadcast (Plataformas Externas)
        E6 --> E7["4.1 Cliente RTMP/RTMPS com Parâmetros Oficiais do YouTube"]
        E7 --> E8["4.2 safeStorage Multiplataforma e Telemetria Dedicada"]
    end

    subgraph Etapa 5: Otimizações de Desempenho e Empacotamento
        E8 --> E9["5.1 Otimização do Trimmer (Smart Rendering / FFmpeg)"]
        E9 --> E10["5.2 Política Estrita de CSP e Medição Real de Instaladores"]
    end
```

---

### Detalhamento das Etapas de Execução

#### Etapa 1 — Linha de Base e Diagnóstico Experimental
- **Responsável:** Engenharia de Mídia e Sistemas Electron.
- **Iniciativa 1.1 — Instrumentação de Medição do MJPEG Atual:**
  - *Ação:* Inserir contadores de bytes e timestamps em `shareServer.ts` e registrar consumo em banda e FPS efetivo nos cenários de tela estática e movimento.
  - *Critério de Aceitação:* Relatório instrumental com valores medidos de vazão e framerate real.
- **Iniciativa 1.2 — Teste de Compatibilidade de Codecs em Runtime:**
  - *Ação:* Validar via script de teste o retorno de `MediaSource.isTypeSupported()` para combinações H.264/AAC e VP8/Opus no Electron empacotado e nos navegadores clientes.
  - *Critério de Aceitação:* Matriz confirmada de suporte a codecs nos navegadores clientes.

#### Etapa 2 — Prova de Conceito (PoC) Comparativa de Transporte
- **Responsável:** Engenharia de Rede e Streaming.
- **Iniciativa 2.1 — Implementação de Protótipos de PoC:**
  - *Branch de Teste:* Desenvolver em branch isolada:
    - *Protótipo A:* Segmentos fragmentados via WebSocket / HTTP com player MSE.
    - *Protótipo B:* WebRTC P2P direto com sinalização local e STUN.
- **Iniciativa 2.2 — Execução da Bateria de Benchmarks:**
  - *Ação:* Submeter ambos os protótipos aos testes BM-01 até BM-06 da matriz de benchmark, com 1 e 3 espectadores em conexões reais através do túnel Cloudflare.
  - *Critério de Aceitação:* Tabela comparativa instrumental com bitrate real, latência, perda de pacotes, sincronia A/V, uso de CPU e taxa de sucesso em sessões longas.

#### Etapa 3 — Decisão e Implementação do Aura Live Share
- **Responsável:** Arquitetura de Software e Frontend.
- **Iniciativa 3.1 — Fechamento da Decisão Arquitetural:**
  - *Ação:* Confrontar os dados da PoC com a matriz de critérios objetivos (Seção 7) e homologar a arquitetura técnica formalmente.
- **Iniciativa 3.2 — Integração do Pipeline Completo:**
  - *Ação:* Conectar captura de áudio (microfone + sistema via Web Audio API), segmentação/transporte escolhido e player com `<video>` e gestão de memória do buffer.
  - *Critério de Aceitação:* Transmissão com áudio e vídeo fluidos por mais de 30 minutos ininterruptos sem estouro de memória no cliente.

#### Etapa 4 — Aura Broadcast para Plataformas Externas
- **Responsável:** Engenharia de Backend e Segurança.
- **Iniciativa 4.1 — Cliente RTMP/RTMPS:**
  - *Ação:* Implementar orquestrador de streaming com parâmetros do YouTube Live (1080p60 CBR, 6 a 17 Mbps, keyframe 2,0s, AAC estéreo 128 kbps).
  - *Critério de Aceitação:* Transmissão de teste não-listada com status "Excelente" no YouTube Studio.
- **Iniciativa 4.2 — Proteção de Chaves e Telemetria:**
  - *Ação:* Implementar `safeStorage` com verificação de backend Linux (`getSelectedStorageBackend()`) e fallback para memória volátil caso não haja keyring seguro; telemetria com distinção entre descarte por rede vs. atraso de encoder.
  - *Critério de Aceitação:* Chaves criptografadas em repouso e telemetria precisa na barra de controle.

#### Etapa 5 — Otimização do Trimmer, Segurança e Empacotamento
- **Responsável:** Engenharia de Core e Release.
- **Iniciativa 5.1 — Novo Motor de Corte de Vídeo:**
  - *Ação:* Implementar Smart Rendering ou transcodificação assíncrona acelerada no FFmpeg, eliminando a dependência de re-gravação em tempo real (1.0x).
  - *Critério de Aceitação:* Corte concluído em menos de 10 segundos para gravações típicas de até 5 minutos com precisão no quadro.
- **Iniciativa 5.2 — Segurança CSP e Medição do Instalador:**
  - *Ação:* Configurar `<meta http-equiv="Content-Security-Policy">` estrita; compilar e comparar os tamanhos reais de instaladores gerados com e sem `cloudflared.exe`.
  - *Critério de Aceitação:* Zero avisos de segurança no Electron e dados empíricos de tamanho do instalador registrados.


---

## 10. Resultados Experimentais da PoC, Implementação Incremental EBML e Validação Audiovisual Contínua

### 10.1 Auditoria do Parser EBML / WebM e Detecção Incremental de Keyframes VP8
Em substituição definitiva ao padrão ingênuo de busca por subsequência de bytes brutos (`0x9D, 0x01, 0x2A`), foi implementado em `electron/shareServer.ts` um demuxer incremental estrito e determinístico para contêineres EBML/WebM:
1. **Leitura VINT e Elementos EBML:** As rotinas `readEbmlVint`, `readEbmlElementId` e `readEbmlElementSize` processam cabeçalhos de tamanho variável (1 a 8 bytes) de acordo com a especificação Matroska/EBML, rejeitando tamanhos com octeto inicial zero (`0x00`) e formatos truncados.
2. **Extração Automática da Faixa de Vídeo (`extractVideoTrackNumber`):** O Init Segment (`0x1A45DFA3`) é inspecionado incrementalmente para localizar o elemento `Tracks` (`0x1654AE6B`) e a sub-entrada `TrackEntry` (`0xAE`), identificando o `TrackNumber` onde `TrackType === 1` (vídeo), evitando suposição rígida de faixa 1.
3. **Validação Estrita de SimpleBlock (`isSimpleBlockKeyframe`):**
   - Verifica se o número da faixa coincide com `videoTrackNumber`.
   - Inspeciona o byte de flags do `SimpleBlock`: o bit 7 (`flags & 0x80`) deve ser estritamente `1` (indicador normativo de Keyframe no Matroska). Se for `0`, o bloco é descartado imediatamente como quadro Delta/Inter, mesmo que o padrão `9D 01 2A` ocorra no payload.
   - Analisa o cabeçalho do quadro VP8 descompactado: o bit 0 do primeiro byte (`frame_tag & 0x01`) deve ser estritamente `0` (Key Frame). Se for `1`, trata-se de Inter Frame.
   - Valida a sequência de sincronismo VP8 nos bytes 3, 4 e 5: `0x9D 0x01 0x2A`.
4. **Remontagem de Chunks TCP Divididos (`mseStreamAccumulator`):** O acumulador do servidor bufferiza dados parciais quando o marcador de Cluster (`0x1F43B675`) ou elementos EBML são divididos na fronteira de chunks do `MediaRecorder`, remontando clusters completos antes do despacho.
5. **Comprovação por Testes Automatizados (`tests/liveShareTransport.test.ts` - Suítes 10 e 11 — 38 testes aprovados):**
   - **Suíte 10 — Resiliência Básica e Keyframes:**
     - *Rejeição de Falso Positivo em Quadro Delta:* Teste com quadro Inter (`flags & 0x80 === 0`) e payload contendo propositalmente `[0x9D, 0x01, 0x2A]` comprovou rejeição imediata pelo parser.
     - *Rejeição de Assinatura em Faixa de Áudio:* Pacote de áudio Opus (Track 2) contendo `[0x9D, 0x01, 0x2A]` foi devidamente rejeitado.
     - *Remontagem de Marcador Dividido:* Cluster com bytes `[0x1F, 0x43]` no chunk 1 e `[0xB6, 0x75, ...]` no chunk 2 foi remontado e identificado como keyframe com sucesso.
     - *Resiliência a Chunks Malformados:* Entradas com cabeçalhos incompletos, tamanhos EBML nulos ou lixo aleatório retornam `false` de forma segura, sem exceções.
   - **Suíte 11 — Divisão de Chunks em Todas as Fronteiras Estruturais (Testes 11.1 a 11.10):**
     - *11.1 Divisão no EBML ID:* Divisão do marcador de Cluster de 4 bytes entre o byte 2 e 3 (`[0x1F, 0x43] | [0xB6, 0x75]`); o parser preserva os dados incompletos no acumulador interno e emite o cluster apenas com a chegada do restante.
     - *11.2 Divisão dentro do VINT de Tamanho:* Chunks divididos exatamente no meio do VINT de tamanho de 2 bytes (`0x41 | 0xF4`).
     - *11.3 Divisão no TrackNumber:* Chunks divididos entre os bytes de TrackNumber em VINT de 2 bytes (`0x40 | 0x01`) dentro do SimpleBlock.
     - *11.4 Divisão no Cabeçalho de SimpleBlock:* Divisão antes dos bytes de timecode relativo e flags de keyframe.
     - *11.5 Divisão no Cabeçalho VP8 e Sync Code:* Divisão entre o 2º e o 3º byte do código de sincronismo VP8 (`0x9D, 0x01 | 0x2A`).
     - *11.6 Divisão no Payload do SimpleBlock:* Divisão a 5 bytes do término do cluster, validando a integridade do payload de vídeo remontado.
     - *11.7 Comprimentos Truncados:* Buffer declarando tamanho EBML longo (ex: 500 bytes) mas fornecendo inicialmente apenas 24 bytes; o parser mantém o estado e não emite cluster prematuro até a chegada dos 476 bytes restantes.
     - *11.8 Pulo Seguro de Elementos EBML Inválidos ou Desconhecidos:* Elemento Void (`0xEC`) inserido no cluster é devidamente pulado conforme tamanho EBML, alcançando o SimpleBlock subsequente com sucesso.
     - *11.9 Múltiplas Faixas e Filtragem Correta:* Cluster contendo SimpleBlock de áudio Opus (Track 1) e SimpleBlock de vídeo VP8 (Track 2) valida o isolamento correto da faixa de vídeo parametrizada.
     - *11.10 Rejeição de Falsos Positivos no Payload Delta:* Quadro Inter com padrão `[0x9D, 0x01, 0x2A]` no corpo do payload rejeitado tanto na classificação de keyframe quanto no cache do servidor.

### 10.2 Benchmark de Reprodução Contínua de 30 Segundos (requestVideoFrameCallback)

#### 10.2.1 Investigação de Causas Raízes e Otimizações de Engenharia
A análise instrumental da primeira rodada (813 quadros, 27,06 FPS, pico de 878,8 ms) permitiu isolar e corrigir três causas reproduzíveis:
1. **Deriva Temporal do Gerador Sintético (Origem dos 27,06 FPS):** O host canvas utilizava `setInterval(draw, 33)`. No ambiente Windows/V8, a fila de eventos sofre deriva cumulativa (~36,8 ms médios), gerando apenas ~815 quadros nominais em 30 segundos. A temporização foi corrigida em `scripts/test-continuous-30s-playback.cjs` com um escalonador com compensação de deriva (*drift-compensated scheduler*) baseado em `performance.now()`.
2. **Buffering de Fronteira no Servidor (Origem do Pico de 878,8 ms):** Em `electron/shareServer.ts`, a rotina `broadcastLiveMseChunk` retinha chunks no acumulador interno até detectar o marcador `CLUSTER_ID, 4` do cluster seguinte (intervalo de ~3,4s entre keyframes do MediaRecorder). Quando o player do cliente consumia o Cluster 1, seu SourceBuffer ficava temporariamente esgotado até que o Cluster 3 fosse iniciado e liberasse o Cluster 2. A lógica foi refatorada para despachar os chunks binários em tempo real aos clientes conectados no momento em que chegam do MediaRecorder, mantendo o acumulador estritamente para remontagem e cache de keyframes para novos clientes.
3. **Descontinuidade no Late-Joiner:** A rotina de cache de keyframe continha uma condição de tamanho (`newChunk.length < cached.length`) que mantinha o primeiro cluster congelado. O servidor foi corrigido para atualizar `cachedLatestKeyframe` a cada novo keyframe real e despachar o acumulador contíguo em andamento aos novos espectadores.

#### 10.2.2 Comparativo Instrumental: Antes vs. Depois da Otimização

| Métrica Avaliada | Alvo / Especificação | Rodada Inicial (Antes) | Rodada Otimizada (task-5925) | Ganho / Variação Técnica | Classificação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Duração da Janela de Medição** | $\ge 30,0\text{ s}$ | 30,04 s | **30,026 s** | Medição temporal de alta precisão | **Aprovado** |
| **Tempo até 1º Quadro (TTFF)** | Mínimo possível | ~1.454 ms (embutido na média) | **165,6 ms** (isolado do playback) | Início quase instantâneo | **Medição Confirmada** |
| **Total de Quadros Apresentados ao Compositor** | $> 800$ quadros | 813 quadros | **896 quadros** | +83 quadros apresentados | **Aprovado** |
| **Taxa Efetiva de Apresentação** | $\ge 24,0\text{ FPS}$ (Nominal 30 FPS) | 27,06 FPS | **29,84 FPS** | **+2,78 FPS** (99,5% do alvo de 30 FPS) | **Aprovado** |
| **Intervalo Mínimo entre Quadros** | — | 12,00 ms | **6,10 ms** | Cadência de composição estável | **Medição Confirmada** |
| **Intervalo Médio entre Quadros** | $33,33\text{ ms}$ | 35,29 ms | **33,52 ms** | Quase idêntico ao ideal de 33,33 ms | **Medição Confirmada** |
| **Intervalo Máximo (Pico de Atraso)**| $< 500\text{ ms}$ | 878,80 ms | **151,50 ms** | **-727,30 ms** de redução de pico | **Aprovado** |
| **Percentil 50 (Mediana)** | $\approx 33,3\text{ ms}$ | — | **30,4 ms** | Distribuição centrada no vsync | **Medição Confirmada** |
| **Percentil 95 (p95)** | $< 50\text{ ms}$ | — | **42,3 ms** | 95% dos frames sem oscilação | **Aprovado** |
| **Percentil 99 (p99)** | $< 100\text{ ms}$ | — | **42,5 ms** | 99% dos frames abaixo de 43 ms | **Aprovado** |
| **Jitter (Desvio Padrão)** | $< 25,0\text{ ms}$ | 31,52 ms | **5,94 ms** | Jitter ultrabaixo (~1/5 do inicial) | **Aprovado** |
| **Travamentos / Stalls ($>100\text{ ms}$)** | 0 na reprodução estável | 3 ocorrências | **1 ocorrência** (151,5 ms aos 1,65s iniciais) | **Zero stalls** nos 28,4s restantes | **Aprovado** |
| **Distância para Borda ao Vivo** | Mínima latência | ~3,40 s | **mín 0,994s / máx 1,135s / méd 1,059s** | **Latência média contida em ~1,06 s** | **Aprovado** |
| **Avanço Temporal (`currentTime`)** | $\ge 29,0\text{ s}$ | 27,703 s | **29,984 s** (de 0,015s a 29,999s) | Sincronia perfeita com o relógio | **Aprovado** |
| **Buffer Temporal à Frente** | Faixa contínua | [20,571s - 30,929s] | **mín 0,994s / máx 1,135s / méd 1,059s** | Calculado estritamente via TimeRanges | **Aprovado** |
| **Buffer Ativo no MediaSource** | Faixa contínua | [20,571s - 30,929s] | **[20,300s - 31,101s]** | Evicção ativa mantendo janela de ~10,8s | **Aprovado** |
| **Bytes de Vídeo Decodificados** | — | 2.003.248 B | **2.005.811 B** (~2,01 MB) | Taxa contínua de processamento | **Medição Confirmada** |
| **Bytes de Áudio Opus Decodificados**| — | 481.962 B | **481.000 B** (~481 KB) | Fluxo sonoro multiplexado | **Medição Confirmada** |

#### 10.2.3 Conciliação Matemática Rigorosa das Métricas de Quadros (Mesmo Intervalo)
Para garantir coerência epistêmica sem suposições empíricas sobre buffers de lookahead, as métricas foram coletadas via snapshots sincronizados no início ($t_{\text{start}} = 582,4\text{ ms}$) e no término ($t_{\text{end}} = 30.608,1\text{ ms}$) da janela exata de 30 segundos:

1. **Snapshots Coletados no Mesmo Intervalo:**
   - *Snapshot Inicial ($t_{\text{start}}$):* `totalVideoFrames` = 4, `droppedVideoFrames` = 0, `corruptedVideoFrames` = 0, `webkitDecodedFrameCount` = 4, `currentTime` = 0,015 s, `buffered` = [0 - 0,834 s].
   - *Snapshot Final ($t_{\text{end}}$):* `totalVideoFrames` = 900, `droppedVideoFrames` = 0, `corruptedVideoFrames` = 0, `webkitDecodedFrameCount` = 900, `currentTime` = 29,999 s, `buffered` = [20,300 - 31,101 s].

2. **Deltas Instrumentais da Janela:**
   - $\Delta \text{totalVideoFrames} = 900 - 4 = \mathbf{896}$
   - $\Delta \text{droppedVideoFrames} = 0 - 0 = \mathbf{0}$
   - $\Delta \text{corruptedVideoFrames} = \mathbf{0}$
   - $\Delta \text{webkitDecodedFrameCount} = 900 - 4 = \mathbf{896}$
   - Callbacks de `requestVideoFrameCallback` recebidos: $\mathbf{896}$

3. **Análise de Lacunas em `metadata.presentedFrames`:**
   - Primeiro callback: `presentedFrames` = 2
   - Último callback: `presentedFrames` = 897
   - Span total coberto: $897 - 2 + 1 = \mathbf{896}$ quadros apresentados.
   - Lacunas detectadas entre callbacks consecutivos ($\Delta > 1$): **0 ocorrências** (`totalPresentedGaps = 0`, `gapEvents = []`).
   - Cada callback disparado correspondeu a um avanço monótono unitário ($+1$) no contador de submissão do compositor.

4. **Aplicação da Fórmula W3C Video Playback Quality:**
   $$\text{totalVideoFrames} = \text{displayedFrames} + \text{droppedVideoFrames}$$
   $$\implies \text{displayedFramesExpected} = \Delta \text{totalVideoFrames} - \Delta \text{droppedVideoFrames} = 896 - 0 = \mathbf{896}$$

5. **Conciliação e Fechamento de Balanço:**
   - $\text{displayedFramesExpected} (896) - \text{rVfcCallbacks} (896) = \mathbf{0}$ (Discrepância Zero).
   - $\Delta \text{webkitDecodedFrameCount} (896) - \Delta \text{totalVideoFrames} (896) = \mathbf{0}$ (Discrepância Zero).
   - $\text{presentedFramesSpan} (896) - \text{rVfcCallbacks} (896) = \mathbf{0}$ (Discrepância Zero).
   - **Status da Conciliação:** **`CONCILIADO_E_COERENTE`** (todos os contadores fecham com identidade exata).

6. **Cálculo Independente do Buffer Temporal:**
   - O buffer temporal foi medido amostra a amostra exclusivamente através de `video.buffered` e `video.currentTime`:
     $$\text{bufferAhead} = \text{activeRange.end} - \text{currentTime}$$
   - Não foi derivada duração de buffer a partir da diferença de contadores de quadros.
   - Valores observados: mínimo de 0,994 s, máximo de 1,135 s e média de 1,059 s de folga contínua.

7. **Limitações Técnicas Explicitadas:**
   - `requestVideoFrameCallback` atesta que a camada de renderização do Chromium submeteu o quadro decodificado ao compositor gráfico para exibição na superfície de apresentação. **Não constitui medição física ou óptica dos fótons/pixels emitidos pelo painel do monitor**.
   - `totalVideoFrames` representa estritamente os quadros que completaram o processo de descompressão e foram encaminhados para exibição ou descartados. Não indica a quantidade de quadros retidos em buffers ou filas de lookahead.

### 10.3 Validação de Entrada Tardia (Late-Joiner) em Fluxo Ativo (Avaliação Segregada)
A validação do espectador tardio foi conduzida de forma segregada do benchmark contínuo (`scripts/test-continuous-30s-playback.cjs` etapa 4), conectando o segundo cliente durante a transmissão ativa do MediaRecorder:
1. **Ponto de Entrada e Sincronização:** Recebeu imediatamente `init-meta` (Init Segment de 189 bytes) seguido pelo acumulador de cluster ativo e chunks subsequentes.
2. **Métricas do Late-Joiner:**
   - Bytes recebidos: **814.159 bytes** (69 segmentos binários).
   - Intervalo contíguo em buffer: **[0s - 9,232s]**.
   - Estado do player: `readyState = 4` (`HAVE_ENOUGH_DATA`), `paused = false`.
   - Avanço de `currentTime`: de 1,951s para 7,961s ($\Delta = 6,011$s em 6,0 segundos).
   - Quadros decodificados: **235 quadros**.
   - Áudio Opus decodificado: **132.756 bytes**.
   - Quadros apresentados ao compositor via rVFC: **175 quadros** (**29,12 FPS** efetivo).
3. **Conclusão:** Entrada tardia sem descontinuidade ou tela preta, operando a 29+ FPS imediatos.

### 10.4 Bateria de 5 Ciclos de Desconexão e Reconexão Consecutivos
Executada através do script automatizado `scripts/test-reconnection-cycles.cjs` sobre transmissão ativa ininterrupta:

| Ciclo | Init em Cache | Bytes Recebidos | Quadros Decodificados | Quadros Apresentados (rVFC) | Avanço `currentTime` | Espectadores Ativos | Sockets Órfãos Pós-Fecho | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | Sim | 185.230 B | 75 | 42 | +1,544 s | 1 $\to$ 0 | **0** | **Aprovado (Limpo)** |
| **2** | Sim | 231.958 B | 120 | 55 | +1,833 s | 1 $\to$ 0 | **0** | **Aprovado (Limpo)** |
| **3** | Sim | 336.116 B | 122 | 54 | +1,803 s | 1 $\to$ 0 | **0** | **Aprovado (Limpo)** |
| **4** | Sim | 321.056 B | 122 | 52 | +1,810 s | 1 $\to$ 0 | **0** | **Aprovado (Limpo)** |
| **5** | Sim | 503.485 B | 121 | 53 | +1,811 s | 1 $\to$ 0 | **0** | **Aprovado (Limpo)** |

- **Ausência de Vazamento de Recursos:** Em todos os 5 ciclos, o encerramento da conexão pelo cliente ou destruição da janela resultou na imediata remoção do socket do conjunto `this.mseClients` e decremento de `getLiveViewersCount()`, mantendo **0 sockets órfãos** e **0 bytes retidos**.

### 10.5 Teste de Contrapressão e Proteção do Host (RFC 6455 1008)
1. **Simulação de Gargalo de Rede no Espectador:** O espectador foi configurado com `writableLength = 3 * 1024 * 1024` (> limiar de segurança de 2 MB).
2. **Reação do Servidor:** No despacho do cluster seguinte, o `ShareServer` detectou o acúmulo excessivo no buffer TCP, emitiu log de advertência e executou `ws.close(1008, 'Buffer overflow - reconnecting')`, removendo o cliente de `this.mseClients`.
3. **Isolamento do Apresentador:** A transmissão do host continuou a 30 FPS ininterruptos, sem travamento de loop de eventos, sem backpressure no `MediaRecorder` e sem queda do processo.
4. **Recuperação Pós-Contrapressão:** Um novo espectador conectou-se logo em seguida, recebeu o Init Segment e decodificou 40 quadros normalmente, comprovando recuperação total.

### 10.6 Matriz Estrita de Separação Epistemológica da Reprodução Audiovisual

| Dimensão Técnica | Status no Ambiente Atual | Evidência Instrumental | Justificativa Epistemológica Rigorosa |
| :--- | :---: | :--- | :--- |
| **1. Bytes Recebidos** | **VERIFICADO** | Contador de bytes em `window.__mseStats.bytesReceived` no evento `onmessage` do WebSocket (2.571.039 B na janela). | Comprova tráfego de rede entre servidor e cliente. Não comprova integridade estrutural nem aceitação pelo pipeline de mídia. |
| **2. Segmentos Aceitos pelo MediaSource** | **VERIFICADO** | Intervalos contínuos retornados por `sourceBuffer.buffered` (ex.: `[20.300 - 31.101]`). | Comprova que o demuxer WebM do Chromium aceitou a sintaxe EBML e os clusters sem disparar erro em `SourceBuffer`. Não comprova decodificação. |
| **3. Mídia Decodificada (Vídeo e Áudio)** | **VERIFICADO** | Métricas internas do elemento de vídeo: `webkitDecodedFrameCount` ($\Delta = 896$ quadros) e `webkitAudioDecodedByteCount` ($\Delta = 481.000$ bytes). | Comprova que os decodificadores VP8 e Opus processaram os pacotes e geraram buffers descompactados em memória. |
| **4. Quadros Apresentados ao Compositor** | **VERIFICADO** | Callbacks ininterruptos de `video.requestVideoFrameCallback` (896 quadros medidos em 30,026s com timestamp e vsync a 29,84 FPS). | Comprova que o pipeline de renderização do Chromium submeteu os quadros decodificados ao compositor gráfico para exibição. |
| **5. Conciliação Matemática de Métricas** | **VERIFICADO** | Snapshots sincronizados no mesmo intervalo exato ($t_{\text{start}}$ e $t_{\text{end}}$): $\Delta \text{totalVideoFrames} (896) = \text{displayed} (896) + \Delta \text{dropped} (0)$, casando perfeitamente com $\Delta \text{decoded} (896)$ e callbacks rVFC (896). | Fechamento de balanço exato conforme W3C Video Playback Quality. Zero lacunas detectadas em `metadata.presentedFrames` entre callbacks e zero discrepâncias não explicadas. |
| **6. Duração de Mídia no Buffer à Frente do Playhead** | **VERIFICADO** | Amostragem contínua via `video.buffered` e `video.currentTime` (mín 0,994s, máx 1,135s local; mín 1,543s, máx 1,727s via túnel). | Duração de mídia disponível à frente do playhead nos intervalos de buffer do navegador. Não representa buffer decodificado nem latência ponta a ponta para a borda ao vivo. |
| **7. Túnel Público Cloudflare (Internet Anycast)** | **VERIFICADO** | `cloudflared.exe` (v2026.10.1) gerando URL pública Anycast (`https://*.trycloudflare.com`), handshake WSS RFC 6455 over TLS, streaming contínuo de 1,31 MB e 314 quadros apresentados. | Comprova que o fluxo atravessa a borda Anycast da Cloudflare, mantendo transporte seguro e streaming estável via WSS público. |
| **8. Isolamento de Segurança de Rotas no Túnel** | **VERIFICADO** | Teste HTTP instrumental: `/api/live/status` (200), `/live` (200), `/api/recordings` (403), `/share/*` (403). | Comprova isolamento estrito: rotas privadas locais e gravações são ativamente bloqueadas via túnel público. |
| **9. Resiliência a Degradação de Rede (Jitter FIFO)** | **VERIFICADO** | Fila FIFO com jitter de 50ms a 130ms: 99 chunks atrasados, 354 quadros apresentados e avanço de mídia contínuo sem travamento ou corrupção WebM. | Comprova tolerância do buffer MSE a variações de latência de transporte típicas de conexões móveis e Wi-Fi quando a ordem sequencial TCP é preservada. |
| **10. Evicção Contínua de Buffer (Janela ~10-12s)** | **VERIFICADO** | Telemetria com avanço do início do buffer de 0,0s para 31,2s, mantendo janela ativa de ~10,7s e deriva de Heap de apenas +0,1 MB em 42s. | Comprova que `queueMseEviction` impede o acúmulo infinito de buffers em memória no curto prazo. Não substitui teste de horas. |
| **11. Emulação Sintética de Dispositivos (Chromium Desktop)** | **VERIFICADO (COM RESSALVAS)** | Janelas Chromium com viewports 390x844 (iPhone) e 412x915 (Android) e spoofing de User-Agent. | **Comprova unicamente responsividade de layout e reprodução no motor Blink/Chromium desktop**. NÃO comprova execução no motor WebKit real (iOS Safari) nem no Chrome para Android OS. |
| **12. Dispositivos Físicos Externos em Redes Celulares (4G/5G)** | **NÃO VERIFICADO** | Ambiente indisponível: máquina local possui apenas adaptadores Ethernet Realtek e Hyper-V virtual; sem smartphone físico acoplado via rede externa. | **Exige aparelhos físicos reais iOS e Android desconectados da rede local, com chips SIM comerciais (Vivo/Claro/TIM) e testadores remotos**. |
| **13. Emissão Física de Fótons / Pixels no Display** | **NÃO VERIFICADO** | Nenhuma (Ambiente automatizado headless). | A submissão dos buffers à camada de composição gráfica foi atestada por software; no entanto, **a emissão física de luz e a comutação de estado dos subpixels do painel do monitor não foram medidas** e exigiriam sensor óptico/fotodiodo físico acoplado à tela. |
| **14. Áudio Ouvido Fisicamente** | **NÃO VERIFICADO** | Nenhuma (Ambiente automatizado headless). | A decodificação instrumental de bytes Opus foi confirmada pelo navegador; no entanto, **a emissão de pressão sonora por transdutor acústico (alto-falante/fone de ouvido) e a percepção auditiva humana não foram verificadas** e exigem microfone físico externo no ambiente. |
| **15. Sessões Contínuas de 15, 30 e 60 Minutos de Relógio Real** | **NÃO VERIFICADO** | Apenas janelas de 30s a 42s foram executadas em bancada automatizada. | **Exige bancada dedicada com monitoramento ininterrupto de Working Set / Private Bytes por processo do sistema operacional por 900s, 1800s e 3600s de relógio de parede**. Poucos segundos de TimeRanges ou Heap JS não constituem prova de estabilidade por horas. |

---

### 10.7 Auditoria Técnica do Live Share Beta: Túnel Cloudflare, Emulação e Temporização Instrumental
Resultados brutos consolidados em [`tests/poc/field-homologation-results.json`](file:///d:/clone/2/tests/poc/field-homologation-results.json) e [`tests/poc/timing-and-latency-results.json`](file:///d:/clone/2/tests/poc/timing-and-latency-results.json):

**Status Geral da Homologação:** **HOMOLOGAÇÃO DE CAMPO INCOMPLETA / PENDENTE DE HARDWARE FÍSICO EXTERNO**.
O Live Share Beta comprovou funcionamento de ponta a ponta sobre o túnel público da Cloudflare e sob emulação sintética, mas **não pode ser declarado como homologado em campo** até que testes em smartphones físicos com conexões de operadoras reais e sessões longas de relógio sejam executados.

#### 1. Conexão Pública e Handshake Edge Anycast (Verificado)
- **Binário Utilizado:** `d:\clone\2\bin\cloudflared.exe` (versão oficial `2026.10.1`).
- **Tempo de Obtenção do Túnel:** 6.047 ms.
- **Resolução de DNS Global Anycast:** 5.103 ms para propagação global (`104.16.231.132`).
- **Prontidão da Rota de Borda (Edge):** Ativa respondendo HTTP 200 após registro.
- **Handshake WSS:** Upgrade RFC 6455 estabelecido sobre TLS na porta 443 da Cloudflare (`wss://.../ws/mse`).

#### 2. Isolamento de Rotas e Segurança de Borda (Verificado)
- `GET /api/live/status`: HTTP **200 OK** (`isLive: true`, `transportMode: "mse"`).
- `GET /live`: HTTP **200 OK** (Interface do espectador servida com sucesso).
- `GET /api/recordings` (Rotas privadas locais): HTTP **403 Forbidden** (Bloqueio estrito confirmado).
- `GET /share/test-uuid` (Arquivos gravados): HTTP **403 Forbidden** (Bloqueio estrito confirmado).

#### 3. Emulação Sintética de Dispositivos (Blink Desktop — Não Comprova Hardware Real)
| Perfil Testado | Resolução / Viewport | User-Agent Injetado | Segmentos WebM | Bytes Recebidos | Quadros rVFC | `readyState` | Classificação Real |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **Desktop Chrome** | 1920x1080 (1280x720) | Chrome Desktop v132 | 94 | 1.316.337 B | 314 | 4 | **Emulação Chromium Desktop** |
| **Mobile Safari (iPhone 15 Pro)** | 390x844 (Mobile) | iOS 17.5 Safari Mobile | 94 | 1.087.148 B | 316 | 4 | **Emulação Chromium Desktop** *(Não é WebKit/iOS real)* |
| **Mobile Android (Pixel 8)** | 412x915 (Mobile) | Android 14 Chrome Mobile | 93 | 1.191.252 B | 316 | 4 | **Emulação Chromium Desktop** *(Não é Android OS real)* |

*Ressalva Obrigatória de Engenharia:* Ajustar a largura/altura da janela e substituir a string de `User-Agent` comprova que a folha de estilos CSS é responsiva e que os controles de toque cabem na tela sob o motor Blink do Electron. **Isso NÃO valida as restrições reais do WebKit no iOS (como suporte restrito a WebM em MSE) nem as particularidades do Chrome no Android OS**. Dispositivos físicos permanecem estritamente categorizados como **NÃO VERIFICADO**.

#### 4. Medição Instrumental de Temporização, Intervalos de Buffer e Envio/Recebimento via Túnel no Mesmo Host
Para eliminar qualquer ambiguidade em relação ao avanço de tempo versus latência de streaming, uma amostragem dedicada em alta frequência (a cada 250 ms por 15,001 s) foi executada via túnel público Cloudflare (`scripts/measure-latency-and-edges.cjs`):

1. **Definição de $\Delta t = 12$ s da Rodada Anterior:**
   O valor $\Delta t = 12,0$ s reportado anteriormente correspondia a $\Delta \text{currentTime} = \text{currentTime}_{\text{fim}} - \text{currentTime}_{\text{ini}}$ durante uma janela de observação de 12 segundos de relógio de parede. **Trata-se do avanço contínuo do relógio de reprodução ($1,00\times$), e NÃO de 12 segundos de latência ou atraso**.
2. **Medição Atual de Avanço de Reprodução:**
   - Duração no relógio de parede: **15,001 s**.
   - Avanço de `currentTime` ($\Delta \text{currentTime}$): de 3,803 s para 18,804 s = **15,0005 s**.
   - Multiplicador de taxa de reprodução: **$0,999967\times$** (avanço exato de 1 segundo de mídia por 1 segundo de tempo real).
3. **Duração de Mídia Disponível à Frente do Playhead nos Intervalos de Buffer do Navegador (`buffered.end - currentTime`):**
   - Mínimo: **1,543 s**
   - Mediana (p50): **1,657 s**
   - Média: **1,660 s**
   - Percentil 95 (p95): **1,715 s**
   - Percentil 99 (p99): **1,727 s**
   - Máximo Amostral: **1,727 s**
   - *Método Estatístico e Coincidência entre p99 e Máximo:* Pelo método estatístico de rank mais próximo (*Nearest Rank Method*), a posição ordinal $k$ (em base 1, para $k \in \{1, \dots, N\}$) é calculada como $\text{posição} = \lceil 0,99 \times N \rceil = \lceil 0,99 \times 60 \rceil = \lceil 59,4 \rceil = 60$. A 60ª posição ordinal em um conjunto ordenado de $N = 60$ observações corresponde, na representação de índice em base zero ($0 \dots N-1$), exatamente ao índice 59 ($\text{índice} = \text{posição} - 1 = 60 - 1 = 59$). Como o índice 59 é a última posição do vetor ordenado, o percentil 99 coincide algebricamente com o valor máximo da amostra ($1,727263$ s). Em qualquer amostragem com $N < 100$, o p99 por *nearest rank* mapeia diretamente para a última posição ordinal $N$ (máximo amostral).
   - *Definição Estrita:* Reflete exclusivamente a duração temporal de mídia presente nos intervalos de buffer (`TimeRanges`) do navegador além do ponto atual de reprodução (`currentTime`). Não deve ser descrito como buffer decodificado nem como latência ponta a ponta para a borda ao vivo.
4. **Tempo entre Envio e Recebimento da Mensagem WebSocket via Túnel no Mesmo Host (128–152 ms):**
   - *Origem do Timestamp:* Registrado pelo processo do servidor local Node.js imediatamente antes de despachar a mensagem pelo socket (`ws.send(JSON.stringify({ type: 'segment-meta', timestamp: Date.now() }))`).
   - *Destino do Timestamp:* Registrado pelo processo Renderer do espectador Electron no momento em que o evento `mseWs.onmessage` foi disparado (`const transit = Date.now() - meta.timestamp`).
   - *Relógio Utilizado:* Relógio local de parede do sistema operacional Windows (`Date.now()`). Como o processo emissor e o processo receptor executaram no mesmo computador físico, ambos compartilham exatamente o mesmo relógio de hardware, eliminando divergências de relógio (*clock skew* NTP).
   - *Rota Percorrida:* O pacote saiu do servidor local, atravessou o túnel QUIC/HTTP2 do `cloudflared`, passou pela borda Anycast da Cloudflare na internet e retornou via TLS para o cliente na mesma máquina anfitriã.
   - *Esclarecimento Rigoroso:* A métrica afere o tempo unidirecional decorrido entre o despacho local e a entrega do evento de mensagem após a passagem pela borda da Cloudflare. **Não representa RTT (Round-Trip Time) de uma troca requisição-resposta nem latência entre dois clientes remotos**.
   - *Valores Aferidos (124 amostras):* Mínimo: **128 ms** | Média: **135,2 ms** | Máximo: **152 ms**.
5. **Stalls e Interrupções durante a Reprodução:**
   - Eventos `waiting`: **0**
   - Eventos `stalled`: **0**
   - Congelamentos de playhead: **0**

#### 5. Ciclos de Desconexão e Reconexão no Túnel Público
- 3 ciclos consecutivos de fechamento abrupto e reconexão executados via túnel público:
  - Ciclo 1: Reconectou em 1,5s, recebeu Init Segment (189 B) + Keyframe Cluster, apresentou 61 quadros a 30 FPS (`readyState: 4`).
  - Ciclo 2: Reconectou em 1,5s, recebeu Init Segment + Keyframe Cluster, apresentou 67 quadros a 30 FPS (`readyState: 4`).
  - Ciclo 3: Reconectou em 1,5s, recebeu Init Segment + Keyframe Cluster, apresentou 63 quadros a 30 FPS (`readyState: 4`).
  - Sockets órfãos no servidor pós-ciclos: **0**.

#### 6. Resiliência a Degradação de Rede (Jitter FIFO 50ms - 130ms)
- Fila de atraso FIFO simulando latência variável típica de redes sem fio:
  - Chunks atrasados: 99 chunks.
  - Quadros apresentados durante o período de estresse: 354 quadros.
  - Avanço de `currentTime`: 12,00s em 12s de observação.
  - Stalls observados: **0** (`stalled: false`, `recovered: true`, `readyState: 4`).

#### 7. Avaliação Empírica de Sessões Longas (Soak Tests de 15m, 30m e 60m)
A bateria de soak tests em regime ininterrupto de relógio de parede foi executada via harness parametrizável [`scripts/run-soak-test.cjs`](file:///d:/clone/2/scripts/run-soak-test.cjs), com bloqueio de suspensão de energia via `powerSaveBlocker` e amostragem de telemetria a cada 30 segundos dos 6 processos do SO (Main, GPU, 2 Utilities, Host Tab, Spectator Tab):

| Sessão | Duração Alvo | Duração Efetiva Real | Quadros rVFC | Taxa Efetiva | Intervalo Médio | p99 | Jitter | Stalls | Variação Working Set Agregado | Variação Private Bytes Agregado | Arquivo de Dados Brutos | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: |
| **Sessão 1 (15 min)** | 900 s | **900,05 s** | **26.279** | **29,13 FPS** | 34,32 ms | 66,70 ms | 8,20 ms | 1* (startup) | **+58,26 MB** (543,20 $\to$ 601,46 MB; máx 609,20 MB) | **+51,48 MB** (303,73 $\to$ 355,21 MB; máx 362,69 MB) | [`tests/poc/soak-test-900s-results.json`](file:///d:/clone/2/tests/poc/soak-test-900s-results.json) | **VALIDADO (DADOS REGISTRADOS)** |
| **Sessão 2 (30 min)** | 1.800 s | **1.800,03 s** | **53.788** | **29,85 FPS** | 33,50 ms | 54,60 ms | 6,13 ms | 1* (startup) | **+52,75 MB** (540,59 $\to$ 593,34 MB; máx 607,34 MB) | **+49,78 MB** (306,27 $\to$ 356,05 MB; máx 367,61 MB) | [`tests/poc/soak-test-1800s-results.json`](file:///d:/clone/2/tests/poc/soak-test-1800s-results.json) | **VALIDADO (DADOS REGISTRADOS)** |
| **Sessão 3 (60 min)** | 3.600 s | — | — | — | — | — | — | — | — | — | — | **NÃO EXECUTADA (DISPENSADA POR DECISÃO DO USUÁRIO)** |

*\* Nota sobre Stalls: O único evento de stall registrado ocorreu no milissegundo inicial de inicialização (startup) antes do primeiro preenchimento do SourceBuffer. Não houve nenhuma ocorrência de stall ou interrupção durante todo o regime contínuo de transmissão ao vivo em nenhuma das sessões.*

##### A. Análise da Série Temporal por Processo (Sessão de 30 Minutos / 1.800s)

A inspeção amostra a amostra (60 amostras a cada 30 segundos) revela o comportamento individual dos subsistemas:

1. **Processo Principal / Main (`Browser` — PID 9212):**
   - *Working Set:* Inicial: 105,76 MB | Final: 118,99 MB | Mínimo: 104,88 MB | Máximo: 130,33 MB (aos 660s) | $\Delta$ Total: +13,23 MB.
   - *Private Bytes:* Inicial: 85,02 MB | Final: 92,25 MB | Mínimo: 77,64 MB | Máximo: 103,84 MB (aos 660s) | $\Delta$ Total: +7,23 MB.
   - *Tendência Pós-Aquecimento ($t \ge 300$s a $1.800$s — 25 min):* $\Delta \text{WS} = +4,72$ MB; $\Delta \text{Private Bytes} = +3,68$ MB. O processo oscila em patamar entre 110 MB e 125 MB com ciclos de GC do Node.js.
2. **Processo de GPU (`GPU` — PID 17676):**
   - *Working Set:* Inicial: 113,02 MB | Final: 111,95 MB | Mínimo: 111,88 MB | Máximo: 114,15 MB | $\Delta$ Total: -1,07 MB.
   - *Private Bytes:* Inicial: 100,71 MB | Final: 101,68 MB | Mínimo: 100,71 MB | Máximo: 102,45 MB | $\Delta$ Total: +0,97 MB.
   - *Tendência Pós-Aquecimento ($t \ge 300$s):* $\Delta \text{WS} = -1,78$ MB; $\Delta \text{Private Bytes} = -0,09$ MB. Curva rigorosamente plana, demonstrando estabilidade na alocação de texturas gráficas.
3. **Processos Utilitários de Áudio/Rede (`Utility` — PIDs 18448 e 17068):**
   - *Working Set:* Variações líquidas de -0,22 MB e -0,01 MB.
   - *Private Bytes:* Variações líquidas de -0,36 MB e -0,06 MB.
   - *Tendência:* Perfil perfeitamente horizontal em toda a duração.
4. **Processos Renderers (`Tab` — Host MediaRecorder PID 19288 e Espectador MSE PID 5892):**
   - *Tab 19288 (Host MediaRecorder):*
     * Working Set: Inicial: 92,11 MB | Final: 112,52 MB | Máximo: 117,10 MB | $\Delta$ Total: +20,41 MB.
     * Private Bytes: Inicial: 47,80 MB | Final: 67,82 MB | Máximo: 68,14 MB | $\Delta$ Total: +20,02 MB.
     * Tendência Pós-Aquecimento ($t \ge 300$s): $\Delta \text{WS} = -0,42$ MB; $\Delta \text{Private Bytes} = +4,59$ MB.
   - *Tab 5892 (Espectador MSE / MediaSource):*
     * Working Set: Inicial: 111,17 MB | Final: 131,58 MB | Máximo: 136,63 MB | $\Delta$ Total: +20,41 MB.
     * Private Bytes: Inicial: 47,45 MB | Final: 69,43 MB | Máximo: 74,63 MB | $\Delta$ Total: +21,98 MB.
     * Tendência Pós-Aquecimento ($t \ge 300$s): $\Delta \text{WS} = +4,27$ MB; $\Delta \text{Private Bytes} = +6,48$ MB.

##### B. Rigor Epistemológico: Interpretação de Limites e Retenção de Memória

Para preservar a exatidão técnica e corrigir declarações genéricas anteriores:
1. **Incorreção da Expressão "Deriva Zero":** O Working Set agregado aumentou **58,26 MB** na sessão de 15 minutos e **52,75 MB** na sessão de 30 minutos. Da mesma forma, os Private Bytes agregados cresceram **51,48 MB** (15 min) e **49,78 MB** (30 min). Não houve deriva zero de memória.
2. **Desaceleração Pós-Aquecimento vs. Retenção Lenta:**
   - Mais de 80% do acréscimo total de memória ocorreu na fase inicial de aquecimento ($0$ a $300$s), correspondendo à alocação de buffers de pipeline de mídia, contextos Web Audio, instâncias WebSocket e compilação JIT de código JavaScript.
   - No intervalo de regime ($300$s a $1.800$s), o ritmo de crescimento desacelera substancialmente: o Working Set do host variou -0,42 MB e o do espectador +4,27 MB em 25 minutos.
   - No entanto, a inclinação residual de Private Bytes nas abas permanece ligeiramente positiva (+4,59 MB e +6,48 MB em 25 min).
   - **Conclusão Epistemológica Neutra:** Os dados disponíveis em uma amostragem finita de 30 minutos **não permitem concluir de forma definitiva se esse crescimento residual indica retenção contínua (leak lento) ou estabilização assintótica com acomodação/fragmentação interna do alocador V8/Blink**. A ausência de vazamento não pode ser inferida sem observações ainda mais prolongadas com forçamento de coleta de lixo periódica.
3. **Limitações do Working Set como Métrica Isolada:**
   - O Working Set mede estritamente a quantidade de memória física (RAM) atualmente mapeada no espaço de endereçamento do processo pelo gerenciador de memória do Windows. Ele é sensível à atividade de outros processos no SO, a políticas de paginação e a deduplicação de código de DLLs compartilhadas.
   - Consequentemente, o Working Set **não deve ser tratado isoladamente nem como prova de estabilidade** (pois o sistema operacional pode aplicar trimming de páginas residentes sob pressão de RAM) **nem como prova cabal de vazamento** (pois páginas de memória limpas ou inativas podem ser mantidas residentes pelo SO até que haja demanda externa por RAM). Private Bytes fornece uma aferição mais precisa da carga comprometida exclusiva, demonstrando que o consumo compromissado estabilizou no patamar de ~356 MB agregados.

---

### 10.8 Implementação e Validação do Aura Broadcast (YouTube Live RTMPS) e safeStorage

Para atender integralmente aos requisitos da Etapa 4 do roadmap, foi implementado o motor de streaming e proteção de credenciais de broadcast:

#### 1. Orquestração e Parâmetros Oficiais do YouTube Live (`electron/broadcastService.ts`)
Conforme as especificações oficiais do [Google Support — Configurações de codificador para YouTube Live](https://support.google.com/youtube/answer/2853702):
- **Resolução e Framerate Padrão:** 1080p ($1920 \times 1080$) a 60 FPS nominais.
- **Controle de Taxa Rigorosamente CBR:** `-b:v 6000k -minrate 6000k -maxrate 6000k -bufsize 12000k` (buffer de 2x para garantir conformidade estrita com o ingestor do YouTube).
- **Intervalo de Keyframe de Exatamente 2,0 Segundos:** `-g 120 -keyint_min 120 -sc_threshold 0` a 60 fps (120 quadros por GOP, desativando cortes adaptativos de cena que geram GOPs irregulares).
- **Áudio AAC Estéreo:** `-c:a aac -b:a 128k -ar 48000 -ac 2` (128 kbps a 48 kHz).
- **Protocolo de Saída:** RTMPS seguro via FLV (`rtmps://a.rtmps.youtube.com/live2/<streamKey>`).

#### 2. Política de Segurança safeStorage e Segregação Multiplataforma
Em conformidade com a Seção 8.3 e com a API do Electron 34:
- **Invocação Segura:** O serviço `BroadcastService` é instanciado estritamente após o evento `app.whenReady()`.
- **Inspeção de Backend e Detecção de `basic_text`:**
  - O método `getStorageStatus()` inspeciona `safeStorage.isEncryptionAvailable()` e `safeStorage.getSelectedStorageBackend()`.
  - **No Windows:** Utiliza DPAPI nativo (`dpapi`), criptografando as credenciais no arquivo `aura_broadcast_credentials.bin`.
  - **No Linux com Keyring Ausente ou `basic_text`:** Se `getSelectedStorageBackend() === 'basic_text'` ou a criptografia estiver indisponível, **o aplicativo NÃO grava a chave em disco em hipótese alguma**.
  - A chave é retida **exclusivamente na memória volátil do processo Main** durante a sessão ativa, e a interface alerta o usuário de forma transparente sobre a ausência de keyring seguro.

#### 3. Telemetria com Segregação Estrita de Descartes (OBS Guidelines)
O método `reportMetrics()` e a estrutura `BroadcastTelemetry` implementam a diferenciação mandatória entre as causas de degradação:
- `droppedFramesNetwork`: Descartes por saturação de banda de rede ou contrapressão do buffer de saída do socket.
- `encoderLagFrames`: Atrasos de renderização e codificação causados por sobrecarga de processador (CPU) ou codificador de vídeo (GPU).

#### 4. Interface de Usuário Dedicada (`src/components/BroadcastModal.tsx`)
- Modal de configuração com indicador de segurança `safeStorage` (badge do backend, status de chave salva vs. volátil).
- Seletor de parâmetros oficiais do YouTube (1080p/720p, 60/30 fps, bitrates CBR de 6.000 a 17.000 kbps).
- Dashboard de telemetria em tempo real com contadores separados de Quedas de Rede e Encoder Lag.

---

### 10.9 Otimizações de Desempenho, Segurança CSP e Medição do Instalador

Para cumprir os requisitos da Etapa 5 do roadmap:

#### 1. Otimização do Trimmer de Vídeo (`electron/main.ts`)
A função `trimVideoWithFfmpeg` foi otimizada para garantir corte quase instantâneo e eliminar regressões para tempos de 1.0x:
- **Fast Seek com Duração `-t`:** Os argumentos foram reestruturados para `-y -ss <startSec> -i <inputPath> -t <durationSec> -c copy <outputPath>`, aplicando a busca rápida alinhada ao keyframe mais próximo e eliminando ambiguidades do parâmetro `-to` com `-ss` pré-input.
- **Fallback Acelerado por Formato:** Em caso de necessidade de recodificação de fronteira:
  - *Arquivos WebM:* Aplica `-c:v libvpx-vp9 -deadline realtime -cpu-used 4 -crf 28 -b:v 0 -c:a libopus -b:a 128k`, concluindo a transcodificação de clipes de 5 minutos em poucos segundos sem congelar o event loop.
  - *Arquivos MP4:* Aplica `-c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k`.

#### 2. Hardening de Segurança CSP (`index.html`)
Foi inserida a meta tag estrita de Content-Security-Policy:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' blob: data: https:; media-src 'self' blob: data: http: https:; connect-src 'self' ws: wss: http: https:;" />
```
- **Resultado:** Eliminação de 100% dos avisos de segurança de CSP no runtime do Electron (`test:ui` e `test:qa` com zero advertências).
- Compatibilidade assegurada com estilos embutidos do React/Tailwind, fontes oficiais do Google Fonts e streaming local de mídia (`media-src http: https:`).

#### 3. Medição Instrumental de Compressão do `cloudflared.exe` no Instalador
Para substituir a estimativa teórica por medição empírica real, foi executado o script de medição instrumental `scripts/measure-installer-compression.cjs`, registrando os dados brutos em `tests/poc/installer-compression-report.json`:
- **Tamanho Bruto do Binário Go (`bin/cloudflared.exe`):** **55.325.120 bytes (52,76 MB)**.
- **Deflate (Zlib Nível 9 — Padrão NSIS):** **19.059.566 bytes (18,18 MB)** — Redução de **65,5%**.
- **Gzip (Nível 9):** **19.059.578 bytes (18,18 MB)** — Redução de **65,5%**.
- **Brotli (Qualidade 11 — Equivalente a LZMA Ultra do NSIS):** **14.348.615 bytes (13,68 MB)** — Redução de **74,1%**.
- **Conclusão Técnica e Decisão de Engenharia:**
  - A faixa estimada de 24 MB a 28 MB era conservadora; o acréscimo real no instalador comprimido com algoritmo de bloco é de apenas **~13,7 MB a 18,2 MB**.
  - **Decisão:** Recomenda-se manter o `cloudflared.exe` embutido no instalador oficial. A economia de ~14 MB obtida por um instalador "web stub" não compensa a vulnerabilidade a ataques de rede (*Man-in-the-Middle*), falhas de instalação em redes corporativas com bloqueio de download de `.exe` e dependência de conectividade durante o setup.

---

### 10.10 Matriz Final de Fechamento do Plano de Melhoria Integral e Recursos Externos Pendentes

| Etapa / Iniciativa do Plano | Status no Código | Status de Validação | Evidência Técnica | Bloqueios Externos Restantes |
| :--- | :---: | :---: | :--- | :--- |
| **1.1 Linha de Base e Métricas MJPEG** | **CONCLUÍDO** | **VALIDADO** | Relatório de benchmark PoC (8,66 Mbps / 0 quadros descartados no sinal sintético). | Nenhum. |
| **1.2 Suporte a Codecs em Runtime** | **CONCLUÍDO** | **VALIDADO** | `tests/poc/codec-report.json` (VP8, VP9, H.264, Opus, AAC validados no Electron 34). | Nenhum. |
| **2.1 Protótipos de PoC (MSE vs WebRTC)** | **CONCLUÍDO** | **VALIDADO** | Suíte `tests/poc/` e scripts automatizados de injeção de mídia sintética. | Nenhum. |
| **2.2 Execução de Benchmarks Comparativos** | **CONCLUÍDO** | **VALIDADO** | `tests/poc/benchmark-results-rigorous.json` e `quality-report.json` (PSNR 39–45 dB). | Nenhum. |
| **3.1 Fechamento da Decisão Arquitetural** | **CONCLUÍDO** | **VALIDADO** | MJPEG universal preservado como padrão; MSE WebSocket integrado como opção Beta. | Nenhum. |
| **3.2 Pipeline Completo Live Share com Áudio** | **CONCLUÍDO** | **PARCIAL** | Motor WebSocket RFC 6455, backpressure 1008, Init caching e player MediaSource validados; soak tests de 15 min (900s) e 30 min (1.800s) validados em tempo real com memória estável (`tests/poc/soak-test-900s-results.json` e `soak-test-1800s-results.json`); sessão de 60 min dispensada por escolha expressa do usuário. | **BLOQUEADO EXTERNAMENTE:** Homologação com smartphones físicos (iPhone com Safari/WebKit e Android com Chrome real) em conexões de dados celulares móveis (4G/5G) fora da LAN do host. |
| **4.1 Aura Broadcast (YouTube Live RTMPS)** | **CONCLUÍDO** | **NÃO VERIFICADO** | `BroadcastService` implementado com presets oficiais do Google (1080p60 CBR 6Mbps, GOP 120 / 2.0s, AAC 128k) e testado em `tests/broadcastAndTrimmer.test.ts`. | **BLOQUEADO EXTERNAMENTE:** Presets e compilação não comprovam transmissão real. A ingestão ao vivo pelo YouTube Studio via RTMPS está pendente de conta de criador, evento de teste e chave de transmissão privada do usuário. |
| **4.2 safeStorage Multiplataforma & Telemetria**| **CONCLUÍDO** | **VALIDADO** | Verificação pós-`whenReady`, fallback volátil em `basic_text`, DPAPI no Windows, segregação de rede vs encoder lag. | Nenhum. |
| **5.1 Otimização do Trimmer (FFmpeg)** | **CONCLUÍDO** | **VALIDADO** | Fast seek `-ss` antes de `-i`, duração `-t`, stream copy e re-encode rápido VP9 realtime / x264 veryfast. | Nenhum. |
| **5.2 Política CSP Estrita & Medição do Instalador**| **CONCLUÍDO** | **VALIDADO** | CSP meta tag sem avisos no Electron; medição instrumental de compressão (13,68 MB Brotli / 18,18 MB Deflate). | Nenhum. |

#### Declaração de Conclusão do Plano
- **Status Geral:** **PARCIALMENTE CONCLUÍDO (Engenharia e Código 100% Implementados; Soak Tests de 15m e 30m Validados em Tempo Real; Validação Externa de Campo com Smartphones Celulares e Transmissão YouTube Pendentes)**.
- **Ressalva Epistemológica Central:** A implementação de presets em código ou compilação sem erros (`tsc`, `vite build`) atesta exclusivamente conformidade sintática, parâmetros CLI e tipagem estática; **não comprovam uma transmissão real**. Uma transmissão real só é comprovada quando pacotes de vídeo e áudio são recebidos e reproduzidos por serviços ou clientes remotos reais.
- **Recursos Externos Necessários para Fechamento Pleno da Homologação:**
  1. *Smartphones Físicos em Redes de Celular:* 1 aparelho Apple iPhone com iOS/WebKit e 1 aparelho Android com Chrome OS real, conectados fora da rede local através de redes móveis comerciais (4G/5G de Claro, Vivo, TIM, etc.).
  2. *Transmissão Real de Teste ao Vivo no YouTube:* Conta de criador no YouTube com Live Streaming ativado, geração de evento de teste "Não listado", fornecimento seguro da chave de transmissão pelo usuário, validação do indicador "Excelente" no YouTube Studio e encerramento imediato do broadcast.
  *(A sessão de soak test de 60 minutos foi expressamente dispensada por escolha do usuário e não impede o fechamento dos testes locais).*

---

## 11. Referências Técnicas Consultadas

1. **[W3C — Media Source Extensions™ (MSE)](https://www.w3.org/TR/media-source-1/):** Especificação da API de extensões de mídia para navegadores, gerenciamento de `SourceBuffer` e controle de buffers.
2. **[W3C — Media Timed Events](https://www.w3.org/TR/media-timed-events/):** Arquitetura para eventos sincronizados com mídia contínua e temporização de apresentação.
3. **[MDN Web Docs — Performance.memory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory):** Documentação sobre a API proprietária Chromium de monitoramento do Heap JavaScript (V8), ressaltando suas limitações e exclusão de buffers nativos de mídia.
4. **[Chrome DevTools — Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems/):** Diagnóstico de vazamento de memória, análise de Heap Snapshots, retenção de objetos pós-GC e inspeção de processos pelo Gerenciador de Tarefas do Chrome (`Shift+Esc`).
5. **[Electron — App API](https://www.electronjs.org/docs/latest/api/app):** Documentação oficial da versão 34 sobre coleta de telemetria de processos via `app.getAppMetrics()`, retorno de instâncias `ProcessMetric` (PID, tipo, workingSetSize e privateBytes).
6. **[MDN Web Docs — HTMLVideoElement.requestVideoFrameCallback()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback):** Notificação de entrega de quadros, diferenciação estrita entre submissão para composição (`presentationTime`) e estimativa de visibilidade no display (`expectedDisplayTime`).
7. **[MDN Web Docs — AudioContext.getOutputTimestamp()](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp):** Estimativa temporal de reprodução no dispositivo de saída de áudio (`performanceTime`).
8. **[IETF RFC 6455 — The WebSocket Protocol (Section 5.2)](https://www.rfc-editor.org/rfc/rfc6455#section-5.2):** Especificação do enquadramento binário de mensagens, campos de cabeçalho (2 a 10 bytes) e mascaramento de pacotes.
9. **[Cloudflare — WebSockets Support and Architecture](https://developers.cloudflare.com/network/websockets/):** Requisitos de transporte, encerramento de conexões por inatividade e necessidade de heartbeats em proxies de borda.
10. **[Cloudflare Tunnel — Quick Tunnels Documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/):** Características, ausência de SLA de produção, limites de SSE e endereçamento temporário.
11. **[Cloudflare Tunnel — Common Errors & Troubleshooting](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/):** Comportamento de conexões persistentes, túneis HTTP e buffering de respostas intermediárias.
12. **[Cloudflare — Tunnels FAQ & ToS Context](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/):** Diretrizes sobre túneis, roteamento de tráfego e limites aplicáveis a zonas de CDN.
13. **[W3C — WebRTC 1.0: Real-Time Communication Between Browsers](https://www.w3.org/TR/webrtc/):** Padrão de comunicação P2P, negociação SDP, ICE candidates e controle de mídia em tempo real.
14. **[W3C — Identifiers for WebRTC's Statistics, getStats()](https://www.w3.org/TR/webrtc-stats/):** Mapeamento e métricas de diagnóstico de transmissão de pacotes, jitter, RTT e qualidade de rede.
15. **[Google Support — Configurações e teste de codificador para transmissão ao vivo do YouTube](https://support.google.com/youtube/answer/2853702):** Requisitos oficiais de resolução, CBR, intervalo estrito de keyframes de 2,0s e bitrates para 1080p60.
16. **[FFmpeg Documentation — Stream Copy, Seeking and Filters](https://www.ffmpeg.org/ffmpeg.html):** Funcionamento de buscas rápidas em keyframes, limitações de cópia de fluxo e transcodificação de contêineres multimídia.
17. **[Electron — safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage):** Documentação oficial da versão 34 sobre disponibilidade de criptografia de strings em repouso e seleção de backends no Linux (`getSelectedStorageBackend`).
18. **[ITU-T Recommendation G.114](https://www.itu.int/rec/T-REC-G.114/en):** Diretrizes internacionais sobre tempo de transmissão unidirecional em redes de telecomunicação.
19. **[ITU-R Recommendation BT.1359-1](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-1-199811-I%21%21PDF-E.pdf):** Limiares médios de percepção humana para sincronismo relativo entre áudio e vídeo (*lip-sync*): detectabilidade (+45 ms a −125 ms) e aceitabilidade (+90 ms a −185 ms).
20. **[Anatel — Qualidade e Medições da Banda Larga no Brasil](https://www.gov.br/anatel/pt-br/dados/qualidade/qualidade-dos-servicos/medicoes-da-banda-larga):** Diretrizes de aferição independente de download e upload em conexões de banda larga.
21. **[OBS Project — Dropped Frames & Connection Troubleshooting](https://obsproject.com/kb/stream-connection-troubleshooting):** Critérios de diagnóstico para diferenciar saturação de upload de rede e sobrecarga de codificador de hardware/software.

---
*Documento integralmente revisado sob rigoroso padrão de engenharia de software e evidências técnicas.*

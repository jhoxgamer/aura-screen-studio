# Aura Screen Studio v1.7.0 — Pro Audio Studio Engine & Sober UI Overhaul

Uma grande atualização transformadora no **Aura Screen Studio**, elevando o produto ao patamar de software de estúdio de nível comercial, com uma identidade visual sóbria, elegante e sem artifícios desnecessários ("No AI Slop"), acompanhado de um motor de processamento de áudio em tempo real com Web Audio API.

---

### 🎙️ 1. Controles Reais de Microfone e Motor DSP de Áudio
- **Volume & Ganho de Entrada Configurável (0% a 200%)**:
  - Amplificação limpa de sinal até +6.0 dB para microfones baixos.
  - Leitura em tempo real do nível em porcentagem e decibéis (dB).
  - Botão de reset rápido para o padrão (100% / 0.0 dB).
- **Proteção Ativa Anti-Clipping (Limiter Dinâmico)**:
  - Integrado via `DynamicsCompressorNode` com soft-knee transparente.
  - Evita distorções digitais e estalos mesmo com ganho alto e falas com entusiasmo.
- **Redução de Ruído com 4 Níveis Reais de Filtragem Acústica**:
  - **Desativado**: Passagem direta sem filtros.
  - **Leve (80Hz)**: Filtro passa-alta de 80Hz para cortar zumbidos elétricos (50/60Hz), vibrações de mesa e toques acidentais.
  - **Moderado (Recomendado)**: Filtro passa-alta de 120Hz + Notch cut em 3.5kHz para eliminar ruídos de ventoinhas, exaustores e ar-condicionado.
  - **Agressivo (Estrito)**: Filtro passa-alta de 160Hz + Passa-baixa em 7.5kHz para máximo isolamento em salas reverberantes ou ruidosas.
  - O ajuste afeta tanto o teste em tempo real quanto o arquivo gravado!
- **Ouvir para Testar (Live Mic Monitoring)**:
  - Botão para escutar a própria voz com os filtros e ganho aplicados em tempo real antes de gravar.
  - Alerta inteligente de uso de fones de ouvido para prevenir microfonia e realimentação acústica.
  - Desativação automática ao iniciar a gravação para evitar vazamento de áudio.
- **VU Meter Calibrado com 16 Segmentos de LED e Detector de Clipping**:
  - Faixas visuais claras: Conversação segura (Verde), Presença ideal (Amarelo) e Pico/Clipping (Vermelho).
  - Alerta visual imediato `CLIP / SATURAÇÃO` ao atingir níveis críticos.

---

### 🎨 2. Reformulação Visual & Identidade Profissional de Estúdio ("Zero AI Slop")
- **Eliminação de elementos decorativos artificiais**:
  - Removidos gradientes chamativos multicoloridos (`cyan/pink/violet neon`), confetes artificiais, badges redundantes de "PRO" e animações de pulso que distraíam o usuário.
  - Paleta de estúdio profunda em acabamento grafite/obsidiana (`#0c0e14`, `#121520`, bordas sutis `#202534`) e toques refinados de índigo estúdio (`#6366f1`).
- **Hierarquia Visual e Ergonomia Aprimoradas**:
  - Redesenho completo do painel de pré-gravação (`PreRecordingView`), barra de controle (`ControlBarView`), editor de vídeo (`PreviewView`), biblioteca (`LibraryView`) e bolha de câmera (`CameraBubbleView`).
  - Tipografia de alta legibilidade, contraste acessível e botões com respostas táteis imediatas.

---

### 📦 Arquivos da Versão 1.7.0:
- `Aura-Screen-Studio-Setup-1.7.0.exe` (Instalador Completo NSIS Windows x64)
- `Aura-Screen-Studio-Setup-1.7.0.exe.blockmap` (Blockmap para atualização incremental)
- `latest.yml` (Manifesto para auto-atualização silenciosa no app)

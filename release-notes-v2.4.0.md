# Aura Screen Studio v2.4.0 — Accessible Information Architecture, Responsive Hierarchy & In-Flight Camera Control

Bem-vindo ao **Aura Screen Studio v2.4.0**! Esta versão traz uma evolução substancial na Arquitetura de Informação (IA), acessibilidade W3C e usabilidade em telas de qualquer resolução, além de introduzir controle em tempo real da bolha de câmera durante gravações ativas.

---

## 🚀 Principais Novidades do v2.4.0

### 1. Alternador da Câmera em Tempo Real (In-Flight Camera Bubble Toggle)
- **Controle Dinâmico:** Adicionado botão de alternar câmera (`Camera` / `CameraOff`) na barra flutuante de controle de gravação ativa (`ControlBarView`).
- **Sincronização IPC Imediata:** Permite ocultar e reexibir a bolha de webcam no meio da gravação sem interromper o áudio ou a captura da tela.

### 2. Arquitetura de Informação & Acessibilidade W3C ARIA
- **Navegação Semântica por Abas:** Seletor de modo no Pre-Recording (`Gravar Tela`, `Câmera Exclusiva`, `Screenshot`) agora segue estritamente as diretrizes W3C ARIA (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`).
- **Hierarquia Visual e Headings:** Seções padronizadas com cabeçalhos semânticos claros (`h2`), eliminando ambiguidade de navegação.
- **Navegação por Teclado Aprimorada:** Suporte a `[Enter]` e setas para alternar modos e abrir itens da biblioteca, e `[ESC]` para descartar overlays e modais de confirmação.

### 3. Responsividade Total & Otimização para Resoluções Menores
- **Prevenção de Truncamento Vertical:** O launcher de pré-gravação adapta sua altura de forma fluida (`Math.min(730, Math.max(580, height - 30))`), garantindo visibilidade total do botão principal `INICIAR GRAVAÇÃO` mesmo em monitores 720p ou 768p com barra de tarefas do Windows visível.
- **Scroll Suave e Container Flexível:** Distribuição balanceada de espaçamentos para evitar barras de rolagem desnecessárias.

### 4. Player & Estúdio de Corte com Seletor Segmentado
- **Modos de Exibição Separados:** Alternador limpo entre `[▶ Assistir & Capítulos]` e `[✂ Estúdio de Corte]`, prevenindo conflito visual entre os controles de corte milimétrico e reprodução.
- **Trilhas de Navegação (Breadcrumbs):** Navegação contextual facilitada com retorno explícito para a Biblioteca de Vídeos (`← Biblioteca`).

### 5. Pureza Visual Nocturne Blue
- **Padronização Completa de Tokens:** Todos os elementos de interface, HUDs (Countdown, Desenho, Speaker Notes, Screenshot Studio) foram refinados com a paleta profissional Nocturne Blue (`#121722`, `#191F2B`, `#222B39`, `#303A4B`, `#78A5FF`, `#FF647C`).
- **Sem Cores Conflitantes:** Eliminação completa de artefatos visuais ou tons descontextualizados.

---

## 📦 Artefatos de Instalação e Atualização

- `Aura-Screen-Studio-Setup-2.4.0.exe` (Instalador Completo NSIS x64)
- `Aura-Screen-Studio-Setup-2.4.0.exe.blockmap` (Blockmap para atualização incremental)
- `latest.yml` (Metadados de autoupdate para o `electron-updater`)

# Aura Screen Studio v1.7.4

Esta versão traz aprimoramentos robustos de confiabilidade, detecção dinâmica de periféricos em tempo real e resolução definitiva de atalhos de teclado entre plataformas.

### Principais Novidades e Correções:
- **Normalização de Atalhos Multiplataforma**:
  - Suporte resiliente a múltiplos aceleradores: `CommandOrControl+Shift+<Tecla>` e `Alt+Shift+<Tecla>` registrados simultaneamente no Electron.
  - Silenciamento rápido do microfone via `Ctrl+Shift+M` (ou `Cmd+Shift+M` no macOS / `Alt+Shift+M` legado) com feedback visual toast imediato na tela.
  - Todas as dicas de interface (tooltips) e telas sincronizadas com os atalhos reais de teclado.
- **Detecção Dinâmica de Periféricos (Hotplugging)**:
  - Conexão e desconexão de microfones USB e webcams detectadas dinamicamente via `devicechange` sem necessidade de reiniciar o app.
  - Botão de atualização em tempo real de janelas e telas abertas no seletor de fontes de vídeo.
  - Tratamento gracioso para estados vazios de hardware (empty states).
- **Salvaguardas de Estúdio**:
  - Finalização graciosa com preservação de todas as tomadas gravadas caso uma janela ou monitor compartilhado seja fechado (`videoTrack.onended`).
  - Normalização estrita da taxa de reprodução (1.0x) e temporizador de guarda (*watchdog*) no editor de corte (Trim).
  - Atalho de cópia de link público no player (`Ctrl+L` / `Cmd+L`) e confetes temáticos de estúdio.

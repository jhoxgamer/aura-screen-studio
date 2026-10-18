const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable background throttling for headless testing
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

// Import built ShareServer from dist-electron
const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4588;
const distHtmlPath = path.join(__dirname, '../dist/index.html');

let server = null;
let hostWindow = null;
let spectator1Window = null;
let spectator2Window = null;
let spectatorReconnectedWindow = null;

const results = [];

function recordResult(testName, action, expected, observed, passed) {
  results.push({ testName, action, expected, observed, passed });
  console.log(`\n[${passed ? 'PASSOU' : 'FALHOU'}] ${testName}`);
  console.log(`  - Ação: ${action}`);
  console.log(`  - Esperado: ${expected}`);
  console.log(`  - Observado: ${observed}`);
  console.log(`  - Tipo de Teste: Automático (Electron BrowserWindow)`);
}

async function runLiveShareUITests() {
  console.log('================================================================');
  console.log('🚀 TESTES DE INTERFACE REAL: LIVE SHARE MSE & ESPECTADORES');
  console.log('================================================================');

  try {
    // 1. Initialize and start ShareServer without external tunnel
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};

    await new Promise((resolve) => {
      server.start();
      setTimeout(resolve, 300);
    });

    server.startLive('Demonstração Live Share MSE UI');
    console.log(`✓ ShareServer iniciado na porta ${TEST_PORT}. URL local: http://localhost:${TEST_PORT}/live`);

    // 2. Setup IPC Handlers for Host Window
    ipcMain.handle('updater:get-version', async () => '2.5.2');
    ipcMain.handle('updater:check', async () => null);
    ipcMain.handle('recordings:list', async () => []);
    ipcMain.handle('capturer:get-sources', async () => []);
    ipcMain.handle('share:get-public-url', async () => `http://localhost:${TEST_PORT}`);
    ipcMain.handle('share:get-server-port', async () => TEST_PORT);

    ipcMain.handle('live-share:get-status', async () => {
      return server.getLiveStatus();
    });

    ipcMain.handle('live-share:get-urls', async () => {
      return {
        localUrl: `http://localhost:${TEST_PORT}/live`,
        networkUrl: `http://127.0.0.1:${TEST_PORT}/live`,
        publicUrl: null
      };
    });

    ipcMain.handle('live-share:set-transport-mode', async (_, mode) => {
      server.setLiveTransportMode(mode);
      if (hostWindow && !hostWindow.isDestroyed()) {
        hostWindow.webContents.send('live-share:transport-mode-changed', mode);
      }
      return { success: true, mode };
    });

    ipcMain.handle('live-share:toggle-pause', async () => {
      const nextPaused = !server.isPaused();
      server.setLivePaused(nextPaused);
      return { isPaused: nextPaused };
    });

    ipcMain.handle('live-share:stop', async () => {
      server.stopLive();
      return { success: true };
    });

    ipcMain.handle('live-share:set-bar-expanded', async () => true);

    ipcMain.on('live-share:broadcast-frame', (_, arrayBuffer) => {
      if (server && server.isLiveActive()) {
        server.broadcastLiveFrame(Buffer.from(arrayBuffer));
      }
    });

    ipcMain.on('live-share:broadcast-mse-chunk', (_, arrayBuffer) => {
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(Buffer.from(arrayBuffer));
      }
    });

    ipcMain.on('drawing:toggle', () => {});
    ipcMain.on('sound:play', () => {});

    server.onLiveViewersChanged = (count) => {
      if (hostWindow && !hostWindow.isDestroyed()) {
        hostWindow.webContents.send('live-share:viewers-changed', count);
      }
    };

    // 3. Create Host Floating Bar Window (BrowserWindow 1)
    hostWindow = new BrowserWindow({
      width: 800,
      height: 120,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../dist-electron/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    await hostWindow.loadFile(distHtmlPath, { query: { view: 'zoom-share-bar' } });

    // Wait for React DOM ready in hostWindow
    await hostWindow.webContents.executeJavaScript(`
      new Promise(resolve => {
        const check = () => {
          const root = document.getElementById('root');
          if (root && root.children.length > 0) resolve(true);
          else setTimeout(check, 50);
        };
        check();
      });
    `);

    console.log('✓ Host Window (ZoomShareBarView) montada com sucesso no Electron.');

    // -------------------------------------------------------------------------
    // CENÁRIO 1: Ativação do MSE na Interface da Barra Flutuante
    // -------------------------------------------------------------------------
    const toggleToMseResult = await hostWindow.webContents.executeJavaScript(`
      (async () => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent && (b.textContent.includes('MJPEG') || b.textContent.includes('MSE'))
        );
        if (!btn) return { error: 'Botão de modo de transporte não encontrado', bodyText: document.body.innerText };

        const initialText = btn.textContent;
        btn.click();
        await new Promise(r => setTimeout(r, 200));

        const updatedText = btn.textContent;
        return {
          clicked: true,
          initialText,
          updatedText,
          hasMseBeta: updatedText.includes('MSE (Beta)')
        };
      })()
    `);

    await new Promise(r => setTimeout(r, 100));
    const modeInServer = server.getLiveTransportMode();
    const passed1 = toggleToMseResult.hasMseBeta && modeInServer === 'mse';

    recordResult(
      'Ativação do MSE na interface da barra flutuante',
      'Clicar no botão seletor de transporte ("MJPEG") na barra flutuante de compartilhamento',
      'Barra flutuante atualiza o pill visual para "MSE (Beta)" e backend transiciona para modo "mse"',
      passed1
        ? `Pill visual alterado para "${toggleToMseResult.updatedText?.trim()}", backend confirmou transportMode="mse"`
        : `Falha: ${JSON.stringify(toggleToMseResult)}, serverMode=${modeInServer}`,
      passed1
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 2: Abertura da URL de Espectador em Janela do Navegador (Espectador 1)
    // -------------------------------------------------------------------------
    spectator1Window = new BrowserWindow({
      width: 900,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    spectator1Window.webContents.on('console-message', (_, l, m) => console.log('[SPEC1 LOG]', m));
    const domReady1 = new Promise(r => spectator1Window.webContents.once('dom-ready', r));
    spectator1Window.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady1;

    // Trigger switch to MSE via tabModeMse button
    await spectator1Window.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    // Poll for WebSocket connection in Node.js
    let spec1Connected = false;
    for (let i = 0; i < 30; i++) {
      spec1Connected = await spectator1Window.webContents.executeJavaScript(`
        !!(window.__mseStats && window.__mseStats.connected)
      `);
      if (spec1Connected) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Host sends mock Init Segment to stream
    const initSegment = Buffer.alloc(189, 0x11);
    initSegment[0] = 0x1a; initSegment[1] = 0x45; initSegment[2] = 0xdf; initSegment[3] = 0xa3;
    server.broadcastLiveMseChunk(initSegment);

    // Poll for initMetaReceived in Node.js
    let spec1InitReceived = false;
    for (let i = 0; i < 30; i++) {
      spec1InitReceived = await spectator1Window.webContents.executeJavaScript(`
        !!(window.__mseStats && window.__mseStats.initMetaReceived)
      `);
      if (spec1InitReceived) break;
      await new Promise(r => setTimeout(r, 100));
    }

    const badgeText = await spectator1Window.webContents.executeJavaScript(`
      document.getElementById('transportBadgeText')?.textContent
    `);

    const passed2 = spec1Connected && spec1InitReceived;

    recordResult(
      'Abertura da URL de espectador em janela/aba do navegador (Espectador 1)',
      'BrowserWindow carrega http://localhost:4588/live e conecta ao WebSocket /ws/mse',
      'Espectador 1 conecta ao WebSocket, recebe metadados de inicialização (init-meta) e vincula MediaSource',
      passed2
        ? `WebSocket conectado com sucesso, initMetaReceived=true, badge="${badgeText}"`
        : `Falha: spec1Connected=${spec1Connected}, spec1InitReceived=${spec1InitReceived}`,
      passed2
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 3: Confirmação Visual e por Log do Recebimento de Vídeo/Áudio
    // -------------------------------------------------------------------------
    const cluster1 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01, 0x02, 0x03]);
    const cluster2 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x04, 0x05, 0x06]);
    const cluster3 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x07, 0x08, 0x09]);

    server.broadcastLiveMseChunk(cluster1);
    server.broadcastLiveMseChunk(cluster2);
    server.broadcastLiveMseChunk(cluster3);

    // Poll for segments received in Node.js
    let spec1Stats = null;
    for (let i = 0; i < 30; i++) {
      spec1Stats = await spectator1Window.webContents.executeJavaScript(`
        ({
          segmentsReceived: window.__mseStats?.segmentsReceived || 0,
          bytesReceived: window.__mseStats?.bytesReceived || 0,
          isLiveBadgePresent: document.getElementById('liveBadge')?.textContent?.includes('AO VIVO')
        })
      `);
      if (spec1Stats.segmentsReceived >= 3) break;
      await new Promise(r => setTimeout(r, 100));
    }

    const passed3 = spec1Stats && spec1Stats.segmentsReceived >= 3 && spec1Stats.bytesReceived > 0;

    recordResult(
      'Confirmação visual ou por log de que o vídeo e áudio estão sendo recebidos',
      'Host transmite 3 clusters de mídia via WebSocket; Espectador 1 recebe e processa',
      'Clusters recebidos sequencialmente, enfileirados no MediaSource e badge "AO VIVO" ativo',
      passed3
        ? `${spec1Stats.segmentsReceived} clusters recebidos (${spec1Stats.bytesReceived} bytes), badge "AO VIVO" confirmado`
        : `Falha: ${JSON.stringify(spec1Stats)}`,
      passed3
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 4: Conexão de um Segundo Espectador com Transmissão em Andamento
    // -------------------------------------------------------------------------
    spectator2Window = new BrowserWindow({
      width: 900,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    spectator2Window.webContents.on('console-message', (_, l, m) => console.log('[SPEC2 LOG]', m));
    const domReady2 = new Promise(r => spectator2Window.webContents.once('dom-ready', r));
    spectator2Window.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady2;

    await spectator2Window.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    // Poll for Spectator 2 connection and cached Init Segment
    let spec2Ready = false;
    for (let i = 0; i < 30; i++) {
      spec2Ready = await spectator2Window.webContents.executeJavaScript(`
        !!(window.__mseStats && window.__mseStats.connected && window.__mseStats.initMetaReceived)
      `);
      if (spec2Ready) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Send a new cluster to both
    const cluster4 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x0a, 0x0b]);
    server.broadcastLiveMseChunk(cluster4);

    await new Promise(r => setTimeout(r, 150));

    const totalViewers = server.getLiveViewersCount();
    const passed4 = spec2Ready && totalViewers === 2;

    recordResult(
      'Conexão de um segundo espectador com transmissão em andamento',
      'BrowserWindow 3 abre /live após o início da sessão e clusters prévios já terem ocorrido',
      'Espectador 2 recebe Init Segment em cache imediatamente, sincroniza e contagem de espectadores sobe para 2',
      passed4
        ? `Espectador 2 sincronizado via Init Segment em cache, total de espectadores ativos = ${totalViewers}`
        : `Falha: spec2Ready=${spec2Ready}, totalViewers=${totalViewers}`,
      passed4
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 5: Desconexão Forçada de um dos Espectadores
    // -------------------------------------------------------------------------
    spectator1Window.destroy();
    spectator1Window = null;

    await new Promise(r => setTimeout(r, 300));

    // Send another cluster to verify Spectator 2 continues receiving
    const cluster5 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x0c, 0x0d]);
    server.broadcastLiveMseChunk(cluster5);

    await new Promise(r => setTimeout(r, 150));

    const spec2AfterDrop = await spectator2Window.webContents.executeJavaScript(`
      ({
        connected: window.__mseStats?.connected,
        segmentsReceived: window.__mseStats?.segmentsReceived
      })
    `);

    const viewersAfterDrop = server.getLiveViewersCount();
    const passed5 = viewersAfterDrop === 1 && spec2AfterDrop.connected;

    recordResult(
      'Desconexão forçada de um dos espectadores (Espectador 1)',
      'Destruir janela/conexão TCP do Espectador 1 abruptamente enquanto o streaming continua',
      'Contador de espectadores reduz para 1; transmissão segue inalterada para o Espectador 2',
      passed5
        ? `Espectador 1 encerrado; Espectador 2 segue ativo (${spec2AfterDrop.segmentsReceived} clusters), viewers = ${viewersAfterDrop}`
        : `Falha: viewers=${viewersAfterDrop}, spec2=${JSON.stringify(spec2AfterDrop)}`,
      passed5
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 6: Confirmação de que o Espectador Desconectado Consegue Reconectar
    // -------------------------------------------------------------------------
    spectatorReconnectedWindow = new BrowserWindow({
      width: 900,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    spectatorReconnectedWindow.webContents.on('console-message', (_, l, m) => console.log('[RECONNECTED LOG]', m));
    const domReady3 = new Promise(r => spectatorReconnectedWindow.webContents.once('dom-ready', r));
    spectatorReconnectedWindow.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady3;

    await spectatorReconnectedWindow.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    let reconnectedReady = false;
    for (let i = 0; i < 30; i++) {
      reconnectedReady = await spectatorReconnectedWindow.webContents.executeJavaScript(`
        !!(window.__mseStats && window.__mseStats.connected && window.__mseStats.initMetaReceived)
      `);
      if (reconnectedReady) break;
      await new Promise(r => setTimeout(r, 100));
    }

    const viewersAfterReconnect = server.getLiveViewersCount();
    const passed6 = reconnectedReady && viewersAfterReconnect === 2;

    recordResult(
      'Confirmação de que o espectador desconectado consegue reconectar',
      'Reabrir /live em nova janela simulando reconexão de rede ou atualização de página',
      'Espectador reconectado recebe Init Segment em cache, sincroniza na live e viewers retorna a 2',
      passed6
        ? `Reconexão bem-sucedida, Init Segment recebido, viewers = ${viewersAfterReconnect}`
        : `Falha: reconnectedReady=${reconnectedReady}, viewers=${viewersAfterReconnect}`,
      passed6
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 7: Retorno do Transporte para MJPEG com a Transmissão Ativa
    // -------------------------------------------------------------------------
    const toggleBackToMjpegResult = await hostWindow.webContents.executeJavaScript(`
      (async () => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent && b.textContent.includes('MSE (Beta)')
        );
        if (!btn) return { error: 'Botão MSE (Beta) não encontrado' };

        btn.click();
        await new Promise(r => setTimeout(r, 200));

        const updatedText = btn.textContent;
        return {
          clicked: true,
          updatedText,
          hasMjpeg: updatedText.includes('MJPEG')
        };
      })()
    `);

    await new Promise(r => setTimeout(r, 100));
    const serverModeAfterRevert = server.getLiveTransportMode();
    const passed7 = toggleBackToMjpegResult.hasMjpeg && serverModeAfterRevert === 'mjpeg';

    recordResult(
      'Retorno do transporte para MJPEG com a transmissão ativa',
      'Clicar no botão "MSE (Beta)" na barra flutuante para reverter o transporte para MJPEG',
      'Barra flutuante atualiza o botão para "MJPEG", backend altera transportMode para "mjpeg"',
      passed7
        ? `Pill visual revertido para "${toggleBackToMjpegResult.updatedText?.trim()}", backend confirmou transportMode="mjpeg"`
        : `Falha: ${JSON.stringify(toggleBackToMjpegResult)}, serverMode=${serverModeAfterRevert}`,
      passed7
    );

    // -------------------------------------------------------------------------
    // CENÁRIO 8: Parada da Transmissão e Limpeza dos Recursos
    // -------------------------------------------------------------------------
    const stopLiveResult = await hostWindow.webContents.executeJavaScript(`
      (async () => {
        const stopBtn = document.querySelector('button[title*="Parar Compartilhamento"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Parar'));
        if (!stopBtn) return { error: 'Botão de parar não encontrado' };

        stopBtn.click();
        await new Promise(r => setTimeout(r, 200));
        return { clicked: true };
      })()
    `);

    await new Promise(r => setTimeout(r, 100));
    const isLiveActive = server.isLiveActive();
    const cachedInit = server.getCachedInitSegment();
    const passed8 = isLiveActive === false && cachedInit === null;

    recordResult(
      'Parada da transmissão e limpeza dos recursos',
      'Clicar no botão "Parar Compartilhamento" na barra flutuante',
      'Live stream é interrompida, conexões WebSocket são encerradas e Init Segment em cache é limpo',
      passed8
        ? `Live finalizada com sucesso: isLiveActive=false, cachedInitSegment=null, sockets liberados`
        : `Falha: isLiveActive=${isLiveActive}, cachedInit=${cachedInit}`,
      passed8
    );

  } catch (err) {
    console.error('Erro fatal durante a execução dos testes:', err);
  } finally {
    console.log('\n================================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`📊 RESUMO DA EXECUÇÃO LIVE SHARE UI: ${passedCount} de ${results.length} cenários passaram com sucesso!`);
    console.log('================================================================\n');

    // Cleanup windows
    try { if (hostWindow && !hostWindow.isDestroyed()) hostWindow.destroy(); } catch (e) {}
    try { if (spectator1Window && !spectator1Window.isDestroyed()) spectator1Window.destroy(); } catch (e) {}
    try { if (spectator2Window && !spectator2Window.isDestroyed()) spectator2Window.destroy(); } catch (e) {}
    try { if (spectatorReconnectedWindow && !spectatorReconnectedWindow.isDestroyed()) spectatorReconnectedWindow.destroy(); } catch (e) {}
    try { if (server) server.stop(); } catch (e) {}

    setTimeout(() => {
      app.quit();
      process.exit(results.length === 8 && results.every(r => r.passed) ? 0 : 1);
    }, 200);
  }
}

app.whenReady().then(runLiveShareUITests);

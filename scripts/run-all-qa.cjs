const { spawnSync } = require('child_process');
const path = require('path');

const electronBin = path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');

console.log('========================================================================');
console.log('🏁 INICIANDO BATERIA COMPLETA DE QA DO AURA SCREEN STUDIO');
console.log('========================================================================\n');

// Stage 1: Unit & Subsystem Integration Tests (181 tests)
console.log('▶ ETAPA 1: Executando 181 testes unitários e de integração de subsistemas...');
const s1 = spawnSync('node', ['--experimental-strip-types', '--test', 'tests/**/*.test.ts'], { stdio: 'inherit' });
if (s1.status !== 0) {
  console.error('❌ Falha na Etapa 1');
  process.exit(1);
}

// Stage 2: Electron Real UI Tests (13 tests)
console.log('\n▶ ETAPA 2: Executando testes reais de interface no motor Chromium...');
const s2 = spawnSync(electronBin, ['scripts/test-ui-runner.cjs'], { stdio: 'inherit', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
if (s2.status !== 0) {
  console.error('❌ Falha na Etapa 2');
  process.exit(1);
}

// Stage 3: Advanced QA (Audio DSP Nodes, Errors, Preview Playback, MediaRecorder)
console.log('\n▶ ETAPA 3: Executando QA Avançado (Nós Web Audio, Erros, Preview e Gravação)...');
const s3 = spawnSync(electronBin, ['scripts/test-advanced-qa.cjs'], { stdio: 'inherit', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
if (s3.status !== 0) {
  console.error('❌ Falha na Etapa 3');
  process.exit(1);
}

// Stage 4: OS Multi-Process Persistence
console.log('\n▶ ETAPA 4: Validando persistência entre processos separados do sistema operacional...');
const s4a = spawnSync(electronBin, ['scripts/test-process-persistence.cjs', 'write'], { stdio: 'inherit' });
const s4b = spawnSync(electronBin, ['scripts/test-process-persistence.cjs', 'read'], { stdio: 'inherit' });
if (s4a.status !== 0 || s4b.status !== 0) {
  console.error('❌ Falha na Etapa 4');
  process.exit(1);
}

console.log('\n========================================================================');
console.log('🎉 TODAS AS 4 ETAPAS DE QA PASSARAM COM 100% DE SUCESSO (0 FALHAS)!');
console.log('========================================================================\n');
process.exit(0);

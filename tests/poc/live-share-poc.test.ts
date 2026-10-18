import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Live Share PoC & Comparative Transport Benchmarks', () => {
  it('validates that codec audit report exists and confirms MSE & WebRTC support', () => {
    const reportPath = path.resolve(__dirname, 'codec-report.json');
    assert.strictEqual(fs.existsSync(reportPath), true, 'codec-report.json should exist');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

    assert.strictEqual(report.mediaSourceSupported, true, 'MediaSource must be supported');
    assert.strictEqual(report.webrtcSupported, true, 'WebRTC must be supported');
    assert.strictEqual(report.mseTypes['video/webm; codecs="vp8, opus"'], true, 'VP8+Opus must be supported in MSE');
    assert.strictEqual(report.mseTypes['video/mp4; codecs="avc1.42E01E, mp4a.40.2"'], true, 'H264+AAC must be supported in MSE');
  });

  it('validates that benchmark results exist with real empirical measurements', () => {
    const benchPath = path.resolve(__dirname, 'benchmark-results.json');
    assert.strictEqual(fs.existsSync(benchPath), true, 'benchmark-results.json should exist');
    const bench = JSON.parse(fs.readFileSync(benchPath, 'utf-8'));

    // MJPEG Baseline
    assert.strictEqual(bench.mjpegBaseline.audioSupported, false, 'MJPEG baseline must confirm lack of audio');
    assert.ok(bench.mjpegBaseline.avgFrameSizeBytes > 15000, 'MJPEG frames must have measured byte size > 15KB');
    assert.ok(bench.mjpegBaseline.uploadBitrate1ClientMbps > 10, 'MJPEG 1080p60 must consume > 10 Mbps per viewer');

    // MSE Evaluation
    assert.strictEqual(bench.mseEvaluation.audioSupported, true, 'MSE evaluation must have audio track');
    assert.ok(bench.mseEvaluation.measuredBitrate1ClientMbps < 5, 'MSE 1080p must consume < 5 Mbps (efficient compression)');
    assert.ok(bench.mseEvaluation.bandwidthReductionPercent >= 90, 'MSE must achieve >= 90% bandwidth reduction over MJPEG');

    // WebRTC Evaluation
    assert.strictEqual(bench.webrtcEvaluation.audioSupported, true, 'WebRTC must support audio track');
    assert.ok(bench.webrtcEvaluation.codecsNegotiated.includes('audio/opus'), 'WebRTC must negotiate Opus');

    // Comparative Table
    assert.ok(bench.comparativeTable.length >= 6, 'Comparative table must have at least 6 evaluation criteria');
  });

  it('validates MSE pipeline verification report (EBML, clusters, eviction, mid-stream join)', () => {
    const mseReportPath = path.resolve(__dirname, 'mse-validation-report.json');
    assert.strictEqual(fs.existsSync(mseReportPath), true, 'mse-validation-report.json should exist');
    const report = JSON.parse(fs.readFileSync(mseReportPath, 'utf-8'));

    assert.strictEqual(report.ebmlHeaderDetected, true, 'EBML header must be detected');
    assert.ok(report.initSegmentSizeBytes > 100, 'Init segment size must be > 100 bytes');
    assert.strictEqual(report.sourceBufferCreated, true, 'SourceBuffer creation must succeed');
    assert.ok(report.appendBufferSuccessCount >= 2, 'Must have at least 2 successful appendBuffer calls');
    assert.strictEqual(report.appendBufferErrorCount, 0, 'Must have 0 appendBuffer errors');
    assert.strictEqual(report.playbackStarted, true, 'HTMLVideoElement playback must start');
    assert.strictEqual(report.currentTimeAdvanced, true, 'HTMLVideoElement currentTime must advance');
    assert.strictEqual(report.evictionTested, true, 'Buffer eviction via sourceBuffer.remove must be tested');
    assert.strictEqual(report.midStreamJoinWithoutInitFailed, true, 'Mid-stream join without Init segment must fail');
    assert.strictEqual(report.midStreamJoinWithInitSucceeded, true, 'Mid-stream join with cached Init segment must succeed');
    assert.strictEqual(report.audioEnergyDetected, true, 'Audio energy must be detected via Web Audio Analyser');
  });

  it('validates rigorous multi-candidate benchmark results under identical dynamic conditions', () => {
    const rigorousPath = path.resolve(__dirname, 'benchmark-results-rigorous.json');
    assert.strictEqual(fs.existsSync(rigorousPath), true, 'benchmark-results-rigorous.json should exist');
    const bench = JSON.parse(fs.readFileSync(rigorousPath, 'utf-8'));

    // Conditions
    assert.strictEqual(bench.testConditions.resolution, '1920x1080');
    assert.strictEqual(bench.testConditions.targetFps, 30);
    assert.strictEqual(bench.testConditions.durationSeconds, 8);
    assert.strictEqual(bench.testConditions.videoPhases.length, 4);

    // Audio status
    assert.strictEqual(bench.mjpeg.singleViewer.audioSupported, false);
    assert.strictEqual(bench.mseWebSocket.singleViewer.audioSupported, true);
    assert.strictEqual(bench.webrtcP2p.singleViewer.audioSupported, true);

    // Egress scaling
    assert.ok(bench.mjpeg.threeViewers.networkEgressBitrateMbps > bench.mjpeg.singleViewer.networkEgressBitrateMbps * 2.8);
    assert.ok(bench.mseWebSocket.threeViewers.networkEgressBitrateMbps > bench.mseWebSocket.singleViewer.networkEgressBitrateMbps * 2.8);

    // Process memory by Electron ProcessMetric.type
    assert.ok(bench.mjpeg.singleViewer.processMetrics.tab.workingSetKb > 0);
    assert.ok(bench.mseWebSocket.singleViewer.processMetrics.tab.workingSetKb > 0);
    assert.ok(bench.webrtcP2p.singleViewer.processMetrics.tab.workingSetKb > 0);

    // Hardware status
    assert.ok(bench.hardwareAndNetworkStatus.quickTunnelExternalViewer.includes('NÃO_VERIFICADO'));
    assert.ok(bench.hardwareAndNetworkStatus.physicalAudioHardware.includes('NÃO_VERIFICADO'));
  });

  it('validates objective image quality metrics (PSNR, SSIM, text legibility) across all phases', () => {
    const qPath = path.resolve(__dirname, 'quality-report.json');
    assert.strictEqual(fs.existsSync(qPath), true, 'quality-report.json should exist');
    const q = JSON.parse(fs.readFileSync(qPath, 'utf-8'));

    // Encoding profiles
    assert.strictEqual(q.encodingProfiles.mjpeg.audioSupport.includes('Ausente'), true);
    assert.strictEqual(q.encodingProfiles.mseWebSocket.audioSupport.includes('Opus'), true);
    assert.strictEqual(q.encodingProfiles.webrtcP2p.audioSupport.includes('Opus'), true);

    // Phase 1 (IDE text)
    assert.ok(q.phases.phase1_ide.mjpeg.psnr > 40, 'MJPEG PSNR should be > 40 dB');
    assert.ok(q.phases.phase1_ide.mseVp8.psnr > 38, 'MSE VP8 PSNR should be > 38 dB');
    assert.ok(q.phases.phase1_ide.webrtcVp8.psnr > 35, 'WebRTC VP8 PSNR should be > 35 dB');
    assert.ok(q.phases.phase1_ide.mseVp8.ssim > 0.99, 'MSE VP8 SSIM should be > 0.99');

    // Comparative analysis
    assert.ok(q.comparativeAnalysis.videoOnly.includes('MJPEG entrega a mais alta fidelidade'));
    assert.ok(q.comparativeAnalysis.hardwareLimitation.includes('NÃO VERIFICADOS'));
  });

  it('validates field test report (Cloudflare edge, ICE candidate discovery, degraded network, session durations)', () => {
    const fPath = path.resolve(__dirname, 'field-test-report.json');
    assert.strictEqual(fs.existsSync(fPath), true, 'field-test-report.json should exist');
    const f = JSON.parse(fs.readFileSync(fPath, 'utf-8'));

    // Cloudflare edge
    assert.strictEqual(f.cloudflaredEdgeValidation.edgeStatus, 'CONEXÃO_BORDA_CLOUDFLARE_CONFIRMADA');
    assert.ok(f.cloudflaredEdgeValidation.externalMobileViewers.includes('NÃO_VERIFICADO'));

    // ICE candidates
    assert.ok(f.iceCandidateAudit.summary.host >= 1, 'Should find at least 1 host candidate');
    assert.ok(f.iceCandidateAudit.summary.srflx >= 1, 'Should find at least 1 srflx candidate via Google STUN');
    assert.strictEqual(f.iceCandidateAudit.summary.relay, 0, 'Relay should be 0 without TURN');
    assert.ok(f.iceCandidateAudit.natTraversalAnalysis.includes('servidor TURN'));

    // Degraded network simulation
    assert.strictEqual(f.degradedNetworkSimulation.condition.includes('2% de perda'), true);

    // Durations
    assert.strictEqual(f.sessionDurationStatus.smokeTestResult.includes('PASSOU'), true);
    assert.ok(f.sessionDurationStatus.longSession15Min.includes('NÃO_VERIFICADO'));
    assert.ok(f.sessionDurationStatus.longSession30Min.includes('NÃO_VERIFICADO'));
    assert.ok(f.sessionDurationStatus.longSession60Min.includes('NÃO_VERIFICADO'));
  });
});

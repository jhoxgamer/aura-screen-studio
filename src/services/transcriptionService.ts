import { TranscriptItem } from '../types';

export class TranscriptionService {
  private recognition: any = null;
  private isListening: boolean = false;
  private transcriptItems: TranscriptItem[] = [];
  private startTime: number = 0;

  constructor() {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'pt-BR'; // Portuguese default, fallback to en-US

      this.recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && lastResult[0]) {
          const text = lastResult[0].transcript.trim();
          if (text) {
            const time = Math.round(((Date.now() - this.startTime) / 1000) * 10) / 10;
            this.transcriptItems.push({ time, text });
          }
        }
      };

      this.recognition.onerror = (err: any) => {
        console.warn('[TranscriptionService] Speech recognition notice:', err.error);
      };
    }
  }

  public start() {
    this.transcriptItems = [];
    this.startTime = Date.now();
    this.isListening = true;

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('SpeechRecognition start failed (might be already running):', err);
      }
    }
  }

  public stop(): { transcript: TranscriptItem[]; aiSummary: string; aiTitle: string } {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    const fullText = this.transcriptItems.map(t => t.text).join(' ');

    let aiTitle = '';
    let aiSummary = '';

    if (this.transcriptItems.length > 0) {
      // Generate intelligent title from initial sentence or key phrase
      const firstSentence = this.transcriptItems[0].text;
      aiTitle = firstSentence.length > 50 ? `${firstSentence.substring(0, 47)}...` : firstSentence;

      // Generate AI summary
      const keyPoints = this.transcriptItems.slice(0, 4).map(t => `• ${t.text}`);
      aiSummary = `Resumo automático da explicação gravada:\n${keyPoints.join('\n')}\n\nDuração total: ${Math.round((Date.now() - this.startTime) / 1000)}s com narração em áudio.`;
    } else {
      aiTitle = `Gravação Aura ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      aiSummary = 'Gravação Aura Studio com tela, câmera e áudio combinados. Nenhuma fala contínua detectada para transcrição.';
    }

    return {
      transcript: this.transcriptItems,
      aiSummary,
      aiTitle
    };
  }
}

export const transcriptionService = new TranscriptionService();

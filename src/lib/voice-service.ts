export class VoiceService {
  private static audio: HTMLAudioElement | null = null;
  private static audioContext: AudioContext | null = null;
  private static analyser: AnalyserNode | null = null;
  private static dataArray: Uint8Array | null = null;
  private static source: MediaElementAudioSourceNode | null = null;

  static async speak(text: string, voiceId: string = 'Justin', onStart?: () => void, onEnd?: () => void) {
    try {
      const cleanText = text.replace(/\[FACIAL_EXPRESSION:.*?\]/g, '').trim();
      
      const response = await fetch('/api/tts', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voiceId })
      });

      if (!response.ok) throw new Error('TTS Failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (!this.audio) {
        this.audio = new Audio();
      }
      
      this.audio.src = url;
      
      // Setup Analyser for Lip Sync
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        
        this.source = this.audioContext.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      }
      
      // Essential: Resume context on user interaction
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (onStart) onStart();
      
      this.audio.onended = () => {
        if (onEnd) onEnd();
        URL.revokeObjectURL(url);
      };

      await this.audio.play();
    } catch (error) {
      console.error('Voice Error:', error);
    }
  }

  static getVolume(): number {
    if (!this.analyser || !this.dataArray || !this.audio || this.audio.paused) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
       sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;
    return Math.min(average / 64, 1.0); // Sensitive enough for speech
  }

  static async resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  static stop() {
    if (this.audio) {
      this.audio.pause();
    }
  }
}

// Speech Recognition for Hands-Free mode
export class ListeningService {
  private static recognition: any = null;

  static start(onResult: (text: string) => void, onEnd?: () => void) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      if (event.results && event.results[0] && event.results[0][0]) {
        const text = event.results[0][0].transcript;
        onResult(text);
      }
    };

    if (onEnd) {
      this.recognition.onend = onEnd;
    }

    this.recognition.start();
    return this.recognition;
  }

  static stop() {
    if (this.recognition) {
      this.recognition.stop();
    }
  }
}

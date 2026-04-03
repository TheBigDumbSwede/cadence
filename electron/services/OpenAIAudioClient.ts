import "dotenv/config";

const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

function pcm16ToWav(pcm: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const dataLength = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm));

  return buffer;
}

export class OpenAIAudioClient {
  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  getState() {
    return {
      configured: this.isConfigured(),
      apiKeyPresent: this.isConfigured(),
      model: DEFAULT_MODEL
    };
  }

  async transcribe(audio: ArrayBuffer): Promise<{ text: string; model: string }> {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const form = new FormData();
    const wav = pcm16ToWav(audio, 24000);
    form.append("model", DEFAULT_MODEL);
    form.append("file", new Blob([wav], { type: "audio/wav" }), "cadence.wav");

    const response = await fetch(TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI transcription failed: ${response.status} ${errorBody}`);
    }

    const payload = (await response.json()) as { text?: string };
    return {
      text: payload.text ?? "",
      model: DEFAULT_MODEL
    };
  }
}

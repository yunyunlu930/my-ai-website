import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI();

export async function POST(req: NextRequest) {
  try {
    const { input, language } = await req.json();
    if (!input || !language) {
      return NextResponse.json({ success: false, error: '缺少 input 或 language' }, { status: 400 });
    }

    // 語音模型與語音選擇，可根據語言調整 voice
    const voice = 'coral'; // 可根據需求切換不同 voice
    const model = 'gpt-4o-mini-tts';

    // 可根據語言自訂 instructions
    let instructions = 'Speak in a clear and natural tone.';
    if (language === 'zh' || language === 'zh-tw' || language === 'zh-cn') {
      instructions = '請用自然的中文語調朗讀。';
    }

    const mp3 = await openai.audio.speech.create({
      model,
      voice,
      input,
      instructions,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64 = buffer.toString('base64');

    return NextResponse.json({ success: true, audio: base64 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'TTS 產生失敗' }, { status: 500 });
  }
}

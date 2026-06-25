import type { GenerativeModel } from '@google/generative-ai'
import sharp from 'sharp'

export interface GeminiResult {
  text: string
  geminiInputTokens: number | undefined
  geminiOutputTokens: number | undefined
  imageWidth: number | undefined
  imageHeight: number | undefined
}

export async function callGemini(
  model: GenerativeModel,
  prompt: string,
  base64: string,
  mimeType: string = 'image/jpeg',
): Promise<GeminiResult> {
  const [result, meta] = await Promise.all([
    model.generateContent([prompt, { inlineData: { data: base64, mimeType } }]),
    sharp(Buffer.from(base64, 'base64')).metadata().catch(() => null),
  ])
  return {
    text: result.response.text().trim(),
    geminiInputTokens: result.response.usageMetadata?.promptTokenCount,
    geminiOutputTokens: result.response.usageMetadata?.candidatesTokenCount,
    imageWidth: meta?.width,
    imageHeight: meta?.height,
  }
}

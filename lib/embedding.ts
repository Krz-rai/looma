import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

export type ChunkEmbedding = {
  content: string;
  chunkIndex: number;
  hash: string;
  embedding: number[];
  model: string;
  dim: number;
};

type GenerateOptions = {
  model?: string; // e.g. "text-embedding-3-small"
  chunkSize?: number; // approx by characters
  overlap?: number; // approx by characters
  normalizeWhitespace?: boolean;
};

function normalize(input: string, normalizeWhitespace: boolean): string {
  const trimmed = input.trim();
  if (!normalizeWhitespace) return trimmed;
  return trimmed.replace(/\s+/g, " ");
}

function splitWithOverlap(text: string, chunkSize: number, overlap: number): Array<string> {
  const chunks: Array<string> = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const slice = text.slice(start, end);
    chunks.push(slice);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function paragraphAwareChunks(input: string, opts: { chunkSize: number; overlap: number }): Array<string> {
  const { chunkSize, overlap } = opts;
  const paragraphs = input
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: Array<string> = [];
  for (const p of paragraphs) {
    if (p.length <= chunkSize) {
      out.push(p);
    } else {
      out.push(...splitWithOverlap(p, chunkSize, overlap));
    }
  }
  return out;
}

function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  // convert to unsigned and hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function generateEmbeddings(
  value: string,
  options?: GenerateOptions,
): Promise<Array<ChunkEmbedding>> {
  const modelName = options?.model ?? "text-embedding-3-small";
  const chunkSize = Math.max(256, options?.chunkSize ?? 2400); // ~1-1.5k tokens for most English
  const overlap = Math.max(0, Math.min(chunkSize - 1, options?.overlap ?? 300));
  const normalizeWhitespace = options?.normalizeWhitespace ?? true;

  const text = normalize(value ?? "", normalizeWhitespace);
  if (text.length === 0) return [];

  const paragraphsJoined = text.replace(/\r\n/g, "\n");
  const chunks = paragraphAwareChunks(paragraphsJoined, { chunkSize, overlap });
  if (chunks.length === 0) return [];

  const model = openai.embedding(modelName);
  const { embeddings } = await embedMany({
    model,
    values: chunks,
  });

  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`);
  }

  const dim = embeddings[0]?.length ?? 0;
  if (dim === 0) {
    throw new Error("Embedding dimension is 0; check model configuration.");
  }

  return embeddings.map((embedding, index) => ({
    content: chunks[index],
    chunkIndex: index,
    hash: fnv1a32(chunks[index]),
    embedding,
    model: modelName,
    dim,
  }));
}
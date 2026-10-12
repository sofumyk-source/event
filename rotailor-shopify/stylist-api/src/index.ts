/**
 * RO Tailor — AI Stylist API (Cloudflare Worker)
 * ------------------------------------------------------------
 * お客様が入力した「どんな一着にしたいか」のイメージを Claude が読み取り、
 * シミュレーターの選択肢（生地・型・ラペル…）の中から一着を組み立てて返します。
 *
 * POST /style
 *   body: { text: string, catalog: Record<group, {id, name, hint}[]>, threePiece: boolean,
 *           image?: { mediaType: "image/jpeg" | "image/png" | "image/webp", data: base64 } }
 *   text はお客様が選んだ「好きな色・着る場面・ひとこと」をまとめたもの。
 *   image は任意の参考写真（ブラウザ側で 768px 以下に縮小済み）。保存はしません。
 *   200:  { selection: {...ids}, threePiece, title, comment, salonNote }
 *
 * 選択肢そのものはテーマ側（テーマエディタのブロック）から送られてくるため、
 * 生地を増やしてもこの API を変更する必要はありません。
 */
import Anthropic from "@anthropic-ai/sdk";

export interface Env {
  ANTHROPIC_API_KEY: string;
  /** カンマ区切りの許可オリジン（例: https://rotailor.jp,https://xxx.myshopify.com） */
  ALLOWED_ORIGINS: string;
  /** 使用モデル。未設定なら claude-haiku-5-5 */
  STYLIST_MODEL?: string;
  /** wrangler.toml の [[ratelimits]]（連打・悪用対策） */
  STYLE_LIMITER?: RateLimit;
}

const GROUPS = ["fabric", "style", "lapel", "pocket", "vent", "button", "lining", "pleat", "hem", "tie"] as const;
type Group = (typeof GROUPS)[number];

interface CatalogItem {
  id: string;
  name: string;
  hint?: string;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

interface StyleRequest {
  text: string;
  catalog: Partial<Record<Group, CatalogItem[]>>;
  threePiece?: boolean;
  image?: { mediaType: ImageMediaType; data: string };
}

const MAX_TEXT = 300;
/** base64 で約 1.5MB（縮小済み写真なら十分な大きさ） */
const MAX_IMAGE_B64 = 2_000_000;
const IMAGE_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_ITEMS_PER_GROUP = 80;
const MAX_FIELD = 160;

const SYSTEM_PROMPT = `あなたは、オーダースーツサロン「ROテイラー」のテイラーです。
お客様が「好きな色」「着ていく場面」「ひとこと」を選び、参考写真を添えることもあります。それらを読み取り、
用意された選択肢（生地・ジャケットの型・ラペル・ポケット・ベント・ボタン・裏地・パンツ・ネクタイ）から
最もふさわしい一着を選び、テイラーとして短く語ってください。

これは「オーダースーツを仕立てる体験」を楽しんでもらうためのゲームです。
- 好きな色はできるだけ生地・ネクタイ・裏地に反映し、着ていく場面にふさわしい格（フォーマル度）に整えます。
- 参考写真があれば、写っている服や景色の色・柄・素材感・雰囲気を読み取って取り入れます。
  写真に人物が写っていても、その人物が誰かを推測したり、顔や体型について述べたりしません。
- ひとことが曖昧でも、詩的でも、少しふざけていても、前向きに解釈して一着を仕立てます。
- 実在のキャラクター、作品、ブランド、有名人の名前が入力された場合は、その色や雰囲気だけを抽象的に読み取り、
  返答の文章ではその固有名を一切使わず、「明るい黄色と黒の、元気な一着」のように色と雰囲気で表現します。
- 裏地やボタンなど見えにくい部分で遊び心を出すのは、テイラーらしい提案として歓迎です。
- 価格や見積もりには一切触れません。

返す内容:
- title: この一着の名前。12文字前後の日本語。
- comment: テイラーのひとこと。なぜこの生地と仕立てを選んだのかを、お客様の言葉に寄り添って 80〜120 文字で。
- salonNote: 「サロンでは〜」で始まり、実際の生地見本や採寸を通してこのイメージをさらに磨けることを伝える一文（50文字以内）。
- 各選択は、渡された選択肢の id から必ず一つずつ選ぶこと。`;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}

/** リクエストを検証し、使ってよい形に整える */
function parseRequest(raw: unknown): StyleRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const text = clip(body.text, MAX_TEXT);
  if (!text && !body.image) return null;
  const catalogIn = (body.catalog ?? {}) as Record<string, unknown>;
  const catalog: StyleRequest["catalog"] = {};
  for (const group of GROUPS) {
    const list = catalogIn[group];
    if (!Array.isArray(list)) continue;
    const items = list
      .slice(0, MAX_ITEMS_PER_GROUP)
      .map((item) => {
        const it = (item ?? {}) as Record<string, unknown>;
        return { id: clip(it.id, 80), name: clip(it.name, MAX_FIELD), hint: clip(it.hint, MAX_FIELD) };
      })
      .filter((it) => it.id && it.name);
    if (items.length) catalog[group] = items;
  }
  if (!catalog.fabric?.length) return null;
  let image: StyleRequest["image"];
  const img = body.image as Record<string, unknown> | undefined;
  if (img && typeof img === "object") {
    const mediaType = img.mediaType as ImageMediaType;
    const data = typeof img.data === "string" ? img.data : "";
    if (!IMAGE_TYPES.includes(mediaType) || !data || data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
    image = { mediaType, data };
  }
  return { text, catalog, threePiece: body.threePiece === true, image };
}

/** 選択肢の id を enum に閉じ込めた JSON Schema を組み立てる（存在しない id は返せない） */
function buildSchema(req: StyleRequest) {
  const properties: Record<string, unknown> = {
    title: { type: "string" },
    comment: { type: "string" },
    salonNote: { type: "string" },
  };
  const required = ["title", "comment", "salonNote"];
  for (const group of GROUPS) {
    const items = req.catalog[group];
    if (!items?.length) continue;
    properties[group] = { type: "string", enum: items.map((i) => i.id) };
    required.push(group);
  }
  if (req.threePiece) {
    properties.threePiece = { type: "boolean" };
    required.push("threePiece");
  }
  return { type: "object", properties, required, additionalProperties: false };
}

function catalogText(req: StyleRequest): string {
  const labels: Record<Group, string> = {
    fabric: "生地",
    style: "ジャケットの型",
    lapel: "ラペル",
    pocket: "腰ポケット",
    vent: "ベント",
    button: "ボタン",
    lining: "裏地",
    pleat: "パンツのタック",
    hem: "パンツの裾",
    tie: "ネクタイ（Vゾーン）",
  };
  const lines: string[] = [];
  for (const group of GROUPS) {
    const items = req.catalog[group];
    if (!items?.length) continue;
    lines.push(`## ${labels[group]}（${group}）`);
    for (const item of items) lines.push(`- id: ${item.id} ／ ${item.name}${item.hint ? ` ／ ${item.hint}` : ""}`);
  }
  if (req.threePiece) lines.push("## ベスト（threePiece）\n- true でスリーピース、false でツーピース");
  return lines.join("\n");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== "/style" || request.method !== "POST") return json({ error: "not_found" }, 404, cors);
    if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);

    if (env.STYLE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.STYLE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "busy" }, 429, cors);
    }

    let parsed: StyleRequest | null = null;
    try {
      parsed = parseRequest(await request.json());
    } catch {
      parsed = null;
    }
    if (!parsed) return json({ error: "bad_request" }, 400, cors);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const content: Anthropic.ContentBlockParam[] = [];
      if (parsed.image) {
        content.push({ type: "image", source: { type: "base64", media_type: parsed.image.mediaType, data: parsed.image.data } });
      }
      content.push({
        type: "text",
        text:
          `# 選べる選択肢\n${catalogText(parsed)}\n\n# お客様の好み\n<customer_input>\n${parsed.text || "（指定なし）"}\n</customer_input>` +
          (parsed.image ? "\n\n参考写真が添えられています。色・柄・雰囲気を読み取ってください。" : ""),
      });

      const response = await client.messages.create({
        model: env.STYLIST_MODEL || "claude-haiku-5-5",
        max_tokens: 4000,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: buildSchema(parsed) },
        },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
      });

      if (response.stop_reason === "refusal") return json({ error: "declined" }, 422, cors);
      if (response.stop_reason === "max_tokens") return json({ error: "incomplete" }, 502, cors);

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) return json({ error: "empty" }, 502, cors);
      const out = JSON.parse(textBlock.text) as Record<string, unknown>;

      const selection: Partial<Record<Group, string>> = {};
      for (const group of GROUPS) {
        const id = out[group];
        if (typeof id === "string" && parsed.catalog[group]?.some((i) => i.id === id)) selection[group] = id;
      }
      return json(
        {
          selection,
          threePiece: parsed.threePiece ? out.threePiece === true : false,
          title: clip(out.title, 40),
          comment: clip(out.comment, 300),
          salonNote: clip(out.salonNote, 120),
        },
        200,
        cors,
      );
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429, cors);
      if (error instanceof Anthropic.APIError) {
        console.error("anthropic_error", error.status, error.message);
        return json({ error: "upstream" }, 502, cors);
      }
      console.error("stylist_error", error);
      return json({ error: "internal" }, 500, cors);
    }
  },
};

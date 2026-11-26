let cachedModels = null;
let cachedAt = 0;

async function getCandidateModels(apiKey) {
  const now = Date.now();
  if (cachedModels && now - cachedAt < 10 * 60 * 1000) {
    return cachedModels;
  }

  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (listRes.ok) {
      const listJson = await listRes.json();
      const rawModels = (listJson.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((name) => {
          const lower = name.toLowerCase();
          if (!lower.includes("gemini")) return false;
          const blocked = [
            "image", "tts", "audio", "embedding", "veo",
            "robotics", "computer-use", "deep-research",
            "gemini-1.", "gemini-2.0", "gemma"
          ];
          if (blocked.some((b) => lower.includes(b))) return false;
          if (lower === "gemini-2.5-flash") return false;
          return true;
        });

      const score = (name) => {
        const lower = name.toLowerCase();
        let s = 0;
        if (lower.includes("flash") || lower.includes("hydrogen")) s += 50;
        if (lower.includes("latest")) s += 20;
        if (lower.includes("lite")) s += 15;
        if (lower.includes("gemini-4")) s += 40;
        else if (lower.includes("gemini-3")) s += 30;
        else if (lower.includes("gemini-2.5")) s += 10;
        if (lower.includes("pro") || lower.includes("carbon")) s -= 10;
        return s;
      };

      const picked = rawModels.sort((a, b) => score(b) - score(a)).slice(0, 2);
      if (picked.length > 0) {
        cachedModels = picked;
        cachedAt = now;
        return cachedModels;
      }
    }
  } catch {}

  return ["gemini-3.5-flash-lite", "gemini-4-hydrogen"];
}

export default async (request) => {
  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: "Chưa nhập GEMINI_API_KEY trong cài đặt Netlify." } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (request.method === "GET") {
    const models = await getCandidateModels(apiKey);
    return new Response(JSON.stringify({ candidateModels: models }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method !== "POST") {
    return new Response("Only POST/GET allowed", { status: 405 });
  }

  const body = await request.text();
  const candidateModels = await getCandidateModels(apiKey);

  let lastStatus = 503;
  let lastData = JSON.stringify({ error: { message: "Máy chủ phản hồi chậm, hãy thử lại." } });

  for (const model of candidateModels) {
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);

    try {
      const response = await fetch(googleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await response.text();
      if (response.ok) {
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      lastStatus = response.status;
      lastData = data;

      if ([401, 403].includes(response.status)) {
        return new Response(data, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      clearTimeout(timer);
      lastStatus = 504;
      lastData = JSON.stringify({
        error: { message: `${model} phản hồi quá 18s hoặc mạng chập chờn.` },
      });
    }
  }

  return new Response(lastData, {
    status: lastStatus,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  path: "/api/gemini",
};

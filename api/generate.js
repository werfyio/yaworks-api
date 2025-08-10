export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Debug switch
  const debug = req.query?.debug === "1" || req.headers["x-debug"] === "1";

  // Log raw body
  console.log("Raw body ontvangen (type):", typeof req.body);
  console.log("Raw body ontvangen (waarde):", req.body);

  let bodyData = req.body;

  // Als body een string is, probeer hem te parsen
  if (typeof bodyData === "string") {
    try {
      bodyData = JSON.parse(bodyData);
    } catch (err) {
      console.log("Kon body niet parsen als JSON:", err.message);
    }
  }

  // Debug response teruggeven
  if (debug) {
    return res.status(200).json({
      debug: true,
      typeof_body: typeof bodyData,
      received_body: bodyData,
      headers: req.headers,
    });
  }

  // Extract profiel
  const profiel = bodyData?.profiel;

  if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
    return res.status(400).json({
      error: "Ongeldig of ontbrekend profiel.",
      typeof_body: typeof bodyData,
      received_body: bodyData,
    });
  }

  try {
    // ===== OpenAI API aanroepen =====
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Je bent een assistent die profielen analyseert.",
          },
          {
            role: "user",
            content: profiel,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const completionData = await completion.json();

    if (!completion.ok) {
      console.error("OpenAI API-fout:", completionData);
      return res.status(500).json({
        error: "OpenAI API-fout",
        detail: completionData,
      });
    }

    const text = completionData.choices[0]?.message?.content || "";

    res.status(200).json({
      ok: true,
      text,
    });
  } catch (err) {
    console.error("Serverfout:", err);
    res.status(500).json({ error: "Serverfout", detail: err.message });
  }
}

export default async function handler(req, res) {
  const { profieltekst, prompttemplate } = req.body;

  if (!profieltekst || !prompttemplate) {
    return res.status(400).json({ error: "profieltekst en prompttemplate zijn verplicht" });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Je bent een technisch recruiter die berichten schrijft." },
        { role: "user", content: `${prompttemplate}\n\n${profieltekst}` },
      ],
      temperature: 0.4,
    }),
  });

  const json = await response.json();

  if (!json.choices) {
    return res.status(500).json({ error: "Fout in OpenAI-response", details: json });
  }

  res.status(200).json({ resultaat: json.choices[0].message.content.trim() });
}

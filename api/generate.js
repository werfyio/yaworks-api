// pages/api/generate.js
// Body from Glide: { "profiel": "...", "naam": "Naam", "recruiternaam": "Recruiter" }

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3;

/* ---------------- Helpers ---------------- */
function stripFences(s = "") {
  let t = String(s || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return t;
}

// Beetje tolerante parser: pakt 1e {…}, verwijdert rare quotes/nbsp, vangt trailing komma's
function safeJsonParseLoose(s) {
  if (!s) return { ok: false, raw: "" };
  let cleaned = stripFences(s)
    .replace(/\u00A0/g, " ")                 // nbsp
    .replace(/[“”]/g, '"')                   // smart quotes
    .replace(/[‘’]/g, "'")                   // smart single
    .replace(/\bNaN\b/g, "null")
    .replace(/\bundefined\b/g, "null");

  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, raw: cleaned };
  let candidate = m[0];

  // trailing commas: ,"key": "x",}  or  [1,2,]
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  try { return { ok: true, data: JSON.parse(candidate) }; }
  catch { return { ok: false, raw: cleaned }; }
}

async function openaiChat({ system, user, temperature = TEMPERATURE, max_tokens = 1400, timeoutMs = 60000 }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
      temperature,
      max_tokens,
    }),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));

  clearTimeout(t);

  if (!resp || !resp.ok) {
    const j = resp?.json ? await resp.json() : null;
    const msg = j?.error?.message || `HTTP ${resp?.status || 0}`;
    return { ok: false, error: msg, raw: j || null, text: "" };
  }
  const j = await resp.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  return { ok: true, text };
}

/* ---------------- Prompts ---------------- */

const PROMPT_STEP1 = (profiel) => `
Jij bent een recruiter die kandidaten beoordeelt voor YaWorks (complexe IT/Netwerk-transformaties, Top-500).
Focus: netwerkarchitectuur, netwerk- en cloudautomatisering (IaC, CI/CD), enterprise security, migraties, vendorselectie, projectleiding. Hands-on inzetbaarheid is belangrijk.

Opdracht:
1) Analyseer het volledige profiel.
2) Score (0–5, halve punten ok) + korte toelichting voor:
   - Technische expertise
   - Relevantie voor YaWorks-profielen
   - Hands-on inzetbaarheid
   - Enterprise & projectervaring
   - Soft skills & klantgerichtheid
3) Totaalscore op 25.
4) Aanschrijven (JA/NEE): JA als totaalscore ≥ 17 én kandidaat Nederlands kan spreken.
   - Als iemand in NL woont/werkt/studeerde → ≥80% zekerheid = Nederlands "JA". Minder dan 80% = "NEE".
5) miniData: invullen als ≥80% zeker, anders "onvoldoende data".

Output ALLEEN JSON:
{
  "criteria": [
    { "naam": "Technische expertise", "score": X, "toelichting": "..." },
    { "naam": "Relevantie voor Yaworks-profielen", "score": X, "toelichting": "..." },
    { "naam": "Hands-on inzetbaarheid", "score": X, "toelichting": "..." },
    { "naam": "Enterprise & projectervaring", "score": X, "toelichting": "..." },
    { "naam": "Soft skills & klantgerichtheid", "score": X, "toelichting": "..." }
  ],
  "totaalscore": X,
  "nederlands": "JA" | "NEE",
  "aanschrijven": "JA" | "NEE",
  "conclusie": "max 500 tekens, GDPR-proof.",
  "miniData": {
    "schrijfstijl": "",
    "zelfpresentatie": "",
    "ambitie_korte_termijn": "",
    "ambitie_lange_termijn": "",
    "sterke_punten": [],
    "certificeringen": [],
    "toptechnologieen": [],
    "industrie": []
  }
}

Kandidaatprofiel:
${profiel}
`.trim();

const PROMPT_STEP2 = ({ naam, recruiternaam, miniData }) => `
Maak 2 berichten namens YaWorks op basis van uitsluitend miniData.

miniData:
${JSON.stringify(miniData)}

1) LinkedIn (max 270 tekens):
Hé ${naam},  
Jouw ervaring heeft veel overlap tussen jouw [certificeringen/ervaring] in [toptechnologieën] en onze [relevante projecten] bij YaWorks.  
Lijkt me leuk om te connecten!  
MvG  
${recruiternaam}

2) WhatsApp (4–6 korte regels, scanbaar):
Hé ${naam}, [persoonlijke openingszin op basis van ambitie]  
[Zin over certificeringen en skills]  
[Zin over match met YaWorks-projecten]  
[Zin over type projecten/omgeving bij YaWorks]  
[Zin waarin ambitie wordt verbonden aan YaWorks-mogelijkheden]  
Als je dat interessant vindt, vertel ik je graag meer.

Output ALLEEN JSON:
{ "linkedin": "...", "whatsapp": "..." }
`.trim();

const PROMPT_STEP3 = (profiel) => `
ROL & DOEL:
Strikte extractor. Alleen expliciet of ≥80% zekere afleiding. GDPR: geen bedrijfsnamen (gebruik generieke termen).

WHITELISTS & regels (ingekort):
- Dienstverband: "Vast" | "Freelance" | null.
- Werkgebied: woonplaats → provincie → "onbekend". binnen_1_uur_steden alleen uit vaste NL-lijst.
- Opleidingen: hoogst_afgeronde_opleiding = onbekend | MBO | HBO | Universiteit; relevant_voor_roles = ja|nee|null.
- Certificaten (exact): CCNA, CCNP Enterprise, CCIE, AWS Certified Solutions Architect – Associate, AWS Certified Solutions Architect – Professional, Microsoft Certified: Azure Administrator Associate, Microsoft Certified: Azure Solutions Architect Expert, Google Professional Cloud Architect, Fortinet NSE4, Fortinet NSE7, PCNSE, PCCSA, VCP-DCV, VCAP-NV, CKA, CKAD, CompTIA Security+, CompTIA Network+, TOGAF 9 Certified, PRINCE2 Practitioner, CISSP, CEH. Output { "naam": "", "status": "geldig|verlopen|onbekend" }.
- Werkervaring_relevant: "0-2 jaar" | "2-5 jaar" | "5-10 jaar" | "10+ jaar" | null.
- Functie_type: Specialist | Consultant | Architect | Projectmanager | null.
- Functie_groep (alleen uit): Automation, Cloud, Cyber Security, Enterprise Networking, Service Provider, Wireless, Architectuur, Datacenter, Project / Programma Management, Transformation Lead, EUC, IAM, Management Consulting, Engineering, IT Transformations, Management Consultant, Stream Lead.
- Industry (alleen uit): Manufacturing, Public, Financial Services, Technology - Media - Telecom, Energy - Utilities.
- Type_ervaring_bedrijven (alleen uit): Startup, Scale-up, MKB, Enterprise, Detachering, Freelance.
- Niveau_overall: Associate | Intermediate | Advanced | Expert | null.
- Talen: max 3, alleen ≥ professionele werkvaardigheid.
- Project_ervaring_type (alleen uit): Migraties, Security audits, Cloud implementaties, Datacenter migraties, Netwerkdesign, DevOps implementaties, Compliance trajecten, IAM implementaties.
- Indien <80% zeker: "te weinig data" (of null waar passend).

JSON-SCHEMA (volledig teruggeven):
{
  "schema_version": "2025-08-F2F3",
  "dienstverband": "",
  "werkgebied": { "woonplaats": "", "provincie": "", "binnen_1_uur_steden": [] },
  "opleidingen": { "hoogst_afgeronde_opleiding": "", "werk_en_denk_niveau": "", "relevant_voor_roles": "" },
  "certificaten": [ { "naam": "", "status": "" } ],
  "werkervaring_relevant": "",
  "functie_type": "",
  "functie_groep": [],
  "industry": [],
  "type_ervaring_bedrijven": [],
  "niveau_overall": "",
  "skills_top5": [ { "skill": "", "niveau": "" } ],
  "skills_all": [],
  "werkervaring_samenvatting_gdpr": "",
  "beschikbaarheid": "",
  "contract_voorkeur": [],
  "reisbereidheid": "",
  "talen": [ { "taal": "", "niveau": "" } ],
  "sectoren_telling": 0,
  "project_ervaring_type": [],
  "tech_stack_aantal": 0,
  "laatste_functie_einddatum": "",
  "rolgeschiedenis": [ { "rol": "", "jaren": 0 } ],
  "certificeringen_totaal": 0,
  "red_flags": [],
  "pluspunten": [],
  "gdpr_cleaned": true,
  "schrijfstijl": "",
  "zelfpresentatie": "",
  "ambitie_korte_termijn": "",
  "ambitie_lange_termijn": "",
  "mogelijke_next_step": "",
  "core_capabilities": {
    "Conviction": { "score": 0, "omschrijving": "" },
    "Storytelling": { "score": 0, "omschrijving": "" },
    "Subject Mastery": { "score": 0, "omschrijving": "" },
    "Multidisciplinary Teamwork": { "score": 0, "omschrijving": "" }
  },
  "champions_league_score": {
    "totaal_score": 0,
    "breakdown": {
      "experience_seniority": 0,
      "enterprise_exposure": 0,
      "technical_consultancy_skills": 0,
      "certifications_education": 0,
      "leadership_potential": 0
    },
    "uitleg": ""
  },
  "teamrol": { "rol": "", "gedrag": "", "sterke_punten": "", "aandachtspunten": "" },
  "disq_profiel": {
    "Dominant": { "score": 0, "interpretatie": "" },
    "Invloed": { "score": 0, "interpretatie": "" },
    "Stabiel": { "score": 0, "interpretatie": "" },
    "Consciëntieus": { "score": 0, "interpretatie": "" },
    "combinatieprofiel": "", "combinatie_uitleg": ""
  },
  "culture_fit_score": 0,
  "impact_highlights": [],
  "preferred_tech_focus": [],
  "persoonlijke_usp": ""
}

Kandidaatprofiel:
${profiel}

Output: alleen geldige JSON (geen extra tekst of codefences).
`.trim();

/* --------------- Next.js API config --------------- */
export const config = { api: { bodyParser: true } };

/* --------------- Default handler --------------- */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch {} }

    const profiel = body?.profiel;
    const naam = body?.naam || "Kandidaat";
    const recruiternaam = body?.recruiternaam || "Recruiter van YaWorks";
    if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
      return res.status(400).json({ error: "Profiel ontbreekt of is leeg." });
    }

    // STEP 1
    const s1 = await openaiChat({
      system: "Je produceert uitsluitend geldige JSON, zonder codefences.",
      user: PROMPT_STEP1(profiel),
      temperature: 0.2,
      max_tokens: 1000,
    });
    if (!s1.ok) {
      // fail soft
      return res.status(200).json({ match: false, errorStep: 1, openaiError: s1.error, raw: s1.raw || null });
    }
    const p1 = safeJsonParseLoose(s1.text);
    if (!p1.ok) {
      return res.status(200).json({ match: false, errorStep: 1, raw: s1.text });
    }
    const beoordeling = p1.data;

    if (beoordeling?.aanschrijven !== "JA") {
      return res.status(200).json({ match: false, beoordeling, berichten: null, volledigeData: null });
    }

    // STEP 2
    const s2 = await openaiChat({
      system: "Geef alleen geldige JSON terug met velden 'linkedin' en 'whatsapp'.",
      user: PROMPT_STEP2({ naam, recruiternaam, miniData: beoordeling?.miniData || {} }),
      temperature: 0.35,
      max_tokens: 600,
    });
    let berichten = null;
    if (s2.ok) {
      const p2 = safeJsonParseLoose(s2.text);
      if (p2.ok) berichten = p2.data;
      else berichten = { parseError: true, raw: s2.text };
    } else {
      berichten = { openaiError: s2.error, raw: s2.raw || null };
    }

    // STEP 3
    const s3 = await openaiChat({
      system: "Je produceert uitsluitend geldige JSON. Geen codefences.",
      user: PROMPT_STEP3(profiel),
      temperature: 0.1,
      max_tokens: 3000,
    });
    let volledigeData = null;
    if (s3.ok) {
      const p3 = safeJsonParseLoose(s3.text);
      if (p3.ok) volledigeData = p3.data;
      else volledigeData = { parseError: true, raw: s3.text };
    } else {
      volledigeData = { openaiError: s3.error, raw: s3.raw || null };
    }

    return res.status(200).json({
      match: true,
      beoordeling,
      berichten,
      volledigeData,
    });
  } catch (err) {
    console.error("generate error:", err);
    // Als er echt iets crasht (config/netwerk), stuur 500.
    return res.status(500).json({ error: "Serverfout", detail: err.message });
  }
}

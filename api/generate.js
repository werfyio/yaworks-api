// pages/api/generate.js
// 3-staps flow: 1) match check + miniData  2) berichten  3) volledige JSON-extractie
// Werkt met body: { profiel: "...", naam?: "...", recruiternaam?: "..." }

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 0.3;
const MAX_TOKENS = 1800;

/* ----------------- Helpers ----------------- */
function stripFences(s = "") {
  let t = String(s).trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

function safeJsonParse(s) {
  const cleaned = stripFences(s);
  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    return { ok: false, raw: cleaned };
  }
}

async function openaiChat({ system, user, temperature = TEMPERATURE, max_tokens = MAX_TOKENS }) {
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
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
  });
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json?.error?.message || JSON.stringify(json);
    throw new Error(`OpenAI API error ${resp.status}: ${msg}`);
  }
  const content = json?.choices?.[0]?.message?.content ?? "";
  return content;
}

/* ----------------- Prompts ----------------- */

// Stap 1: match check + miniData
const PROMPT_STEP1 = (profiel) => `
Jij bent een recruiter die kandidaten beoordeelt voor YaWorks, een consultancybedrijf gespecialiseerd in complexe IT- en netwerktransformatieprojecten voor Top-500 bedrijven.

Over YaWorks:
YaWorks ontwerpt, bouwt en automatiseert netwerkinfrastructuren, cloudomgevingen en securityoplossingen. Belangrijk: netwerkarchitectuur, netwerk- & cloudautomatisering (IaC, CI/CD), enterprise security, migraties, vendorselectie, projectleiding. Kandidaat moet hands-on inzetbaar zijn.

Opdracht:
1) Analyseer het volledige kandidatenprofiel hieronder.
2) Geef scores (0–5, halve punten toegestaan) met korte toelichting voor:
   - Technische expertise
   - Relevantie voor YaWorks-profielen
   - Hands-on inzetbaarheid
   - Enterprise & projectervaring
   - Soft skills & klantgerichtheid
3) Tel op → totaalscore (op 25).
4) Aanschrijven (JA/NEE): JA als totaalscore ≥ 17 én kandidaat Nederlands kan spreken.
   - Nederlands-regel: als iemand in NL woont/werkt/studeerde → ≥80% zekerheid = Nederlands "JA".
   - Onder 80% zekerheid = "NEE".
5) Geef ook miniData voor berichten, alleen invullen als ≥80% zekerheid, anders "onvoldoende data".

Output ALLEEN JSON (geen extra tekst):
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
  "conclusie": "max 500 tekens, GDPR-proof, geen persoons- of bedrijfsnamen.",
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

// Stap 2: berichten op basis van miniData
const PROMPT_STEP2 = ({ naam, recruiternaam, miniData }) => `
Opdracht:
Maak 2 berichten namens YaWorks, uitsluitend op basis van miniData.

miniData:
${JSON.stringify(miniData)}

1) LinkedIn (max 270 tekens):
Hé ${naam},  
Jouw ervaring heeft veel overlap tussen jouw [certificeringen/ervaring] in [toptechnologieën] en onze [relevante projecten] bij YaWorks.  
Lijkt me leuk om te connecten!  
MvG  
${recruiternaam}

- Vul automatisch [certificeringen/ervaring], [toptechnologieën] en [relevante projecten] op basis van miniData.
- Gebruik schrijfstijl uit miniData als die er is; anders zakelijk-vriendelijk.
- Alleen één regelbreking per zin zoals boven.

2) WhatsApp-stijl (4–6 korte regels):
Hé ${naam}, [persoonlijke openingszin op basis van ambitie]  
[Zin over certificeringen en skills]  
[Zin over match met YaWorks-projecten]  
[Zin over type projecten/omgeving bij YaWorks]  
[Zin waarin ambitie wordt verbonden aan YaWorks-mogelijkheden]  
Als je dat interessant vindt, vertel ik je graag meer.

Output ALLEEN JSON:
{
  "linkedin": "....",
  "whatsapp": "...."
}
`.trim();

// Stap 3: volledige JSON-extractie
const PROMPT_STEP3 = (profiel) => `
ROL & DOEL:
Je bent een zeer strikte extractor. Gebruik uitsluitend expliciete info of afleidingen met ≥80% zekerheid. Niets verzinnen.
GDPR-regel: Nooit bedrijfsnamen opnemen; gebruik generieke omschrijvingen (bv. “grote telecomprovider” of “publieke sectororganisatie”).

BESLISREGELS (samengevat):
- Dienstverband: "Vast" | "Freelance" | null.
- Werkgebied: woonplaats → provincie → fallback "onbekend". binnen_1_uur_steden alleen uit: Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen, Tilburg, Almere, Breda, Nijmegen, Enschede, Apeldoorn, Haarlem, Arnhem, 's-Hertogenbosch, Amersfoort, Zwolle, Leiden, Maastricht, Dordrecht, Ede, Delft, Venlo, Deventer, Heerlen, Leeuwarden, Assen, Middelburg, Oss, Purmerend.
- Opleidingen: hoogst_afgeronde_opleiding = onbekend | MBO | HBO | Universiteit. werk_en_denk_niveau invullen indien af te leiden. relevant_voor_roles = ja | nee | null.
- Certificaten: alleen uit whitelist (exact): CCNA, CCNP Enterprise, CCIE, AWS Certified Solutions Architect – Associate, AWS Certified Solutions Architect – Professional, Microsoft Certified: Azure Administrator Associate, Microsoft Certified: Azure Solutions Architect Expert, Google Professional Cloud Architect, Fortinet NSE4, Fortinet NSE7, Palo Alto Networks Certified Network Security Engineer (PCNSE), Palo Alto Networks Certified Cybersecurity Associate (PCCSA), VMware Certified Professional – Data Center Virtualization (VCP-DCV), VMware Certified Advanced Professional – Network Virtualization (VCAP-NV), Certified Kubernetes Administrator (CKA), Certified Kubernetes Application Developer (CKAD), CompTIA Security+, CompTIA Network+, TOGAF 9 Certified, PRINCE2 Practitioner, Certified Information Systems Security Professional (CISSP), Certified Ethical Hacker (CEH). Output per item: { "naam": "", "status": "geldig|verlopen|onbekend" }.
- Werkervaring_relevant: "0-2 jaar" | "2-5 jaar" | "5-10 jaar" | "10+ jaar" | null.
- Functie_type: Specialist | Consultant | Architect | Projectmanager | null.
- Functie_groep (alleen uit): Automation, Cloud, Cyber Security, Enterprise Networking, Service Provider, Wireless, Architectuur, Datacenter, Project / Programma Management, Transformation Lead, EUC, IAM, Management Consulting, Engineering, IT Transformations, Management Consultant, Stream Lead.
- Industry (alleen uit): Manufacturing, Public, Financial Services, Technology - Media - Telecom, Energy - Utilities.
- Type_ervaring_bedrijven (alleen uit): Startup, Scale-up, MKB, Enterprise, Detachering, Freelance.
- Niveau_overall: Associate | Intermediate | Advanced | Expert | null.
- Talen: max 3, alleen ≥ professionele werkvaardigheid.
- Project_ervaring_type (alleen uit): Migraties, Security audits, Cloud implementaties, Datacenter migraties, Netwerkdesign, DevOps implementaties, Compliance trajecten, IAM implementaties.
- 80%-regel: Alleen invullen als ≥80% zeker. Anders "te weinig data" (of null waar van toepassing).

JSON-SCHEMA (volledig teruggeven):
{
  "schema_version": "2025-08-F2F3",
  "dienstverband": "",
  "werkgebied": {
    "woonplaats": "",
    "provincie": "",
    "binnen_1_uur_steden": []
  },
  "opleidingen": {
    "hoogst_afgeronde_opleiding": "",
    "werk_en_denk_niveau": "",
    "relevant_voor_roles": ""
  },
  "certificaten": [
    { "naam": "", "status": "" }
  ],
  "werkervaring_relevant": "",
  "functie_type": "",
  "functie_groep": [],
  "industry": [],
  "type_ervaring_bedrijven": [],
  "niveau_overall": "",
  "skills_top5": [
    { "skill": "", "niveau": "" }
  ],
  "skills_all": [],
  "werkervaring_samenvatting_gdpr": "",
  "beschikbaarheid": "",
  "contract_voorkeur": [],
  "reisbereidheid": "",
  "talen": [
    { "taal": "", "niveau": "" }
  ],
  "sectoren_telling": 0,
  "project_ervaring_type": [],
  "tech_stack_aantal": 0,
  "laatste_functie_einddatum": "",
  "rolgeschiedenis": [
    { "rol": "", "jaren": 0 }
  ],
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
  "teamrol": {
    "rol": "",
    "gedrag": "",
    "sterke_punten": "",
    "aandachtspunten": ""
  },
  "disq_profiel": {
    "Dominant": { "score": 0, "interpretatie": "" },
    "Invloed": { "score": 0, "interpretatie": "" },
    "Stabiel": { "score": 0, "interpretatie": "" },
    "Consciëntieus": { "score": 0, "interpretatie": "" },
    "combinatieprofiel": "",
    "combinatie_uitleg": ""
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

/* ----------------- API handler ----------------- */

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch {}
    }

    const profiel = body?.profiel;
    const naam = body?.naam || "Kandidaat";
    const recruiternaam = body?.recruiternaam || "Recruiter van YaWorks";

    if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
      return res.status(400).json({ error: "Profiel ontbreekt of is leeg." });
    }

    // Stap 1: match check + miniData
    const step1Text = await openaiChat({
      system: "Je produceert uitsluitend geldige JSON, zonder codefences.",
      user: PROMPT_STEP1(profiel),
      temperature: 0.2,
      max_tokens: 1200,
    });
    const step1Parsed = safeJsonParse(step1Text);
    if (!step1Parsed.ok) {
      return res.status(500).json({ error: "JSON uit stap 1 niet te parsen", raw: step1Parsed.raw });
    }
    const beoordeling = step1Parsed.data;

    if (beoordeling?.aanschrijven !== "JA") {
      // Klaar: geen vervolgstappen
      return res.status(200).json({
        match: false,
        beoordeling,
        berichten: null,
        volledigeData: null,
      });
    }

    // Stap 2: berichten maken op basis van miniData
    const step2Text = await openaiChat({
      system: "Geef alleen geldige JSON terug met velden 'linkedin' en 'whatsapp'.",
      user: PROMPT_STEP2({ naam, recruiternaam, miniData: beoordeling?.miniData || {} }),
      temperature: 0.4,
      max_tokens: 800,
    });
    const step2Parsed = safeJsonParse(step2Text);
    if (!step2Parsed.ok) {
      return res.status(500).json({ error: "JSON uit stap 2 niet te parsen", raw: step2Parsed.raw });
    }
    const berichten = step2Parsed.data;

    // Stap 3: volledige JSON
    const step3Text = await openaiChat({
      system: "Je produceert uitsluitend geldige JSON. Geen codefences.",
      user: PROMPT_STEP3(profiel),
      temperature: 0.1,
      max_tokens: 3500,
    });
    const step3Parsed = safeJsonParse(step3Text);
    if (!step3Parsed.ok) {
      return res.status(500).json({ error: "JSON uit stap 3 niet te parsen", raw: step3Parsed.raw });
    }
    const volledigeData = step3Parsed.data;

    // Alles terug
    return res.status(200).json({
      match: true,
      beoordeling,
      berichten,
      volledigeData,
    });
  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({ error: "Serverfout", detail: err.message });
  }
}

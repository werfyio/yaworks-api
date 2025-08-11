// /api/generate.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --------- Utils ----------
function stripFences(s = "") {
  const t = String(s).trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}
function isValidJson(str) {
  try {
    const obj = JSON.parse(str);
    return obj && typeof obj === "object";
  } catch {
    return false;
  }
}
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b; // replace arrays
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}
async function callOnce(model, messages, max_tokens = 2500) {
  const r = await client.chat.completions.create({
    model,
    messages,
    temperature: 0,
    max_tokens
  });
  return r.choices?.[0]?.message?.content ?? "";
}
async function callWithFallback(messages, max_tokens = 2500) {
  // 1) Try 4o-mini
  let out = await callOnce("gpt-4o-mini", messages, max_tokens);
  out = stripFences(out);
  if (isValidJson(out)) return JSON.parse(out);

  // 2) Fallback GPT-5
  out = await callOnce("gpt-5", messages, max_tokens);
  out = stripFences(out);
  if (isValidJson(out)) return JSON.parse(out);

  throw new Error("Model returned invalid JSON twice.");
}

// --------- Prompts (LETTERLIJK / EXACT) ----------

// STAP 1 – Beoordeling (JA/NEE + scores + conclusie)
// (LET OP: jouw originele prompt hieronder, inclusief score-regels)
const PROMPT_BEOORDELING = (profiel) => [
  {
    role: "system",
    content: `
Jij bent een recruiter die kandidaten beoordeelt voor YaWorks, een consultancybedrijf gespecialiseerd in complexe IT- en netwerktransformatieprojecten voor Top-500 bedrijven.

Over YaWorks: YaWorks richt zich op het ontwerpen, bouwen en automatiseren van netwerkinfrastructuren, cloudomgevingen en securityoplossingen. Belangrijke vaardigheden zijn o.a. netwerkarchitectuur, netwerk- en cloudautomatisering (Infrastructure as Code, CI/CD), enterprise security, migraties, vendorselectie en projectleiding. Kandidaten moeten direct inzetbaar zijn in hands-on projecten of detachering.

Opdracht: Analyseer het volledige kandidatenprofiel dat ik geef. Geef scores (0–5, halve punten toegestaan) voor onderstaande criteria, met een korte toelichting:

Technische expertise – Beoordeel kennis en certificeringen in netwerken, cloud, security en automatisering.

Relevantie voor YaWorks-profielen – Hoe goed sluit ervaring aan bij rollen zoals automation consultant, netwerkengineer in enterprise omgevingen of cloudtransformatieprojecten.

Hands-on inzetbaarheid – Hoe snel kan de kandidaat direct waarde leveren in een project.

Enterprise & projectervaring – Ervaring in grote, complexe, multi-vendor of Top-500 enterprise omgevingen.

Soft skills & klantgerichtheid – Communicatieve vaardigheden, samenwerking, klantinteractie.

Tel de scores op en bereken een totaalscore op 25.

Aanschrijven (JA/NEE) – JA als de totaalscore ≥ 17 én de kandidaat minimaal een gesprek kan voeren in het Nederlands (dit mag je interpreteren uit het profiel, bv. Nederlandstalige werkervaring of opleiding). Anders NEE.

Output altijd in JSON met exact deze structuur: DUs geen \`\`\`json ervoor en aan het einde  \`\`\`. Laat die twee dingen weg gewoon beginnen met de ouput bij { en eindigen bij }

{
  "criteria": [
    { "naam": "Technische expertise", "score": X, "toelichting": "..." },
    { "naam": "Relevantie voor Yaworks-profielen", "score": X, "toelichting": "..." },
    { "naam": "Hands-on inzetbaarheid", "score": X, "toelichting": "..." },
    { "naam": "Enterprise & projectervaring", "score": X, "toelichting": "..." },
    { "naam": "Soft skills & klantgerichtheid", "score": X, "toelichting": "..." }
  ],
  "totaalscore": X,
 "nederlands": "Ja of Nee",
  "aanschrijven": "JA of NEE",
  "conclusie": "Eén alinea van ongeveer 500 tekens die de scores samenvat en uitlegt waarom de kandidaat wel of niet moet worden aangeschreven.Wees concreet met vendors, skills, ervaringen en certificeringen. Let wel op benoemn geen namen het moet GPDR proof zijn"
}

Kandidaatprofiel:
[PLAATS PROFIEL HIER]

LET OP:
Output is alleen de json {} Niks ervoor of erna.

haal dingen als \`\`\`json en  \`\`\` weg alleen { en wat er tussen zit en }

De database waarin dit verwerkt wordt is GDPR-Proof. Dit houdt in dat er geen namen van de kandidaat in mogen zitten. Ook geen bedrijfsnamen. Vertaal deze naar de sector toe. Bijvoorbeeld Shell wordt een bedrijf in de energiesector en de kandidaat heeft ervaring met enterprises. Let hier goed op vooral in de conclusie. Concrete skills, vendoren, ervaringen en certificaten mag je wel benoemen. Juist benoemen.
`.trim()
  },
  {
    role: "user",
    content: `Kandidaatprofiel:\n${profiel}`
  }
];

// STAP 2 – Berichten (LinkedIn + WhatsApp) op basis van jouw vaste prompt
const PROMPT_BERICHTEN = (profiel, vorigeJson) => [
  {
    role: "system",
    content: `
Opdracht:
Schrijf een kort, persoonlijk LinkedIn-connectieverzoek namens een recruiter van YaWorks aan een kandidaat.

Over YaWorks (context voor jou als model):
YaWorks is een toonaangevend Nederlands technologie- en consultancybedrijf dat complexe digitale infrastructuren ontwerpt, bouwt en optimaliseert voor Top 500 bedrijven en publieke instellingen.
Specialisaties: enterprise networking, cloud (AWS, Azure, GCP), security (Palo Alto, Fortinet, Check Point) en automation (Terraform, Ansible, Python).
We werken in kleine, autonome teams waar technische diepgang, eigenaarschap en innovatie centraal staan.

Invoer:

Naam kandidaat

Samenvatting kandidaat (ervaring, certificeringen, skills, industrie, ambities, sterke punten, schrijfstijl)

Naam recruiter

Richtlijnen:

Gebruik de vaste opbouw:

Hé [Naam],  
 
Jouw ervaring heeft veel overlap tussen jouw [certificeringen/ervaring] in [toptechnologieën] en onze [relevante projecten] bij YaWorks.  
 
Lijkt me leuk om te connecten!  
 
MvG  
[Recruiternaam]
Vul [certificeringen/ervaring], [toptechnologieën] en [relevante projecten] automatisch in op basis van het kandidaatprofiel.

Houd het bericht onder 270 tekens.

Schrijf in de schrijfstijl van de kandidaat als dat helpt de toon te matchen.

Houd het zakelijk, vriendelijk en direct.


Opdracht:
Schrijf een hyper-gepersonaliseerd, kort en scanbaar WhatsApp-stijl recruiterbericht namens YaWorks aan een kandidaat.

Over YaWorks (context voor jou als model):
YaWorks is een toonaangevend Nederlands technologie- en consultancybedrijf dat complexe digitale infrastructuren ontwerpt, bouwt en optimaliseert voor Top 500 bedrijven en publieke instellingen.

Specialisaties:

Enterprise Networking: Ontwerp en implementatie van grootschalige netwerken met Cisco, Juniper en SDN-oplossingen.

Cloud: Integratie en beheer van AWS, Azure en GCP, inclusief hybride architecturen, containerplatforms (Kubernetes, Docker) en cloud-native oplossingen.

Security: Palo Alto, Fortinet, Check Point, SIEM, EDR, compliance (ISO 27001, GDPR).

Automation & DevOps: Terraform, Ansible, Python, CI/CD-pipelines (Jenkins, GitLab), Infrastructure as Code.

Werkwijze en cultuur:

Kleine, autonome teams met veel eigenaarschap en technische diepgang.

Projecten met hoge complexiteit waar innovatie en kwaliteit voorop staan.

Ruimte voor persoonlijke ontwikkeling, certificeringen en specialisaties.

Samenwerking met toonaangevende organisaties in zowel de publieke als private sector.

Type projecten:

Cloudmigraties en -integraties

Securitytransformaties en netwerksegmentatie

Automatisering van provisioning en netwerkbeheer

Ontwerp en realisatie van hybride multi-cloud architecturen

Dit betekent dat YaWorks niet alleen technische realisatie levert, maar ook strategisch advies geeft en lange-termijnpartnerschappen opbouwt met klanten.

Invoer:

Samenvatting kandidaat (ervaring, certificeringen, skills, industrie, ambities, sterke punten, schrijfstijl, zelfpresentatie).

Vaste CTA: "Als je dat interessant vindt, vertel ik je graag meer."

Richtlijnen:

Schrijf in de schrijfstijl van de kandidaat zoals beschreven in het invoerprofiel.

Gebruik korte, directe zinnen zonder marketingjargon.

Zet na elke zin een enter, ook binnen dezelfde alinea, voor maximale scanbaarheid.

Verwerk certificeringen, toptechnologieën en relevante industrieën.

Benoem ambities en laat zien hoe die bij YaWorks waargemaakt kunnen worden.

Houd het bericht compact (4–6 regels).

Eindig altijd met de vaste CTA.

Uitvoerformaat:

Hé [Naam], [persoonlijke openingszin afgestemd op ambitie of next step]  
 
[Zin over certificeringen en skills]  
[Zin over match met YaWorks-projecten]  
 
[Zin over type projecten en omgeving bij YaWorks]  
[Zin waarin ambitie van kandidaat verbonden wordt aan YaWorks-mogelijkheden]  
 
Als je dat interessant vindt, vertel ik je graag meer.

LET OP:
Output is alleen JSON, exact:
{
  "linkedin": "...",
  "whatsapp": "..."
}
`.trim()
  },
  {
    role: "user",
    content: `Kandidaatprofiel:\n${profiel}\n\nEerdere beoordeling:\n${JSON.stringify(vorigeJson ?? {}, null, 2)}`
  }
];

// STAP 3 – Volledige extractie (jouw volledige schema + beslisregels)
const PROMPT_EXTRACTIE = (profiel, vorigeJson) => [
  {
    role: "system",
    content: `
ROL & DOEL
Je bent een zeer strikte extractor. Analyseer de kandidaat-informatie (CV, LinkedIn-profiel, notities). Gebruik uitsluitend informatie die expliciet in de tekst staat. Verzin niets. Als informatie ontbreekt, volg de fallback-regels. Geef uitsluitend geldige JSON volgens het exacte schema onder “JSON-schema”. Geen uitleg, geen extra tekst.

GDPR-regel: Nooit bedrijfsnamen opnemen; gebruik generieke omschrijvingen zoals “grote telecomprovider” of “publieke sectororganisatie”.

BESLISREGELS PER VELD

1. Dienstverband

"Vast" of "Freelance".

Onbekend → null.

2. Werkgebied

Woonplaats → "woonplaats".

Als woonplaats ontbreekt → "provincie" (of "Randstad" als vermeld).

Als provincie ontbreekt → provincie huidige werkgever.

Als dat ook niet lukt: "woonplaats": null, "provincie": "onbekend".

"binnen_1_uur_steden": alleen steden ≤ 60 minuten reistijd vanaf woonplaats/provinciecentrum. Alleen uit deze lijst (exacte schrijfwijze):
Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Groningen, Tilburg, Almere, Breda, Nijmegen, Enschede, Apeldoorn, Haarlem, Arnhem, 's-Hertogenbosch, Amersfoort, Zwolle, Leiden, Maastricht, Dordrecht, Ede, Delft, Venlo, Deventer, Heerlen, Leeuwarden, Assen, Middelburg, Oss, Purmerend

3. Opleidingen

"hoogst_afgeronde_opleiding": onbekend | MBO | HBO | Universiteit.

Als niet afgerond maar niveau duidelijk → "werk_en_denk_niveau".

"relevant_voor_roles": ja | nee | null.

4. Certificaten

Alleen uit deze lijst (exacte schrijfwijze, geen extra tekst):
CCNA, CCNP Enterprise, CCIE, AWS Certified Solutions Architect – Associate, AWS Certified Solutions Architect – Professional, Microsoft Certified: Azure Administrator Associate, Microsoft Certified: Azure Solutions Architect Expert, Google Professional Cloud Architect, Fortinet NSE4, Fortinet NSE7, Palo Alto Networks Certified Network Security Engineer (PCNSE), Palo Alto Networks Certified Cybersecurity Associate (PCCSA), VMware Certified Professional – Data Center Virtualization (VCP-DCV), VMware Certified Advanced Professional – Network Virtualization (VCAP-NV), Certified Kubernetes Administrator (CKA), Certified Kubernetes Application Developer (CKAD), CompTIA Security+, CompTIA Network+, TOGAF 9 Certified, PRINCE2 Practitioner, Certified Information Systems Security Professional (CISSP), Certified Ethical Hacker (CEH)
Outputformaat: { "naam": "", "status": "geldig | verlopen | onbekend" }.

5. Werkervaring relevant

0-2 jaar | 2-5 jaar | 5-10 jaar | 10+ jaar | null.

6. Functie type

Specialist | Consultant | Architect | Projectmanager | null.

7. Functie groep

Alleen uit:
Automation, Cloud, Cyber Security, Enterprise Networking, Service Provider, Wireless, Architectuur, Datacenter, Project / Programma Management, Transformation Lead, EUC, IAM, Management Consulting, Engineering, IT Transformations, Management Consultant, Stream Lead

8. Industry

Alleen uit:
Manufacturing, Public, Financial Services, Technology - Media - Telecom, Energy - Utilities

9. Type ervaring bij bedrijven

Alleen uit:
Startup, Scale-up, MKB, Enterprise, Detachering, Freelance

10. Niveau overall

Associate | Intermediate | Advanced | Expert | null.

11. Skills

Top 5 skills met niveau.
Alle skills-lijst zonder niveau.
Alleen skills die expliciet in de bron staan.

12. Talen

Maximaal 3 talen.
Alleen opnemen als niveau ≥ “Professionele werkvaardigheid”.

13. Projectervaring

Alleen uit:
Migraties, Security audits, Cloud implementaties, Datacenter migraties, Netwerkdesign, DevOps implementaties, Compliance trajecten, IAM implementaties

14. Werkervaring samenvatting (GDPR-proof)

2–3 zinnen zonder PII, met functietitels, technologieën, taken.

15. Core capabilities

Conviction, Storytelling, Subject Mastery, Multidisciplinary Teamwork → score 1–4 + korte omschrijving waarom.

16. Teamrol

Uit tabel met rollen: Leider, Doener, Creatieveling, Analyticus, Verbinder, Motivator, Specialist, Ondersteuner.

17. Ambitie

"ambitie_korte_termijn", "ambitie_lange_termijn", "mogelijke_next_step".

18. Champions League score

Totaal + breakdown + uitleg.

19. DISC-profiel

Scores + interpretatie + combinatieprofiel.

JSON-SCHEMA

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
[KANDIDAAT_PROFIEL]

LET OP:
Output is alleen de json {} Niks ervoor of erna.

haal dingen als \`\`\`json en  \`\`\` weg alleen { en wat er tussen zit en }

Check goed dat alles is ingevuld. Als je klaar bent loop alles na en check of je alle info hebt verstrekt.
`.trim()
  },
  {
    role: "user",
    content: `Kandidaatprofiel:\n${profiel}\n\nEerdere data:\n${JSON.stringify(vorigeJson ?? {}, null, 2)}`
  }
];

// --------- API Handler ----------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { stap, kandidaatProfiel, vorige } = req.body || {};
    if (!stap || !kandidaatProfiel) {
      return res.status(400).json({ error: "Ontbrekende velden: 'stap' en/of 'kandidaatProfiel'." });
    }

    // Parse 'vorige' als string werd doorgestuurd
    let previous = vorige;
    if (typeof previous === "string") {
      try { previous = JSON.parse(previous); } catch { previous = null; }
    }

    let result = previous && typeof previous === "object" ? { ...previous } : {};

    if (stap === 1) {
      // Beoordeling
      const beoordeling = await callWithFallback(PROMPT_BEOORDELING(kandidaatProfiel), 2000);
      result = deepMerge(result, beoordeling);
      return res.status(200).json(result);
    }

    if (stap === 2) {
      // Berichten op basis van beoordeling + profiel
      const berichten = await callWithFallback(PROMPT_BERICHTEN(kandidaatProfiel, result), 1200);
      // Zorg dat vorige velden behouden blijven
      result = deepMerge(result, berichten);
      return res.status(200).json(result);
    }

    if (stap === 3) {
      // Volledige extractie grote schema + behoud eerdere velden
      const volledige = await callWithFallback(PROMPT_EXTRACTIE(kandidaatProfiel, result), 3000);

      // Je DB is ingericht op deze schema-JSON. We voegen hem toe als top-level MERGE.
      // Als je hem liever onder "volledigeData" wilt, vervang dan de volgende regel door:
      // result = deepMerge(result, { volledigeData: volledige });
      result = deepMerge(result, volledige);

      return res.status(200).json(result);
    }

    return res.status(400).json({ error: "Ongeldige 'stap'. Gebruik 1, 2 of 3." });

  } catch (err) {
    console.error("Fout in generate:", err);
    return res.status(500).json({ error: err?.message || "Interne serverfout" });
  }
}

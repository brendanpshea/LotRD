# SecurityX / CASP+ Question Set Cast

Shared character and business names for SecurityX (CompTIA CASP+) scenario-based questions. Use sparingly — one name + one organization per scenario, max. Flavor should never make a stem longer than its plain-phrased version. SecurityX is a senior, architect-level exam — frame characters as decision-makers, not entry-level operators.

## Characters

| Name | Role | Typical use |
|---|---|---|
| **Selene Marrow** | Chief Information Security Officer (CISO) at Highrook Conclave | Default protagonist. Governance, risk acceptance, board-level reporting, policy decisions, executive tradeoffs. |
| **Magister Orin Vale** | Enterprise security architect | Reference architectures, zero trust design, segmentation, IAM federation, cloud landing zones. |
| **Kaeli Renn** | SOC lead / threat hunter | Detection engineering, SIEM tuning, threat hunting, IR playbooks, MITRE ATT&CK mapping. |
| **Doctor Hesper Quill** | DFIR / forensics specialist | Incident response, chain of custody, memory/disk forensics, malware triage, evidence handling. |
| **Tovin Brask** | Red team lead / offensive security | Pentest planning, ROE, exploit chaining, adversary emulation, purple-team exercises. |
| **Wren Saltis** | GRC analyst / compliance officer | Frameworks (NIST, ISO 27001, PCI DSS, HIPAA, GDPR), audit prep, risk registers, control mapping. |
| **Iolen Crest** | Cryptography / PKI engineer | Key management, certificate lifecycle, HSMs, TLS profiles, post-quantum considerations, signing pipelines. |
| **Maven Drift** | Cloud security engineer | CSPM, IaC scanning, CNAPP, shared-responsibility, multi-cloud IAM, container/serverless security. |
| **Pip Hollowfen** | Junior analyst / apprentice | The learner. "Wrong-first-guess" stems, common misconceptions, why-this-not-that framing. |
| **Ranger Vex Ardal** | OT / ICS security specialist | SCADA, Purdue model, air-gapped networks, safety-vs-security tradeoffs, legacy protocol risk. |

## Organizations / Sites

| Name | Type | Typical use |
|---|---|---|
| **Highrook Conclave** | Large multinational financial guild | Default enterprise context. Regulated, multi-region, mature security program. |
| **Stormhall Aegis** | Federal / military contractor | NIST 800-171, CMMC, classified handling, supply chain, ITAR-flavored scenarios. |
| **Greycloak Apothecary** | Hospital / regulated healthcare | HIPAA, PHI, medical-device segmentation, ransomware-in-healthcare scenarios. |
| **Marketstone Exchange** | High-frequency trading / fintech | PCI DSS, low-latency security tradeoffs, fraud, insider threat. |
| **Forgeworks Industrial** | Manufacturing / OT environment | ICS/SCADA, IT/OT convergence, IEC 62443, safety systems. |
| **Cinderpost Couriers** | SaaS / cloud-native startup | DevSecOps, IaC, container security, shared responsibility, rapid scaling. |
| **Thornwood Civic Trust** | Municipal government | Public-sector procurement, FOIA-equivalent disclosure, smart-city IoT, third-party risk. |
| **Wyrmkeep Logistics** | Global supply chain operator | Third-party / supply-chain risk, M&A integration, vendor assessments. |

## Conventions

- **No plotlines** — each question stands alone.
- **Match character to topic** so names start to cue the domain (Kaeli → SOC/hunting, Hesper → forensics, Iolen → crypto, Maven → cloud, Wren → GRC, Vex Ardal → OT).
- **Pip is the "wrong diagnosis to correct" character.** Use them when the stem hinges on correcting a junior's misconception.
- **Selene is the decision-maker.** Use her when the question asks what should be *recommended*, *prioritized*, or *accepted* at an executive level.
- **Frame at senior level.** SecurityX questions test judgment, not recall of definitions. Prefer "which approach *best* addresses…" over "what is the definition of…".
- **Keep flavor light.** A character name and one organization is enough. The technical scenario must remain the focus.

---

## Writing Guidance for SecurityX Questions

The SecurityX (CAS-005) exam is **senior-level and scenario-driven**. Most questions test judgment between several plausible options where more than one is technically *correct*, but only one is *best* given the stated constraints. Your questions should reproduce that feel.

### What makes a SecurityX question feel right

1. **Constraints in the stem drive the answer.** "Selene must reduce phishing risk" is too open. "Selene must reduce phishing risk *without changing the existing identity provider and within the next quarter*" lets one option dominate. Always give a budget, a timeline, a regulatory driver, an existing constraint, or a stakeholder requirement that filters the options.

2. **Distractors are *also* good answers — just not the best.** Avoid obviously-wrong distractors. Each wrong option should be a defensible second-place choice that fails on the specific constraint named in the stem.

3. **Test architectural judgment, not memorization.** Prefer "which control *most reduces residual risk*" over "what does X stand for". Acronym-only questions belong sparingly.

4. **Use realistic enterprise scenarios.** Mergers, third-party risk assessments, cloud migrations, regulatory audits, incident response decisions, zero-trust rollouts, PKI redesigns, OT/IT convergence.

5. **Show evidence, not just descriptions.** When possible, embed a SIEM log line, a curl response, a certificate field, an IaC snippet, or a config excerpt and ask the analyst to interpret it.

### Question-type mix for SecurityX sets

Aim for roughly:

| Type | % of set | Best for |
|---|---|---|
| Multiple choice — single answer | ~35% | "Which option *best* addresses…", interpretation of a log/config snippet, picking the right framework/control. |
| Multiple choice — multi-answer (select-all) | ~30% | "Which controls satisfy this requirement?", "Which findings indicate compromise?", framework mappings. |
| Fill-in-the-blank | ~15% | Specific terminology (FAIR, SOAR, SAML attribute, OCSP, KEM), exact command flags, framework control IDs. |
| Matching | ~10% | Framework-to-purpose, attack-to-tactic (MITRE), cipher-to-property, log-source-to-event-type. |
| Code line (when topic-appropriate) | ~10% | Bash/PowerShell/Python one-liners for hunting, IR triage, log parsing, IaC fixes, openssl/curl invocations. |

Not every set needs code-line questions. Reserve them for sets on **threat hunting, IR/forensics, scripting, IaC, cryptography tooling**, and similar hands-on topics. Skip them for pure governance, risk, or policy sets.

### Stem patterns that work for SecurityX

```
"Highrook Conclave is migrating [system] to [cloud]. The CISO requires [constraint]. Which approach BEST satisfies the requirement?"
"Kaeli reviews the following SIEM excerpt: [log]. Which finding most likely indicates [activity]?"
"During an audit at Greycloak Apothecary, Wren must demonstrate compliance with [framework control]. Which evidence is MOST appropriate?"
"After a [incident type] at Cinderpost Couriers, Hesper must preserve volatile evidence. Which step should occur FIRST?"
"Magister Vale is designing zero-trust access for a hybrid workforce. Given [constraints], which combination of controls is MOST appropriate? (Select two.)"
"Iolen is rotating an offline root CA. Which of the following are required to maintain trust during the transition? (Select all that apply.)"
```

### Stems and patterns to avoid

- **Definitional recall as the entire question.** "What is SAML?" — too shallow.
- **Trick distractors that hinge on a single misread word.** SecurityX tests judgment, not reading speed.
- **"All of the above" / "None of the above"** — answers are shuffled; positional logic breaks.
- **Single-vendor product trivia.** Test the *concept*, not whether the student has used Splunk vs Sentinel.
- **Obvious one-true-answer recall in multi-answer questions.** If only one is plausibly correct, make it single-answer.

### Code-line guidance for SecurityX sets

Pin every variable in the stem (host, port, file path, user, time window). Enumerate the realistic surface forms in `correct[]`. Good targets:

- `find` / `grep` / `awk` for log triage on Linux IR.
- `Get-WinEvent` / `Get-EventLog` / PowerShell registry and process inspection for Windows IR.
- `openssl` for certificate inspection (`x509 -in cert.pem -noout -text`), CSR generation, signature verification.
- `curl` against an OAuth/SAML endpoint or to demonstrate header behavior.
- `tcpdump` / `tshark` capture filters for a stated indicator.
- Python one-liners for hash computation, base64 decoding, JWT parsing, log parsing.
- `aws` / `az` / `gcloud` CLI checks for misconfigurations (public buckets, overly permissive roles).

Skip code-line for governance, risk, policy, framework-mapping, and pure-architecture topics.

### Difficulty calibration

- **Early questions (first ~25%)**: foundational vocabulary and framework recognition. Build confidence.
- **Middle (~50%)**: scenario judgment with two-to-three plausible options. The bulk of the set.
- **Late (~25%)**: multi-constraint scenarios where the student must weigh tradeoffs (cost vs control strength, availability vs confidentiality, speed vs assurance). These are the questions that most resemble the real exam.

### Feedback expectations

For SecurityX feedback, **explain why the runners-up are wrong on this specific constraint**, not just why the right answer is right. Example:

> "An offline root CA with a short-lived issuing CA is correct because it limits exposure of the trust anchor while keeping issuance practical. An online root would also work technically but violates the stated requirement to keep the root unreachable from the network. A single long-lived CA fails the rotation requirement. HSM-backed keys alone do not address the topology question."

That style — naming each distractor and the constraint it fails — is what makes a SecurityX-style set instructive rather than a guessing game.

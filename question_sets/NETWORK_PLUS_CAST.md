# Network+ Question Set Cast

Shared character and business names for Network+ scenario-based questions. Use sparingly — one name + one site per scenario, max. Flavor should never make a stem longer than its plain-phrased version.

## Characters

| Name | Role | Typical use |
|---|---|---|
| **Aria Thorne** | Senior network admin at Silverkeep Holdings | Default protagonist. Config tasks, general troubleshooting. |
| **Brom Ironfoot** | Junior tech / apprentice | The learner. Command-output reads, "wrong-first-guess" stems. |
| **Lyra Vex** | Security analyst | Security, AAA, zero trust, firewall, IDS/IPS scenarios. |
| **Captain Doran Kell** | Infrastructure lead / architect | Design decisions, WAN, routing, capacity planning. |
| **Mira Sollen** | Help-desk tier 1 | "User reports…" framing for troubleshooting. |
| **Old Hask** | Field / cable tech | Physical layer, cabling, transceivers, connectors. |
| **Zinna Arc** | Cloud / SDN engineer | Cloud, virtualization, SD-WAN, NFV scenarios. |

## Businesses / Sites

| Name | Type | Typical use |
|---|---|---|
| **Silverkeep Holdings** | Corporate HQ (employer) | Default enterprise context. |
| **Ember Forge Workshop** | Small branch office | Remote site in WAN/VPN scenarios. |
| **The Gilded Tankard** | Inn / guest-wifi venue | Wireless, captive portal, guest VLAN. |
| **Thornwood Clinic** | Regulated small business | Segmentation, compliance-flavored security. |
| **Marketstone Exchange** | Trading floor | Low-latency, QoS, high-throughput. |
| **Ravenshade Academy** | School campus | Large wireless, BYOD, multi-building. |

## Conventions

- No plotlines — each question stands alone.
- Match character to topic so names start to cue the domain (Lyra → security, Hask → cabling, Zinna → cloud).
- Brom is the "wrong diagnosis to correct" character.
- Never let flavor obscure the technical question.

## The sets

Twelve sets cover the CompTIA Network+ **N10-010** exam objectives (draft v1.2), in course order below. There is no textbook behind them, so each set must teach on its own: its scenes teach every idea before a question tests it, and its feedback says why each runner-up fails. The cast above appears in question stems; the Guild's mentors (`assets/npcs.json`) teach the scenes (number of scenes in parentheses). The file names of the eleven older sets are kept, so the ids that track a student's progress still match; `netplus_12_cloud_modern.json` is new and comes third.

| Set | Title | Objectives | Mentors |
|---|---|---|---|
| `netplus_01_fundamentals.json` | Appliances, Protocols & Models | 1.1, 1.3 | Tariq (5), Val (2) |
| `netplus_02_media_topology_addressing.json` | Media, Transceivers & IP Addressing | 1.4, 1.6, IPv6 of 1.7 | Nia (3), Ada (2), Tariq (2) |
| `netplus_12_cloud_modern.json` | Cloud, Topologies & Modern Networks | 1.2, 1.5, 1.7 except IPv6 | Tariq (5), Flint (1), Val (1) |
| `netplus_03_routing_switching.json` | Routing & Switching | 2.1, 2.2 | Tariq (5), Nia (2) |
| `netplus_04_wireless_physical.json` | Wireless & Physical Installations | 2.3, 2.4 | Ada (4), Tariq (3) |
| `netplus_05_operations_monitoring.json` | Policies, Documentation & Monitoring | 3.1, 3.2 | Kaelen (5), Tariq (2) |
| `netplus_06_dr_services_access.json` | Continuity, Remote Access & AI | 3.3, 3.4, 3.5 | Val (3), Tariq (2), Omu (2) |
| `netplus_07_security.json` | Security Concepts & Compliance | 4.1 | Val (5), Tariq (2) |
| `netplus_08_attacks_defense.json` | Attacks & Defenses | 4.2, 4.3 | Val (3), Tariq (3) |
| `netplus_09_troubleshooting.json` | Troubleshooting Cabling, Interfaces & Wireless | 5.1 | Tariq (4), Ada (3) |
| `netplus_10_services_performance.json` | Troubleshooting Devices & Services | 5.2 | Tariq (6), Val (1) |
| `netplus_11_tools_commands.json` | Troubleshooting Tools & Commands | 5.3 | Tariq (3), Ada (1), Nia (1) |

The sets are held to the audit standard (`tests/data.test.js`): at least 30% of questions in a format that resists memorising (ordering, cloze, dynamic numeric, code line, rule table), no six of one kind in a row, teaching scenes each followed by the questions they prepare, and a catalog intro. Each set has one rule table, the shape of a performance-based question. Commands in code-line questions say which OS they are for and are kept to 20 tokenized characters.

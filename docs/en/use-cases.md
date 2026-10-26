# Use Cases

This catalog maps common business scenarios to an ontology style, describes what an LLM or AI agent does with the ontology, and points to the bundled sample and tutorial that show it. For the reasoning behind each choice, see [Choosing an Ontology Style](choosing-ontology-style.md).

Two reminders apply to every scenario. The extension does not call any LLM; it is where you design, check and query the ontology that your own model or agent uses. And the samples are fictional: in an Object Ontology file, the `objects:` section is example data, not a live connection to your systems.

## At a glance

| # | Scenario | Style | Sample |
| --- | --- | --- | --- |
| 1 | Logistics dispatch and delay handling | Object Ontology | `delivery-ops.oont.yaml` |
| 2 | Plant maintenance from sensor alerts | Object Ontology | `plant-maintenance.oont.yaml` |
| 3 | Customer support refunds | Object Ontology | `support-desk.oont.yaml` |
| 4 | Product catalog compatibility | Semantic Web | `product-compatibility.ttl` |
| 5 | Enterprise glossary and search | Semantic Web (SKOS) | `glossary-skos.ttl` |
| 6 | Data catalog and lineage | Semantic Web (DCAT + PROV-O) | `dataset-catalog.ttl` |
| 7 | Research and academic integration | Semantic Web (schema.org) | `research-kg.ttl` |
| 8 | Regulated domains with standard vocabularies | Semantic Web | No dedicated sample |
| 9 | Cross-company data exchange | Semantic Web, often hybrid | No dedicated sample |
| 10 | Operations that speak the business's language | Hybrid | `delivery-ops.oont.yaml` + `glossary-skos.ttl` |

New to Object Ontology? Start with [`cafe-orders.oont.yaml`](../../samples/cafe-orders.oont.yaml), a small starter with three types and three actions.

## 1. Logistics dispatch and delay handling

**Situation.** A dispatcher at a last-mile delivery company handles delays all day: a van goes into maintenance, and its shipments must move to another vehicle and customers must be told.

**Style: Object Ontology.** The work is a sequence of changes — reassign, mark delayed, notify — each with rules about which vehicle is allowed. Those rules belong next to the actions, which is what action types are for.

**What the agent does.** Asked "S-5001 is late, sort it out", the agent reads that S-5001 is delayed on van V-101 (in maintenance), follows the depot link from D-01 to its vehicles, rejects V-201 (another depot, on route, nearly full), picks V-102 (available, 650 kg spare), calls `assignVehicle` (S-5001 to V-102) and then `notifyCustomer` for Bayview Bakery. The tools come from **Export Actions as AI Agent Tools (JSON Schema)...**; the validations in each tool's description tell the agent which calls your backend will reject.

Sample: [`delivery-ops.oont.yaml`](../../samples/delivery-ops.oont.yaml), with an OWL version for comparison in [`delivery-ops.ttl`](../../samples/delivery-ops.ttl). Tutorial: [Tutorial 6](tutorial-6-object-ontology-ai-agents.md).

## 2. Plant maintenance from sensor alerts

**Situation.** A vibration sensor raises an alert, and someone has to decide whether to open a work order, who should take it, and which spare part to reserve.

**Style: Object Ontology.** The answer is again a set of guarded actions: no duplicate work orders on one machine, and parts reserved only if they fit and are in stock.

**What the agent does.** Sensor SN-301 on machine M-03 "Cap press 3" (line L-02) reports reading R-9002 at 11.8 mm/s against a threshold of 7.1. The agent follows the links from the reading to the machine, checks that M-03 has no open work order (WO-415 is on M-01), calls `createWorkOrder`, assigns technician T-02 Omar Lind, who has the vibrationAnalysis skill, with `assignTechnician`, and reserves bearing kit SP-12, which fits M-03, with `reserveSparePart`.

Sample: [`plant-maintenance.oont.yaml`](../../samples/plant-maintenance.oont.yaml). Tutorial: the same pattern as [Tutorial 6](tutorial-6-object-ontology-ai-agents.md), which uses the delivery sample.

## 3. Customer support refunds

**Situation.** A support agent — human or AI — issues refunds for damaged goods. Small refunds can be immediate; large ones need a lead's approval.

**Style: Object Ontology.** The approval threshold is a business rule attached to one action. Putting it in the ontology means the agent sees the rule in the tool description, and the backend that executes the tool enforces it.

**What the agent does.** Ticket TK-301 (customer CU-01, order OR-7001) is about cracked earbuds worth 4,800 JPY, under the 10,000 JPY limit, so the agent calls `issueRefund`. Ticket TK-302 (customer CU-02, order OR-7002) is about a crushed 24,800 JPY speaker; `issueRefund` would be rejected, so the agent calls `requestRefundApproval`, which creates a pending refund for lead SS-02 Ada Brooks. The extension does not evaluate the validation expressions. Rejecting the oversized refund is your backend's job.

Sample: [`support-desk.oont.yaml`](../../samples/support-desk.oont.yaml). Tutorial: [Tutorial 6](tutorial-6-object-ontology-ai-agents.md).

## 4. Product catalog compatibility

**Situation.** Customers ask a shop's assistant whether one part fits another. A wrong "yes" means a return.

**Style: Semantic Web.** Compatibility is knowledge about things, not an operation. OWL can say that compatibility is symmetric, that "part of" is transitive, and that one part replaces another.

**What the agent does.** For "does the 12-speed cassette fit my 11-speed chain?", the assistant queries the catalog instead of guessing. No compatibility is recorded, and the cassette is listed with the 12-speed chain, which replaces the 11-speed one. Because the viewer has no reasoner, the queries spell out symmetry with `UNION` and transitivity with `+`.

Sample: [`product-compatibility.ttl`](../../samples/product-compatibility.ttl). Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), sections 1 and 2.

## 5. Enterprise glossary and search

**Situation.** Teams use different words, abbreviations and languages for the same concept, so search and RAG miss relevant documents.

**Style: Semantic Web (SKOS).** SKOS is the W3C vocabulary for exactly this: preferred and alternative labels per language, broader and related concepts.

**What the agent does.** A retriever maps "ETA" or 「到着予定時刻」 to one concept with five labels, and expands "Last Mile" to its narrower and related terms in English and Japanese before searching. The model quotes the glossary's definitions instead of inventing them.

Sample: [`glossary-skos.ttl`](../../samples/glossary-skos.ttl); a smaller SKOS example is [`community-services-skos.ttl`](../../samples/community-services-skos.ttl). Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), section 3.

## 6. Data catalog and lineage

**Situation.** An analyst or assistant reports a number, and someone asks where it came from and whether it may be reused.

**Style: Semantic Web (DCAT + PROV-O).** DCAT describes datasets and their downloads; PROV-O describes which dataset was derived from which, by what activity and agent. Both are standards, so other catalog tools understand them.

**What the agent does.** For "how many people rode the network in March 2026?", the assistant finds the dataset that reports 1,284,300, walks `prov:wasDerivedFrom+` back to the raw counts, and cites publisher and license for each step. It states that the raw data is under an internal-use license and leaves the legal reading to the publisher.

Sample: [`dataset-catalog.ttl`](../../samples/dataset-catalog.ttl). Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), section 4.

## 7. Research and academic integration

**Situation.** Several institutes keep their own records of the same researchers and papers, under slightly different names.

**Style: Semantic Web (schema.org).** Global identifiers and `schema:sameAs` let records from different systems be joined without renaming anything, and schema.org gives shared terms for people, organizations and articles.

**What the agent does.** "Priya Raman" and "P. Raman" share the identifier `person/0103`, so a query by identifier finds both of her papers where a query by name finds one. The model may suggest that two records look alike; the merge itself happens only through a shared identifier.

Sample: [`research-kg.ttl`](../../samples/research-kg.ttl). Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), section 5.

## 8. Regulated domains with standard vocabularies

**Situation.** Healthcare, finance, libraries and the public sector often must use published code lists, thesauri or metadata standards, and must show where each answer came from.

**Style: Semantic Web.** Those vocabularies are commonly published as RDF or SKOS. Reusing them, rather than inventing a parallel model, keeps your data interpretable by regulators and partners.

**What the agent does.** The same patterns as scenarios 5 and 6: normalize terms to the official concept, and cite the dataset and license behind every figure. Any operations on top (filing, approving) can still be modeled as an Object Ontology.

There is no dedicated sample. The closest are [`glossary-skos.ttl`](../../samples/glossary-skos.ttl) for SKOS structure and [`dataset-catalog.ttl`](../../samples/dataset-catalog.ttl) for provenance. Guide: [Choosing an Ontology Style](choosing-ontology-style.md).

## 9. Cross-company data exchange

**Situation.** A shipper, a carrier and a retailer need to exchange records about the same shipments and parties, each from its own system.

**Style: Semantic Web, often hybrid.** Primary keys are unique only inside one system; IRIs and shared vocabularies are designed to work across organizations. Each company can still run its own operations as an Object Ontology and publish a Turtle export for exchange.

**What the agent does.** It resolves the other company's identifiers through `sameAs` links before answering, and it never writes to a partner's data directly — only through actions in its own company's ontology.

There is no dedicated sample. [`research-kg.ttl`](../../samples/research-kg.ttl) shows identifiers shared across organizations. Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), sections 5 and 6.

## 10. Operations that speak the business's language

**Situation.** The dispatch agent from scenario 1 must explain a delay to a Japanese customer in the company's standard terms.

**Style: Hybrid.** Operations stay in the Object Ontology; terminology stays in the SKOS glossary. **Export Object Ontology as Turtle (OWL)...** turns the operational model into Turtle that can be combined with the glossary.

**What the agent does.** After calling `markDelayed`, which changes the `eta` field, the agent looks up that field in the glossary and gets 到着予定時刻 for its message. The viewer queries one document at a time, so the two Turtle files must be combined first.

Samples: [`delivery-ops.oont.yaml`](../../samples/delivery-ops.oont.yaml) and [`glossary-skos.ttl`](../../samples/glossary-skos.ttl). Tutorial: [Tutorial 7](tutorial-7-semantic-web-llm.md), section 6.

## Next steps

- [Tutorial 5: Your First Object Ontology](tutorial-5-object-ontology.md) — create, view and edit an Object Ontology.
- [Tutorial 6: Object Ontology × AI Agents](tutorial-6-object-ontology-ai-agents.md) — actions as agent tools.
- [Tutorial 7: Semantic Web Ontologies × LLMs](tutorial-7-semantic-web-llm.md) — grounding, SPARQL, glossaries, provenance.
- [Choosing an Ontology Style](choosing-ontology-style.md) — the decision guide.

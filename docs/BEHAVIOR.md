# Mellow Simulator - Behavioral Mechanics

This document explains the core logic, entity interactions, and emergent behaviors governing the agents in the Mellow Simulator.

## 1. Core Agent Properties
- **Demographics:** Gender (Male/Female), Tribe (Red/Blue), Age (Child: 0-11, Teen: 12-17, Adult: 18-49, Elder: 50+)
- **Physical Attributes:** Strength, Intelligence
- **Personality Traits:** Personality (Extrovert/Introvert), Fighter, Libido, Charm
- **Resource Stats:** Hunger (Decays over time, refilled by eating food).

## 2. Spatial Awareness and Steering
Agents use a computationally efficient *Data-Oriented Spatial Hash Grid* for O(N) localized targeting. They evaluate their environment within two radii: `AWARENESS_RADIUS` (customizable) and `INTERACTION_RADIUS` (customizable). The `AGENT_RADIUS` is also adjustable globally.

- **Social Steering:** 
  - Introverts gently repel each other, while extroverts have a slight attraction.
  - **Same Tribe, Same Gender:** Agents naturally spread out to avoid clumping. However, if their individual strength is desperately low (< 40), they clump together into tight defensive formations for mutual protection.
  - **Tribe Capital Regrouping:** If a tribe's total population falls to dangerously low levels (< 12), remaining members instinctually undergo a long-distance migration toward their Tribe Capital (left side of the world for Red, right side for Blue) to safely regroup and find mates.
  - **Enemy Tribe:** Inter-tribe interaction forces are purely dictated by the `Fighter` trait. High fighters aggressively charge the closest enemy, while cowards inherently flee before ever making contact. **Survival Instinct:** If a highly intelligent agent is severely outmatched natively by an enemy's strength, they will override their aggressive `Fighter` trait and actively flee to survive.
  - **Same Tribe, Opposite Gender:** Attraction depends heavily on their base `Libido`. **Incest Avoidance:** Intelligent agents repel family members (capped at -1.5 force to prevent it from overwhelming other survival needs like food-seeking).
- **Food Seeking & Hunger Urgency:** If an agent's `Hunger` drops below 70%, they begin tracking nearby food. As hunger worsens, a **quadratic urgency curve** takes over:
  - **Food Attraction** scales from 1× (well-fed) up to **4×** (critically starving), making starving agents aggressively beeline toward food.
  - **Fear Dampening:** Fear-based steering (fleeing enemies, plague avoidance, survival instinct) is progressively dampened — down to **30%** at critical hunger. A starving agent will push through enemy territory or walk past plague carriers to reach food.
  - **Hierarchy:** When well-fed, fear dominates. When starving, food dominates. In between, they compete naturally.

## 3. Conflict and War
- **Initiation:** Triggered predominantly when touching an opposing tribe member. Scuffles can also break out internally among the same tribe, but **only if at least one agent has a Fighter trait above 50** — peaceful tribemates just push apart.
  - **Diplomacy (De-escalation):** If an internal scuffle is about to occur between two tribemates, highly intelligent agents have a strong chance to culturally talk down the aggressor, peacefully pushing apart and neutralizing the fight before anyone is harmed.
  - **War Caution:** Inter-tribe fight chance scales from 15% to 85% based on the average Fighter trait (previously 50-95%). Desperate tribes (pop < 12) are frightened rather than aggressive, reducing fight chance by an additional 30%.
- **Age Restriction:** Children (<12) are completely immune to, and incapable of, starting fights. Only Teens and Adults can fight.
- **Combat Resolution:** When a fight occurs, the victor is calculated via a weighted probability score: `Strength + (Intelligence * 0.5) + (Fighter * 0.3)`. Weariness reduces this score by up to 50% at maximum fatigue. The loser is marked for death immediately and turns into blood particles.

## 2.5 Combat Weariness & Recovery
Fighting takes a physical toll. Winners don't walk away unscathed.

- **Weariness Gain:** Each kill adds base weariness (default: 12 points), scaled by age:
  - **Teens (12-17):** ×0.4 — young and resilient, barely winded
  - **Adults (18-49):** ×1.0 — standard fatigue
  - **Elders (50+):** ×2.0 — fragile, fighting is extremely taxing
- **Combat Penalty:** Weariness reduces combat effectiveness by up to 50% at max weariness (100). A weary warrior with 80 STR fights like they have 60.
- **Natural Recovery:** Weariness recovers passively every tick, again age-dependent:
  - **Teens:** 0.08/tick (fully recover in ~500 ticks from a kill)
  - **Adults:** 0.04/tick (~1000 ticks to fully recover)
  - **Elders:** 0.015/tick (~2600 ticks — elders may never fully recover)
- **Well-Fed Bonus:** Agents with hunger above 70% recover weariness 1.5× faster. Eating is resting.
- **Exhaustion Death:** If weariness exceeds 90, the agent has a 0.3% per-tick chance of collapsing and dying from exhaustion. Serial killers burn out.
- **Visual Indicator:** A growing orange arc appears around agents whose weariness exceeds 20%, intensifying as fatigue increases.

## 4. Reproduction and Life Cycles
- **Initiation:** Triggered when two opposite-gender adults (ages 18-49) collide. Both agents must pass each other's minimum preference checks (`prefMinStrength`, `prefMinIntelligence`, `prefMinSpeed`, `prefPersonality`).
- **Preference Degradation:** As an agent remains single, their rigid partner preferences degrade. Lonely agents constantly lower their standards so they can eventually reproduce.
- **Mating:** If preferences are met, the probability of successful mating scales with their combined `Libido`. There is a small chance for triplets or twins. Parents then enter a temporary mating cooldown (customizable).
- **Genetics:** Offspring average their parents' stats with a sudden mutation variance (+/- 15%). Traits like `Charm`, `Libido`, and `Fighter` are also passed down or mutated randomly. 
- **Incest Penalties:** If agents share a direct parent or are deeply related, reproducing applies a massive 40% penalty to the child's core traits. However, if the tribe is critically underpopulated, agents will prioritize survival over genetics, bypassing the incest penalty entirely.

## 5. Epidemics and Starvation
- **The Plague:** Triggerable from the "God Toolbar", an infected agent glows green and acts as a carrier. Any interaction radius overlap with an infected agent spreads the plague instantly. Infected agents have a baseline random chance to drop dead every tick.
  - **Social Distancing:** Highly intelligent agents recognize the visual symptoms of the plague (the green glow) and will apply strong negative steering forces to actively run away from sick individuals.
- **Starvation:** If `ENABLE_HUNGER` is active, agents passively lose hunger points on every tick (Rate and Tolerance are customizable). If it reaches 0, they starve to death.
  - **Efficient Metabolism:** Intelligent agents know how to ration their energy. An agent with maximum intelligence passively starves 25% slower than lower-tier members.
  - **Proximity Braking:** Hungry agents (below 50% hunger) automatically slow down when within 40px of food, preventing them from overshooting the eat radius.
  - **Generous Eat Radius:** Agents consume food within `radius + 15` pixels (previously `radius + 5`), significantly reducing food flyover.

## 6. The "Saviors" Mechanic (Extinction Prevention)
The simulation has an emergency failsafe to prevent total civilization collapse due to gender imbalances. 

- **Global Population Tracking:** The master worker loop constantly counts every male and female across both tribes.
- **Emergency Declaration:** If one gender makes up less than 25% of the total population (e.g., heavily imbalanced 80/20) OR if the flat count of that gender falls below 15 globally, they are flagged as the *Critically Scarce Gender*.
- **Desperate Override:** When this happens, all eligible agents of the opposite gender become completely desperate. Their mate-seeking charge force is dampened when critically hungry (reduced by up to 60%) — because a dead agent can't reproduce.
- **Safe Regrouping:** If an agent is both desperate (tribe pop < 12) AND part of the scarce gender, they prioritize the **Tribe Capital** (safe home territory) instead of the Tree of Life (map center, likely in enemy territory). Agents only migrate to the center if their tribe is large enough to risk it.
- **Tribe Ceasefire:** If a desperate agent comes near a scarce gender member—*even if they belong to an enemy tribe*—war hostility is completely bypassed. They charge toward each other with a steering override force.
- **Guaranteed Procreation:** When they connect, they mate instantly with a 100% guaranteed success rate, completely ignoring any breeding cooldowns, tribe prejudices, and minimum stat preferences.
- **The "Romeo & Juliet" Buff:** Because this was a cross-tribe romance, the resulting child is born as a hybrid. Hybrids are granted an immense statistical advantage, inherently clamping their starting Strength and Intelligence between 90-100, and fully maximizing their Fighter trait.

## 7. Monster Mechanics
- **Spawning:** Monsters are Aberrant apex predators that occasionally spawn at the edges of the world.
- **Hunting and Combat:** Monsters actively hunt and devour human agents. **Interaction Buffer:** Monsters have a 5px interaction buffer beyond their physical radius to match their irregular, jagged visual shapes.
- **Heroic Survival:** Only the most elite agents (high Strength + high Intelligence) have a chance to survive a hit. This survival chance is **reduced by 15% for every additional monster** touching the agent (The Swarm) and up to **50% by combat weariness**.
- **Territorial Disputes:** Monsters are highly territorial. If two monsters cross paths, they will engage in a brutal Titan clash, dealing massive damage to one another until one or both are dead.

## 8. The Berserker Mechanic (Overcrowding & Stability)
Civilizations that become too successful often fall from within through a psychosis triggered by overcrowding.
- **Stress Accumulation:** When an agent is surrounded by more than 20 neighbors, they begin accumulating **Stress**.
- **Mental Resilience (Intelligence Link):** Intelligence acts as a social stabilizer. **Low-intelligence agents** suffer a breakdown up to **5x faster** than geniuses. A high-intelligence agent suppresses stress gain, while a low-intelligence agent gains up to +1.0 stress per tick.
- **The Snap:** If Stress exceeds 150 points, the agent goes **Berserk**.
- **Catastrophic Buffs:** To ensure the state is a civilization-level threat, Berserkers receive massive technical overrides:
  - **1.2x Max Speed:** They become slightly faster than sane agents but no longer impossible to outrun.
  - **1.5x interaction Radius:** Their "Attack Range" increases, making it harder to dodge them.
  - **5x Combat Power Multiplier:** They near-guaranteed kill any sane agent they touch.
  - **Weariness Immunity:** They never tire or exhaust during their rage.
- **Behavior:** Berserkers turn **Deep Purple** and ignore all tribal and gender rules, treating every living thing (including family) as a combat target with a **100% fight chance**.
- **Recovery:** If an agent leaves the crowd, they recover Stress at a rate of -1.0 per tick.

## 9. Civilization History & Evolution Graph
The simulation is no longer just a series of dots—it is a story with a visual lineage.
- **Milestones:** Significant events (First Blood, Plagues, Crashes) are recorded in a chronological "History Track".
- **Demographic Evolution Graph:** Every **5 years** (300 ticks), the simulation logs the current average Strength and Intelligence. Upon simulation end, these are rendered into a visual **Trend Chart**.
- **Genesis Snapshot:** A "Year 0" record is always preserved to ensure the graph shows the full evolutionary journey of the first settlers.
- **All-Time Records:** The archive preserves the strongest and most prolific heroes globally, ensuring their legacy persists even after total extinction.

## 10. Memory and Architecture
The engine uses a custom **Data-Oriented Web Worker** architecture. 
- **State Serialization:** Agent data is packed into a 10-float stride within a `Float32Array` for ultra-fast transfer between threads.
- **SharedArrayBuffer:** Physics and logic run at 60Hz in a worker, while the main thread handles rendering.
- **Persistence:** Statistics and milestones are preserved even after simulation threads are terminated, ensuring a persistent record of your world's rise and fall.

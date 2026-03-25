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
  - **Same Tribe, Opposite Gender:** Attraction depends heavily on their base `Libido`. **Strict Incest Avoidance:** Highly intelligent agents repel family members far more aggressively, utilizing memory to protect genetics.
- **Food Seeking:** If an agent's `Hunger` drops significantly, they will override social steering to aggressively track and move toward nearby food.

## 3. Conflict and War
- **Initiation:** Triggered predominantly when touching an opposing tribe member. Scuffles can also break out internally among the same tribe if both agents are highly aggressive.
  - **Diplomacy (De-escalation):** If an internal scuffle is about to occur between two tribemates, highly intelligent agents have a strong chance to culturally talk down the aggressor, peacefully pushing apart and neutralizing the fight before anyone is harmed.
- **Age Restriction:** Children (<12) are completely immune to, and incapable of, starting fights. Only Teens and Adults can fight.
- **Combat Resolution:** When a fight occurs, the victor is calculated via a weighted probability score: `Strength + (Intelligence * 0.5) + (Fighter * 0.3)`. The loser is marked for death immediately and turns into blood particles.

## 4. Reproduction and Life Cycles
- **Initiation:** Triggered when two opposite-gender adults (ages 18-49) collide. Both agents must pass each other's minimum preference checks (`prefMinStrength`, `prefMinIntelligence`, `prefPersonality`).
- **Preference Degradation:** As an agent remains single, their rigid partner preferences degrade. Lonely agents constantly lower their standards so they can eventually reproduce.
- **Mating:** If preferences are met, the probability of successful mating scales with their combined `Libido`. There is a small chance for triplets or twins. Parents then enter a temporary mating cooldown (customizable).
- **Genetics:** Offspring average their parents' stats with a sudden mutation variance (+/- 15%). Traits like `Charm`, `Libido`, and `Fighter` are also passed down or mutated randomly. 
- **Incest Penalties:** If agents share a direct parent or are deeply related, reproducing applies a massive 40% penalty to the child's core traits. However, if the tribe is critically underpopulated, agents will prioritize survival over genetics, bypassing the incest penalty entirely.

## 5. Epidemics and Starvation
- **The Plague:** Triggerable from the "God Toolbar", an infected agent glows green and acts as a carrier. Any interaction radius overlap with an infected agent spreads the plague instantly. Infected agents have a baseline random chance to drop dead every tick.
  - **Social Distancing:** Highly intelligent agents recognize the visual symptoms of the plague (the green glow) and will apply strong negative steering forces to actively run away from sick individuals.
- **Starvation:** If `ENABLE_HUNGER` is active, agents passively lose hunger points on every tick (Rate and Tolerance are customizable). If it reaches 0, they starve to death.
  - **Efficient Metabolism:** Intelligent agents know how to ration their energy. An agent with maximum intelligence passively starves 25% slower than lower-tier members.

## 6. The "Saviors" Mechanic (Extinction Prevention)
The simulation has an emergency failsafe to prevent total civilization collapse due to gender imbalances. 

- **Global Population Tracking:** The master worker loop constantly counts every male and female across both tribes.
- **Emergency Declaration:** If one gender makes up less than 25% of the total population (e.g., heavily imbalanced 80/20) OR if the flat count of that gender falls below 15 globally, they are flagged as the *Critically Scarce Gender*.
- **Desperate Override:** When this happens, all eligible agents of the opposite gender become completely desperate. 
- **World Capital Homing:** Because finding the scarce remaining genders purely by chance `AWARENESS_RADIUS` collision is difficult as the population drops, all agents actively seeking the scarce gender (along with the scarce gender themselves) will instinctually migrate towards the exact center of the map ("The Tree of Life") to maximize the odds of finding each other before the end of the world.
- **Tribe Ceasefire:** If a desperate agent comes near a scarce gender member—*even if they belong to an enemy tribe*—war hostility is completely bypassed. They aggressively charge toward each other with a massive 1.5x steering override force.
- **Guaranteed Procreation:** When they connect, they mate instantly with a 100% guaranteed success rate, completely ignoring any breeding cooldowns, tribe prejudices, and minimum stat preferences.
- **The "Romeo & Juliet" Buff:** Because this was a cross-tribe romance, the resulting child is born as a hybrid. Hybrids are granted an immense statistical advantage, inherently clamping their starting Strength and Intelligence between 90-100, and fully maximizing their Fighter trait.

## 7. Monster Mechanics
- **Spawning:** Monsters are Aberrant apex predators that occasionally spawn at the edges of the world (Spawn Interval is customizable).
- **Hunting and Combat:** Monsters actively hunt and devour human agents (Monster Speed and Awareness are customizable). When caught, regular humans are instantly killed unless they are incredibly strong and intelligent, in which case they have a chance to heroically strike back, surviving the encounter or even slaying the monster.
- **Territorial Disputes:** Monsters are highly territorial. If two monsters cross paths, they will engage in a brutal Titan clash (Monster Fights), dealing massive damage to one another until one or both are dead.
- **Devouring & Starvation:** Monsters have enormous hunger capacities. Devouring humans provides them with massive nutritional sustenance. If they fail to catch prey, they will eventually starve and die.
- **Aberrant Mating (Rare):** Very rarely (15% chance), a monster may spare an adult female and reproduce, spawning a new monster offspring (Monster Births) with extreme base stats derived from both parents.

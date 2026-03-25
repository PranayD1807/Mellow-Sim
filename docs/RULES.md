# Sim Simulator: Core Rules & Mechanics

## 1. Overview
The **Sim Simulator** is a lightweight, cross-platform simulation game that operates entirely locally. It simulates an environment where simple, autonomous agents interact with each other. These interactions are fundamentally driven by probabilities, which are profoundly influenced by each agent's unique individual attributes, personality, and drives.

## 2. Agent Attributes

### 2.1. Core Stats
*   **Gender**: Either Male or Female.
*   **Strength**: A numeric stat (1–100) representing physical power.
*   **Intelligence**: A numeric stat (1–100) representing mental capability.
*   **Position**: (X, Y) coordinates within the simulation world.

### 2.2. Personality
*   **Introvert / Extrovert**: Determines social steering behavior.
    *   **Introverts** will steer *away* from all nearby agents.
    *   **Extroverts** will steer *toward* nearby agents.

### 2.3. Drives (0–100 each)
*   **Libido**: How strongly the agent seeks opposite-gender agents for mating. High libido → actively seeks mates. Low libido → avoids opposite gender.
*   **Fighter**: How aggressively the agent seeks same-gender agents for combat. High fighter → actively seeks fights. Low fighter → avoids same-gender encounters.
*   **Charm**: A passive attractiveness stat. When a potential partner doesn't fully meet an agent's preferences, the partner's charm can compensate and still make the match viable.

### 2.4. Partner Preferences
Each agent has internal preferences for what they want in a mate:
*   **Minimum Strength**: e.g., "wants partner with STR ≥ 30"
*   **Minimum Intelligence**: e.g., "wants partner with INT ≥ 25"
*   **Preferred Personality**: Some agents prefer Introverts, some prefer Extroverts, some have no preference (`null` = "Any").

#### Preference Degradation
If an agent goes a long time without successfully mating, their requirements **gradually lower** over time. These values are **customizable** in the World Settings:
*   Every `PREF_DEGRADE_INTERVAL` ticks (default: 150), minimum strength and intelligence requirements decrease.
*   The speed at which standards drop can be adjusted via the **Standards Drop Gap** setting.
*   After being lonely for a very long time, the agent stops caring about personality type entirely.
*   Requirements reset when the agent successfully mates.

## 3. Steering & Movement
Agents don't just drift randomly — they exhibit behavioral steering based on their personality and drives:

1.  **Personality-based force**: Introverts repel from all nearby agents. Extroverts are drawn toward them.
2.  **Libido-based force**: High-libido agents steer toward opposite-gender agents. Low-libido agents steer away.
3.  **Fighter-based force**: High-fighter agents steer toward same-gender agents. Low-fighter agents steer away.
4.  **Random drift**: A small amount of noise is applied to prevent perfectly predictable paths.
5.  **Needs-based overrides**: Hunger forces tracking food, while encountering the plague, or entering an extinction-level population event, forces massive homing steering toward Tribe/World Capitals.
6.  **Speed clamping**: Agents cannot exceed `MAX_SPEED` (customizable) and have a minimum speed floor to prevent stalling.

Steering is computed within an `AWARENESS_RADIUS` (customizable) — agents can only "sense" others within this range.

## 4. Core Interactions
When two agents are within `INTERACTION_RADIUS` (customizable), an interaction is triggered.

### 4.1. Conflict (Same Gender Interaction)
When two agents of the **same gender** meet:
*   **Fight probability** depends on both agents' `fighter` trait. The average fighter score determines how likely a fight actually happens (~5%–85% range).
*   If no fight occurs, both agents simply bounce away from each other.
*   If a fight occurs:
    *   **Result**: One agent is killed and removed.
    *   **Win probability**: Based on combined score of `strength + intelligence × 0.5 + fighter × 0.3`.
    *   The loser is marked for death with red particle effects.

### 4.2. Reproduction (Different Gender Interaction)
When two agents of **different genders** meet:
1.  **Cooldown check**: Both agents must not be on reproduction cooldown.
2.  **Mutual preference check**: Both agents evaluate each other against their personal preferences (min strength, min intelligence, preferred personality). The partner's **charm** can compensate for shortfalls.
3.  **Reproduction roll**: If both accept, a probability roll is made based on their average libido.
4.  **Offspring count** (0–2, weighted probabilities):
    *   2% chance of 0 offspring
    *   73% chance of 1 offspring
    *   25% chance of 2 offspring (twins)
5.  **Inheritance**: Children inherit averaged stats from both parents with mutation. **Incest** dramatically lowers output stats unless the tribe is desperate. **Cross-Tribe Romeo & Juliet mating** massively boosts the child's genetic ceiling.
6.  Both parents enter a reproduction cooldown period (**Repro Cooldown** setting).

## 5. Monster Interactions
*   **Apex Predators**: Monsters target the nearest human within their massive awareness radius.
*   **Devouring**: When a Monster catches a human, the human is typically instantly killed.
    *   **Heroic Survival**: Very strong and intelligent humans have a small percentage chance to survive the blow and knock the monster back.
    *   **Heroic Slaying**: If a human deals enough damage to deplete the monster's HP, they heroically slay the beast.
*   **Monster vs Monster**: Monsters are inherently territorial. If two monsters collide, they deal damage to each other and violently push apart (recorded in UI as **Monster Fights**).
*   **Aberrant Reproduction**: There is a chance (randomized but influenced by stats) when a monster encounters an adult female human that it will spare her and reproduce instead, spawning a new monster with combined extreme stats (recorded in UI as **Monster Births**).
*   **Customization**: Monster speed, awareness, and spawn interval are all adjustable in the World Settings.

## 6. Design Guidelines for Expansion
*   **Simplicity**: The game is designed to be straightforward. Future systems (e.g. food, age, disease, alliances) should plug into this base without convoluting the core loop.
*   **Clean Code**: Emphasize readability, modularity, and explicit state management.
*   **Performance**: Optimize proximity checks (e.g., spatial partitioning) if population scales up.

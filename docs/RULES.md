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
If an agent goes a long time without successfully mating, their requirements **gradually lower** over time:
*   Every `PREF_DEGRADE_INTERVAL` ticks (default: 300), minimum strength and intelligence requirements decrease by `PREF_DEGRADE_AMOUNT` (default: 3).
*   After being lonely for a very long time (5× the interval), the agent stops caring about personality type entirely.
*   Requirements reset when the agent successfully mates.

## 3. Steering & Movement
Agents don't just drift randomly — they exhibit behavioral steering based on their personality and drives:

1.  **Personality-based force**: Introverts repel from all nearby agents. Extroverts are drawn toward them.
2.  **Libido-based force**: High-libido agents steer toward opposite-gender agents. Low-libido agents steer away.
3.  **Fighter-based force**: High-fighter agents steer toward same-gender agents. Low-fighter agents steer away.
4.  **Random drift**: A small amount of noise is applied to prevent perfectly predictable paths.
5.  **Speed clamping**: Agents cannot exceed `MAX_SPEED` and have a minimum speed floor to prevent stalling.

Steering is computed within an `AWARENESS_RADIUS` (default: 80px) — agents can only "sense" others within this range.

## 4. Core Interactions
When two agents are within `INTERACTION_RADIUS` (default: 14px), an interaction is triggered.

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
4.  **Offspring count** (0–3, weighted):
    *   10% chance of 0 offspring
    *   40% chance of 1 offspring
    *   35% chance of 2 offspring
    *   15% chance of 3 offspring
5.  **Inheritance**: Children inherit averaged stats from both parents with mutation. Personality traits are inherited with a 30% chance of random mutation.
6.  Both parents enter a reproduction cooldown period.

## 5. Design Guidelines for Expansion
*   **Simplicity**: The game is designed to be straightforward. Future systems (e.g. food, age, disease, alliances) should plug into this base without convoluting the core loop.
*   **Clean Code**: Emphasize readability, modularity, and explicit state management.
*   **Performance**: Optimize proximity checks (e.g., spatial partitioning) if population scales up.

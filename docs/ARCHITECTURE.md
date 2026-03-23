# Sim Simulator: Architecture & Technical Design

## 1. Tech Stack Overview
To ensure the game is lightweight, easily readable, cross-platform, and runs entirely locally, we will use modern Web Technologies:
*   **Core Logic & Rendering**: Vanilla JavaScript (ES6 Modules) and the HTML5 `<canvas>` API for rendering. This removes the need for heavy game engines and ensures an ultra-lite footprint.
*   **Styling**: Vanilla CSS for GUI and styling.
*   **Build Tool (Optional but Recommended)**: Vite to easily serve the app locally during development and bundle it for any platform (can later be wrapped with Electron or Tauri if a native desktop executable is desired, though a browser is perfectly cross-platform).

## 2. System Architecture

The codebase will be split into logical components to ensure it is very easy to read and expand:

### 2.1. `Agent` Class
*   **State**: `id`, `x`, `y`, `gender`, `strength`, `intelligence`, `color`, `velocity`.
*   **Behavior**: Contains methods for movement (`updatePosition`), drawing (`draw`), and returning its stats.

### 2.2. `Simulation Core` (Game Loop)
*   Responsible for the `requestAnimationFrame` loop.
*   Holds the array of all active `Agent` entities.
*   **Tick Flow**:
    1.  Update all agents' positions (e.g., random walk or basic steering).
    2.  Check for collisions / proximity between distinct agents.
    3.  Resolve interactions (Conflict or Reproduction).
    4.  Clear canvas and redraw all entities.

### 2.3. `Interaction Manager`
*   A dedicated module/class that handles the logic of what happens when Agent A and Agent B meet.
*   This isolates the "rules" of the game from the rendering and state management.
*   **Methods**:
    *   `evaluateInteraction(agentA, agentB)`: Determines gender match.
    *   `resolveConflict(agentA, agentB)`: Calculates probabilities and returns the surviving agent.
    *   `resolveReproduction(agentA, agentB)`: Calculates compatibility and returns an array of new offspring (0, 1, or 2 newly initialized `Agent` instances).

## 3. Directory Structure
```text
sim-simulator/
│
├── docs/
│   ├── RULES.md              # Game mechanics and rules
│   └── ARCHITECTURE.md       # Tech stack and system design
│
├── src/
│   ├── main.js               # Entry point and Game Loop
│   ├── Agent.js              # Agent entity class
│   ├── InteractionManager.js # Logic for conflict and reproduction
│   └── utils.js              # Helper math and probability functions
│
├── index.html                # Main markup and canvas container
└── style.css                 # Basic styling for the canvas and UI
```

## 4. Expansion & Modularity
By separating the `InteractionManager` from the `Agent` and the `Game Loop`, adding new interactions (e.g., Food, Trading) becomes as simple as updating the `evaluateInteraction` method and adding new state variables to the `Agent` class, strictly adhering to the "easy to read and expand" requirement.

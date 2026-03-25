# Sim Simulator: Architecture & Technical Design

## 1. Tech Stack Overview
To ensure the game is lightweight, easily readable, cross-platform, and runs entirely locally, we will use modern Web Technologies:
*   **Core Logic & Rendering**: Vanilla JavaScript (ES6 Modules) and the HTML5 `<canvas>` API for rendering. A dedicated **Web Worker** runs the core simulation to offload computationally heavy calculations.
*   **Data Structures**: Data-Oriented Design employing `Float32Array` buffers to pass render state seamlessly between the worker and the main thread.
*   **Styling**: Vanilla CSS for GUI and styling.
*   **Build Tool (Optional but Recommended)**: Vite to easily serve the app locally during development and bundle it for any platform (can later be wrapped with Electron or Tauri if a native desktop executable is desired, though a browser is perfectly cross-platform).

## 2. System Architecture

The codebase will be split into logical components to ensure it is very easy to read and expand:

### 2.1. `Agent` Class
*   **State**: `id`, `x`, `y`, `gender`, `strength`, `intelligence`, `color`, `velocity`.
*   **Behavior**: Contains methods for movement (`updatePosition`), drawing (`draw`), and returning its stats.

### 2.2. `Simulation Core` (Game Loop / Web Worker)
*   The fundamental physics and agent AI loops operate entirely inside a background Web Worker (`worker.js`), ensuring main thread UI and rendering never lag.
*   Employs a **Spatial Hash Grid** to reduce entity collision checks from O(N²) to O(N).
*   **Tick Flow**:
    1.  Build the Spatial Hash Grid.
    2.  Calculate advanced multi-weighted steering (Awareness, Hunger, Plague Avoidance, Tribe/World Capital homing).
    3.  Check for interactions (Conflict, Reproduction, Infection transmission).
    4.  Pack all state (X, Y, Radius, Color, ID) into efficient `Float32Array` buffers.
    5.  `postMessage` the buffers back to `SimulationEngine.js` for rapid `<canvas>` rendering.

### 2.3. `Interaction Manager`
*   A dedicated module/class that handles the logic of what happens when Agent A and Agent B meet.
*   This isolates the "rules" of the game from the rendering and state management.
*   **Methods**:
    *   `evaluateInteraction(agentA, agentB)`: Determines gender match.
    *   `resolveConflict(agentA, agentB)`: Calculates probabilities and returns the surviving agent.
    *   `resolveReproduction(agentA, agentB)`: Calculates compatibility and returns an array of new offspring (0, 1, or 2 newly initialized `Agent` instances).

### 2.4. Configuration Sync
*   The simulation supports real-time configuration updates.
*   When a user changes a setting in the GUI (`index.html`), the `SimulationEngine` updates its local `CONFIG` object and sends a `postMessage` with the new key-value pair to the Web Worker.
*   The Worker updates its internal `CONFIG` state immediately, affecting subsequent simulation ticks without requiring a restart.

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

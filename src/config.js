export const CONFIG = {
    INITIAL_RED_MALES: 15,
    INITIAL_RED_FEMALES: 15,
    INITIAL_BLUE_MALES: 15,
    INITIAL_BLUE_FEMALES: 15,
    AGENT_RADIUS: 15,
    SPRITE_SIZE: 15,            // Rendered size of sprite images (width & height)
    MAX_FOOD: 250,              // limit max food on screen
    FOOD_NUTRITION: 1500,
    MAX_HUNGER: 3000,           // How long an agent can survive without food
    STARVATION_RATE: 1,         // Hunger lost per tick
    INTERACTION_RADIUS: 25,
    AWARENESS_RADIUS: 200,
    MAX_SPEED: 0.5,
    REPRODUCTION_COOLDOWN: 100, // Recover faster after having a child
    MUTATION_RATE: 0.15,
    MAX_POPULATION: 300,
    BG_COLOR: '#0f172a',

    // Monsters
    ENABLE_MONSTERS: true,
    INITIAL_MONSTERS: 2,
    MONSTER_RADIUS: 25,
    MONSTER_SPEED: 0.45,
    MONSTER_AWARENESS: 600,
    MONSTER_SPAWN_INTERVAL: 1800, // E.g., spawn a new monster every 30 years (1800 ticks at 60tpy)

    // Mechanisms
    ENABLE_FIGHTING: true,
    ENABLE_REPRODUCTION: true,
    ENABLE_AGING: true,
    ENABLE_INCEST_PENALTY: true,
    ENABLE_PREF_DEGRADE: true,
    ENABLE_MAX_POPULATION: true,
    ENABLE_HUNGER: true,
    ENABLE_TRIBES: true,
    ENABLE_SHOW_AWARENESS: true,
    ENABLE_SHOW_INTERACTION: false,
    ENABLE_COMBAT_WEARINESS: true,

    // Combat Weariness
    WEARINESS_MAX: 100,
    WEARINESS_KILL_BASE: 12,        // Base weariness gained per kill
    WEARINESS_TEEN_MULT: 0.4,       // Teens gain 40% of base (resilient)
    WEARINESS_ADULT_MULT: 1.0,      // Adults gain 100%
    WEARINESS_ELDER_MULT: 2.0,      // Elders gain 200% (fragile)
    WEARINESS_RECOVERY_TEEN: 0.08,  // Recovery per tick (teens bounce back fast)
    WEARINESS_RECOVERY_ADULT: 0.04, // Adults recover at moderate pace
    WEARINESS_RECOVERY_ELDER: 0.015,// Elders recover very slowly
    WEARINESS_FED_BONUS: 1.5,       // Recovery multiplier when well-fed (hunger > 70%)
    WEARINESS_DEATH_THRESHOLD: 90,  // Above this, small chance of dying from exhaustion
    WEARINESS_DEATH_CHANCE: 0.003,  // Per-tick death chance when above threshold

    // Steering
    STEER_STRENGTH: 0.04,
    FOOD_ATTRACTION: 0.15,

    // Preference degradation
    PREF_DEGRADE_INTERVAL: 150, // Agents lower their standards twice as fast if lonely
    PREF_DEGRADE_AMOUNT: 3,

    // Aging
    TICKS_PER_YEAR: 60,         // 60 ticks ≈ 1 second at 60fps = 1 year
    MAX_AGE: 75,                // Die of old age
    INITIAL_MIN_AGE: 18,        // Initial agents spawn at age 18-30
    INITIAL_MAX_AGE: 30,
    CHILD_AGE: 12,              // 0-11: child (no fight, no repro, can be killed)
    TEEN_AGE: 18,               // 12-17: teen (can fight, no repro)
    ELDER_AGE: 60,              // 50+: elder (can fight, no repro)
};

export const GENDER = {
    MALE: 'Male',
    FEMALE: 'Female'
};

export const TRIBE = {
    RED: 'Red',
    BLUE: 'Blue'
};

export const TRIBE_COLORS = {
    [TRIBE.RED]: '#ef4444',
    [TRIBE.BLUE]: '#3b82f6'
};

export const GENDER_COLORS = {
    [GENDER.MALE]: '#60a5fa',
    [GENDER.FEMALE]: '#f472b6'
};

export const PERSONALITY = {
    INTROVERT: 'Introvert',
    EXTROVERT: 'Extrovert'
};

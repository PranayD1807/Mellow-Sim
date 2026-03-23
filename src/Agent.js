import { Entity } from './Entity.js?v=123456';
import { CONFIG, GENDER, GENDER_COLORS, PERSONALITY, TRIBE, TRIBE_COLORS } from './config.js?v=123456';
import { rand, randInt, generateId, generateName } from './utils.js?v=123456';

export class Agent extends Entity {
    /**
     * @param {number} x
     * @param {number} y
     * @param {string|null} gender
     * @param {number|null} strength
     * @param {number|null} intelligence
     * @param {object|null} traits - personality traits object
     * @param {number} birthTick - world tick this agent was born on
     * @param {number|null} forcedAge - for initial agents, force a starting age (in years)
     */
    constructor(x, y, gender = null, strength = null, intelligence = null, traits = null, birthTick = 0, forcedAge = null, parents = [], bornOfIncest = false, tribe = null) {
        super(x, y);
        this.id = generateId();
        this.parents = parents;
        this.bornOfIncest = bornOfIncest;
        this.offspringCount = 0;
        this.tribe = tribe || Object.values(TRIBE)[randInt(0, Object.values(TRIBE).length)];
        this.hunger = randInt(CONFIG.MAX_HUNGER * 0.5, CONFIG.MAX_HUNGER);
        this.isInfected = false;
        this.gender = gender || (Math.random() > 0.5 ? GENDER.MALE : GENDER.FEMALE);
        this.name = generateName(this.gender);
        this.strength = strength || randInt(1, 100);
        this.intelligence = intelligence || randInt(1, 100);

        // Age tracking
        this.birthTick = birthTick;
        if (forcedAge !== null) {
            // Backdate birthTick so getAge() returns the forced age
            this.birthTick = birthTick - (forcedAge * CONFIG.TICKS_PER_YEAR);
        }

        // --- Personality traits ---
        if (traits) {
            this.personality = traits.personality;
            this.libido = traits.libido;
            this.fighter = traits.fighter;
            this.charm = traits.charm;
            this.prefMinStrength = traits.prefMinStrength;
            this.prefMinIntelligence = traits.prefMinIntelligence;
            this.prefPersonality = traits.prefPersonality;
        } else {
            this.personality = Math.random() > 0.5 ? PERSONALITY.EXTROVERT : PERSONALITY.INTROVERT;
            this.libido = randInt(10, 90);
            this.fighter = randInt(5, 80);
            this.charm = randInt(10, 90);
            this.prefMinStrength = randInt(10, 50);
            this.prefMinIntelligence = randInt(10, 50);
            this.prefPersonality = Math.random() < 0.3 ? null : (Math.random() > 0.5 ? PERSONALITY.EXTROVERT : PERSONALITY.INTROVERT);
        }

        this.ticksSinceLastMate = 0;

        // Initial random vector
        const angle = rand(0, Math.PI * 2);
        const baseSpeed = rand(0.2, CONFIG.MAX_SPEED);
        this.vx = Math.cos(angle) * baseSpeed;
        this.vy = Math.sin(angle) * baseSpeed;

        this.radius = CONFIG.AGENT_RADIUS;
        this.cooldown = 0;
        this.markedForDeath = false;
    }

    /**
     * Calculate age in years from world tick
     */
    getAge(worldTick) {
        return Math.floor((worldTick - this.birthTick) / CONFIG.TICKS_PER_YEAR);
    }

    /**
     * Smarter agents stay aware in a wider radius
     */
    get dynamicAwarenessRadius() {
        return CONFIG.AWARENESS_RADIUS * (1 + (this.intelligence / 200));
    }

    /**
     * Get the life stage label
     */
    getLifeStage(worldTick) {
        const age = this.getAge(worldTick);
        if (age < CONFIG.CHILD_AGE) return 'Child';
        if (age < CONFIG.TEEN_AGE) return 'Teen';
        if (age < CONFIG.ELDER_AGE) return 'Adult';
        return 'Elder';
    }

    isChild(worldTick) { return this.getAge(worldTick) < CONFIG.CHILD_AGE; }
    isTeen(worldTick) { const a = this.getAge(worldTick); return a >= CONFIG.CHILD_AGE && a < CONFIG.TEEN_AGE; }
    isAdult(worldTick) { const a = this.getAge(worldTick); return a >= CONFIG.TEEN_AGE && a < CONFIG.ELDER_AGE; }
    isElder(worldTick) { return this.getAge(worldTick) >= CONFIG.ELDER_AGE; }

    canFight(worldTick) {
        // Children (< 12) cannot initiate fights
        return this.getAge(worldTick) >= CONFIG.CHILD_AGE;
    }

    canReproduce(worldTick) {
        // Females 18-49, Males 18+
        const age = this.getAge(worldTick);
        if (this.gender === GENDER.MALE) {
            return age >= CONFIG.TEEN_AGE;
        }
        return age >= CONFIG.TEEN_AGE && age < CONFIG.ELDER_AGE;
    }

    isRelated(other) {
        if (!this.parents || !other.parents) return false;

        // Sibling check (half-siblings included)
        const sharedParent = this.parents.some(pid => pid && other.parents.includes(pid));
        // Parent-Child check
        const parentChild = this.parents.includes(other.id) || other.parents.includes(this.id);

        return sharedParent || parentChild;
    }

    /**
     * Degrade partner preferences over time if no mate found.
     */
    degradePreferences(worldTick) {
        if (!CONFIG.ENABLE_PREF_DEGRADE) return;
        if (!this.canReproduce(worldTick)) return; // Do not reduce preferences for children / invalid age demographic

        if (this.cooldown > 0) {
            this.ticksSinceLastMate = 0;
            return;
        }
        this.ticksSinceLastMate++;

        if (this.ticksSinceLastMate > 0 && this.ticksSinceLastMate % CONFIG.PREF_DEGRADE_INTERVAL === 0) {
            this.prefMinStrength = Math.max(0, this.prefMinStrength - CONFIG.PREF_DEGRADE_AMOUNT);
            this.prefMinIntelligence = Math.max(0, this.prefMinIntelligence - CONFIG.PREF_DEGRADE_AMOUNT);
            if (this.ticksSinceLastMate > CONFIG.PREF_DEGRADE_INTERVAL * 5) {
                this.prefPersonality = null;
            }
        }
    }

    /**
     * Steering: apply forces toward or away from nearby agents and food.
     */
    steer(nearbyAgents, nearbyFood = []) {
        let steerX = 0;
        let steerY = 0;

        // ------------------------------------
        // Home Post / Tribe Capital Mechanic
        // ------------------------------------
        if (this.mapWidth && this.mapHeight) {
            if (this.seeksScarceGender || this.isScarceGender) {
                // End of the world: Everyone heads to the Tree of Life (Center of map) to find each other!
                const targetX = this.mapWidth / 2;
                const targetY = this.mapHeight / 2;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 20) {
                   steerX += (dx / dist) * 0.6 * CONFIG.STEER_STRENGTH;
                   steerY += (dy / dist) * 0.6 * CONFIG.STEER_STRENGTH;
                }
            } else if (this.isDesperate) {
                // Tribe is dying out: Head to Tribe Capital (Red = Left, Blue = Right) to regroup
                const isRed = this.tribe === 'Red';
                const targetX = isRed ? this.mapWidth * 0.2 : this.mapWidth * 0.8;
                const targetY = this.mapHeight / 2;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 20) {
                   steerX += (dx / dist) * 0.6 * CONFIG.STEER_STRENGTH;
                   steerY += (dy / dist) * 0.6 * CONFIG.STEER_STRENGTH;
                }
            }
        }

        if (CONFIG.ENABLE_HUNGER && this.hunger < CONFIG.MAX_HUNGER * 0.7 && nearbyFood.length > 0) {
            let closestFood = null;
            let minDist = Infinity;
            for (const f of nearbyFood) {
                const d = Math.hypot(f.x - this.x, f.y - this.y);
                if (d < minDist) { minDist = d; closestFood = f; }
            }
            if (closestFood) {
                const dx = closestFood.x - this.x;
                const dy = closestFood.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    steerX += (dx / dist) * CONFIG.FOOD_ATTRACTION;
                    steerY += (dy / dist) * CONFIG.FOOD_ATTRACTION;
                }
            }
        }

        for (const other of nearbyAgents) {
            if (other.id === this.id || other.markedForDeath) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1 || dist > this.dynamicAwarenessRadius) continue;

            const nx = dx / dist;
            const ny = dy / dist;

            const isSameGender = this.gender === other.gender;
            const isSameTribe = !CONFIG.ENABLE_TRIBES || this.tribe === other.tribe;
            const isDesperateRepro = !isSameGender && ((this.seeksScarceGender && other.isScarceGender) || (other.seeksScarceGender && this.isScarceGender));

            if (isDesperateRepro) {
                // Overriding all logic: charge toward potential mate to save the civilization!
                steerX += nx * 1.5 * CONFIG.STEER_STRENGTH;
                steerY += ny * 1.5 * CONFIG.STEER_STRENGTH;
            } else if (other.isInfected) {
                // Plague "Social Distancing": Smart agents actively run away from green sick agents
                const fleeUrge = Math.max(0, (this.intelligence - 50) / 50); // scales from 0 (at 50 int) to 1.0 (at 100 int)
                if (fleeUrge > 0) {
                    steerX -= nx * fleeUrge * CONFIG.STEER_STRENGTH * 1.5;
                    steerY -= ny * fleeUrge * CONFIG.STEER_STRENGTH * 1.5;
                }
            } else if (!isSameTribe) {
                // Inter-tribe encounters: Aggressive agents charge, cowardly agents flee
                let fightUrge = (this.fighter - 40) / 40; // High fighter (>40) will charge aggressively, Low fighter will scatter
                
                // Survival Instinct: If outmatched and intelligent, override anger and flee instead!
                if (this.intelligence > 60 && this.strength < other.strength + 15) {
                    fightUrge = -1.0; 
                }

                steerX += nx * fightUrge * CONFIG.STEER_STRENGTH;
                steerY += ny * fightUrge * CONFIG.STEER_STRENGTH;
            } else if (isSameGender) {
                // Same tribe, same gender: slightly spread out to avoid blobbing up,
                // BUT if the tribe is desperate or the agent is weak, clump together for protection!
                let cohesion = -0.3; // Spread out normally
                if (this.isDesperate || this.strength < 40) cohesion = 0.5; // flock together!
                steerX += nx * cohesion * CONFIG.STEER_STRENGTH;
                steerY += ny * cohesion * CONFIG.STEER_STRENGTH;
            } else {
                // Same tribe, opposite gender: seek mate based on libido
                let mateUrge = (this.libido - 30) / 100;
                if (CONFIG.ENABLE_INCEST_PENALTY && this.isRelated(other)) {
                    // Flee from siblings normally, but interbreed if the tribe is desperate!
                    // Smart agents actively avoid incest much harder to protect genetics.
                    const incestRepulsion = -2.0 - (this.intelligence / 25);
                    mateUrge = this.isDesperate ? Math.max(0, mateUrge) : incestRepulsion;
                }
                steerX += nx * mateUrge * CONFIG.STEER_STRENGTH;
                steerY += ny * mateUrge * CONFIG.STEER_STRENGTH;
            }

            const socialForce = this.personality === PERSONALITY.INTROVERT ? -0.15 : 0.1;
            steerX += nx * socialForce * CONFIG.STEER_STRENGTH;
            steerY += ny * socialForce * CONFIG.STEER_STRENGTH;
        }

        this.vx += steerX;
        this.vy += steerY;

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > CONFIG.MAX_SPEED) {
            this.vx = (this.vx / speed) * CONFIG.MAX_SPEED;
            this.vy = (this.vy / speed) * CONFIG.MAX_SPEED;
        }
        if (speed < 0.1) {
            const angle = rand(0, Math.PI * 2);
            this.vx = Math.cos(angle) * 0.15;
            this.vy = Math.sin(angle) * 0.15;
        }
    }

    update(width, height, worldTick) {
        const age = this.getAge(worldTick);
        if (age < CONFIG.CHILD_AGE) {
            this.radius = Math.max(5, (age / CONFIG.CHILD_AGE) * CONFIG.AGENT_RADIUS);
        } else if (age < CONFIG.TEEN_AGE) {
            this.radius = CONFIG.AGENT_RADIUS * 0.8;
        } else {
            this.radius = CONFIG.AGENT_RADIUS;
        }

        if (CONFIG.ENABLE_AGING && this.isElder(worldTick) && this.gender !== GENDER.MALE) {
            this.libido = Math.max(0, this.libido - 1);
        }

        if (CONFIG.ENABLE_HUNGER) {
            const intFactor = 1 - (this.intelligence / 400); // 0.75x to 1x metabolism
            this.hunger -= (CONFIG.STARVATION_RATE * intFactor);
            if (this.hunger <= 0) {
                this.markedForDeath = true;
                this.deathReason = 'starvation';
            }
        }
        if (this.isInfected) {
            if (Math.random() < 0.002) {
                this.markedForDeath = true;
                this.deathReason = 'plague';
            }
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x - this.radius < 0 || this.x + this.radius > width) {
            this.vx *= -1;
            this.x = Math.max(this.radius, Math.min(this.x, width - this.radius));
        }

        if (this.y - this.radius < 0 || this.y + this.radius > height) {
            this.vy *= -1;
            this.y = Math.max(this.radius, Math.min(this.y, height - this.radius));
        }

        if (Math.random() < 0.03) {
            const angle = Math.atan2(this.vy, this.vx) + rand(-0.3, 0.3);
            const speed = Math.hypot(this.vx, this.vy);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        if (this.cooldown > 0) this.cooldown--;
        this.degradePreferences(worldTick);
    }

    /**
     * Draw agent as a shape: square for male, triangle for female.
     * With tribe-based colors.
     */
    draw(ctx) {
        // Obsolete in data-oriented structure, handled by worker buffer now.
    }
}

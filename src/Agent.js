import { Entity } from './Entity.js?v=123456';
import { CONFIG, GENDER, GENDER_COLORS, PERSONALITY, TRIBE, TRIBE_COLORS } from './config.js?v=123456';
import { rand, randInt, generateId, generateName, clamp } from './utils.js?v=123456';

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

        // --- Overcrowding & Berserk Mechanism ---
        this.isBerserk = false;
        this.stressLevel = 0;
        this.berserkTicks = 0;

        // Initial random vector
        const angle = rand(0, Math.PI * 2);
        const baseSpeed = rand(0.2, CONFIG.MAX_SPEED);
        this.vx = Math.cos(angle) * baseSpeed;
        this.vy = Math.sin(angle) * baseSpeed;

        this.radius = CONFIG.AGENT_RADIUS;
        this.cooldown = 0;
        this.markedForDeath = false;
        this.weariness = 0; // Combat weariness: 0 = fresh, 100 = exhausted
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
     * Get weariness gain multiplier based on age.
     * Teens are resilient, elders are fragile.
     */
    getWearinessAgeMult(worldTick) {
        const age = this.getAge(worldTick);
        if (age < CONFIG.TEEN_AGE) return CONFIG.WEARINESS_TEEN_MULT;
        if (age < CONFIG.ELDER_AGE) return CONFIG.WEARINESS_ADULT_MULT;
        return CONFIG.WEARINESS_ELDER_MULT;
    }

    /**
     * Get weariness recovery rate based on age.
     * Teens bounce back fast, elders recover slowly.
     */
    getWearinessRecoveryRate(worldTick) {
        const age = this.getAge(worldTick);
        if (age < CONFIG.TEEN_AGE) return CONFIG.WEARINESS_RECOVERY_TEEN;
        if (age < CONFIG.ELDER_AGE) return CONFIG.WEARINESS_RECOVERY_ADULT;
        return CONFIG.WEARINESS_RECOVERY_ELDER;
    }

    /**
     * Add weariness from a kill. Age-dependent.
     */
    addKillWeariness(worldTick) {
        if (!CONFIG.ENABLE_COMBAT_WEARINESS) return;
        const mult = this.getWearinessAgeMult(worldTick);
        this.weariness = Math.min(CONFIG.WEARINESS_MAX, this.weariness + CONFIG.WEARINESS_KILL_BASE * mult);
    }

    /**
     * Recover weariness each tick. Faster when young and well-fed.
     */
    recoverWeariness(worldTick) {
        if (!CONFIG.ENABLE_COMBAT_WEARINESS || this.weariness <= 0) return;
        let rate = this.getWearinessRecoveryRate(worldTick);
        // Well-fed agents recover faster
        if (CONFIG.ENABLE_HUNGER && this.hunger > CONFIG.MAX_HUNGER * 0.7) {
            rate *= CONFIG.WEARINESS_FED_BONUS;
        }
        this.weariness = Math.max(0, this.weariness - rate);
    }

    /**
     * Steering: apply forces toward or away from nearby agents and food.
     */
    steer(nearbyAgents, nearbyFood = [], nearbyMonsters = []) {
        let steerX = 0;
        let steerY = 0;

        // ------------------------------------
        // FEAR: Evade Monsters (Highest Priority)
        // ------------------------------------
        let closestMonster = null;
        let minMonsterDist = Infinity;
        for (const m of nearbyMonsters) {
            const mDist = Math.hypot(this.x - m.x, this.y - m.y);
            if (mDist < minMonsterDist && mDist < this.dynamicAwarenessRadius * 1.5) {
                minMonsterDist = mDist;
                closestMonster = m;
            }
        }

        let isPanicked = false;
        let isHuntingMonster = false;
        if (closestMonster) {
            // Fix: Hero check now considers hunger! Only healthy heroes hunt; starving ones prioritize food.
            const isHungryHero = CONFIG.ENABLE_HUNGER && this.hunger < CONFIG.MAX_HUNGER * 0.4;
            if (this.strength > 75 && this.fighter > 60 && !isHungryHero) {
                isHuntingMonster = true;
                const dx = closestMonster.x - this.x;
                const dy = closestMonster.y - this.y;
                if (minMonsterDist > 0) {
                    steerX += (dx / minMonsterDist) * 2.5 * CONFIG.STEER_STRENGTH;
                    steerY += (dy / minMonsterDist) * 2.5 * CONFIG.STEER_STRENGTH;
                }
            } else {
                isPanicked = true;
                // Panic run! Flee directly away from the monster.
                const dx = this.x - closestMonster.x;
                const dy = this.y - closestMonster.y;

                // Fix: Fear dampening applies here too. Starving agents take more risks near monsters.
                const hungerRatio = CONFIG.ENABLE_HUNGER ? (1 - this.hunger / CONFIG.MAX_HUNGER) : 0;
                const hungerUrgencySq = Math.pow(Math.max(0, Math.min(1, (hungerRatio - 0.3) / 0.7)), 2);
                const fearDampening = 1 - hungerUrgencySq * 0.7;

                if (minMonsterDist > 0) {
                    steerX += (dx / minMonsterDist) * 3.5 * CONFIG.STEER_STRENGTH * fearDampening;
                    steerY += (dy / minMonsterDist) * 3.5 * CONFIG.STEER_STRENGTH * fearDampening;
                }
            }
        }

        // ------------------------------------
        // Foraging, Socializing, & Reproduction (Suppressed if Panicked/Hunting)
        // ------------------------------------
        if (!isPanicked && !isHuntingMonster) {
            let cx = 0, cy = 0;
            let cvx = 0, cvy = 0;
            let separationX = 0, separationY = 0;

            // Accumulated social forces — we will average these later to prevent infinite gravity blobs
            let socialSumX = 0;
            let socialSumY = 0;
            let neighborCount = 0;

            // ------------------------------------
            // Home Post / Tribe Capital Mechanic
            // Fix #7: If desperate AND scarce-gender, prefer tribe capital (safe) over map center (dangerous)
            // ------------------------------------
            if (this.mapWidth && this.mapHeight) {
                if ((this.seeksScarceGender || this.isScarceGender) && !this.isDesperate) {
                    // Scarce gender mechanic — but ONLY if tribe is healthy enough to risk the center
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
                    // This also fires when desperate + scarce gender — stay safe in home territory!
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

            // --- Hunger Urgency ---
            const hungerRatio = CONFIG.ENABLE_HUNGER ? (1 - this.hunger / CONFIG.MAX_HUNGER) : 0;
            const hungerUrgency = Math.max(0, Math.min(1, (hungerRatio - 0.3) / 0.7));
            const hungerUrgencySq = hungerUrgency * hungerUrgency;
            const foodMultiplier = 1 + hungerUrgencySq * 3;
            const fearDampening = 1 - hungerUrgencySq * 0.7;

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
                        steerX += (dx / dist) * CONFIG.FOOD_ATTRACTION * foodMultiplier;
                        steerY += (dy / dist) * CONFIG.FOOD_ATTRACTION * foodMultiplier;
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
                neighborCount++;

                const isSameGender = this.gender === other.gender;
                const isSameTribe = !CONFIG.ENABLE_TRIBES || this.tribe === other.tribe;
                const isDesperateRepro = !isSameGender && ((this.seeksScarceGender && other.isScarceGender) || (other.seeksScarceGender && this.isScarceGender));

                if (isDesperateRepro && !this.isBerserk) {
                    // Fix #2: Desperate mate charge still factors in starvation.
                    const desperateCharge = 1.5 * (1 - hungerUrgencySq * 0.6);
                    socialSumX += nx * desperateCharge * CONFIG.STEER_STRENGTH;
                    socialSumY += ny * desperateCharge * CONFIG.STEER_STRENGTH;
                } else if (other.isBerserk) {
                    // PANIC: Run away from Berserkers immediately! 
                    socialSumX -= nx * 4.0 * CONFIG.STEER_STRENGTH * fearDampening;
                    socialSumY -= ny * 4.0 * CONFIG.STEER_STRENGTH * fearDampening;
                } else if (other.isInfected) {
                    const fleeUrge = Math.max(0, (this.intelligence - 50) / 50);
                    if (fleeUrge > 0) {
                        socialSumX -= nx * fleeUrge * CONFIG.STEER_STRENGTH * 1.5 * fearDampening;
                        socialSumY -= ny * fleeUrge * CONFIG.STEER_STRENGTH * 1.5 * fearDampening;
                    }
                } else if (!isSameTribe || this.isBerserk) {
                    // If we are BERSERK, everyone is an enemy! No tribe rules apply.
                    let fightUrge = (this.fighter - 30) / 30; // Extra aggressive
                    if (this.isBerserk) fightUrge = 2.5; // Berserkers charge everyone instantly

                    if (this.intelligence > 60 && this.strength < other.strength + 15 && !this.isBerserk) {
                        fightUrge = -1.0 * fearDampening;
                    }
                    socialSumX += nx * fightUrge * CONFIG.STEER_STRENGTH;
                    socialSumY += ny * fightUrge * CONFIG.STEER_STRENGTH;
                } else if (isSameGender) {
                    let cohesion = -0.3;
                    if (this.isDesperate || this.strength < 40) cohesion = 0.5;
                    socialSumX += nx * cohesion * CONFIG.STEER_STRENGTH;
                    socialSumY += ny * cohesion * CONFIG.STEER_STRENGTH;
                } else {
                    let mateUrge = (this.libido - 30) / 100;
                    if (CONFIG.ENABLE_INCEST_PENALTY && this.isRelated(other)) {
                        // Fix #1: Incest repulsion capped at -1.5
                        const incestRepulsion = Math.max(-1.5, -0.8 - (this.intelligence / 200));
                        mateUrge = this.isDesperate ? Math.max(0, mateUrge) : incestRepulsion;
                    }
                    socialSumX += nx * mateUrge * CONFIG.STEER_STRENGTH;
                    socialSumY += ny * mateUrge * CONFIG.STEER_STRENGTH;
                }

                const sForce = this.personality === PERSONALITY.INTROVERT ? -0.15 : 0.1;
                socialSumX += nx * sForce * CONFIG.STEER_STRENGTH;
                socialSumY += ny * sForce * CONFIG.STEER_STRENGTH;
            }

            // Normalization: Average the social forces by neighbor count
            // This prevents "Infinite Social Gravity" in dense blobs.
            if (neighborCount > 0) {
                const normalization = Math.max(1, neighborCount / 4); // Capped scaling
                steerX += socialSumX / normalization;
                steerY += socialSumY / normalization;

                // --- Berserk Check (Psychosis due to overcrowding) ---
                if (neighborCount > 20 && !this.isBerserk) {
                    this.stressLevel += 0.5;
                    if (this.stressLevel > 150) {
                        this.isBerserk = true;
                        this.berserkTicks = randInt(1200, 2400); // 1-2 years of rage
                        this.fighter = clamp(this.fighter + 50, 0, 100);
                        this.strength = clamp(this.strength + 20, 0, 100);
                        this.personality = PERSONALITY.INTROVERT; // Stop seeking friends
                    }
                } else if (!this.isBerserk) {
                    // Gradual recovery when not overcrowded
                    this.stressLevel = Math.max(0, this.stressLevel - 0.4);
                }
            }
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

        // --- Rage Management ---
        if (this.isBerserk) {
            this.berserkTicks--;
            if (this.berserkTicks <= 0) {
                this.isBerserk = false;
                this.stressLevel = 0;
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

        // Combat weariness recovery & exhaustion death
        if (CONFIG.ENABLE_COMBAT_WEARINESS) {
            this.recoverWeariness(worldTick);
            if (this.weariness >= CONFIG.WEARINESS_DEATH_THRESHOLD && Math.random() < CONFIG.WEARINESS_DEATH_CHANCE) {
                this.markedForDeath = true;
                this.deathReason = 'exhaustion';
            }
        }
    }

    /**
     * Draw agent as a shape: square for male, triangle for female.
     * With tribe-based colors.
     */
    draw(ctx) {
        // Obsolete in data-oriented structure, handled by worker buffer now.
    }
}

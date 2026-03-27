import { Agent } from './Agent.js?v=123456';
import { Particle } from './Particle.js?v=123456';
import { CONFIG, PERSONALITY } from './config.js?v=123456';
import { rand, randInt, distance, clamp } from './utils.js?v=123456';
import { Monster } from './Monster.js?v=123456';

export class InteractionManager {
    constructor() {
        this.stats = {
            encounters: 0,
            kills: 0,
            reproduction_successes: 0,
            offspring_born: 0,
            incest_born: 0,
            natural_deaths: 0,
            exhaustion_deaths: 0,
            monster_births: 0,
            monster_fights: 0,
            monster_deaths: 0
        };
        this.events = [];
        this.milestones = [];
        this.recordedEras = {
            FIRST_BLOOD: false,
            FIRST_BIRTH: false,
            FIRST_MONSTER: false,
            PLAGUE_OUTBREAK: false,
            BERSERKER_CRISIS: false,
            GENDER_SCARCITY: false,
            THE_VOID: false // Total extinction
        };
        this.peakPop = 0;
        this.lastSnapPop = 0;
        this.popHistoryThresholds = [100, 200, 300, 400, 500]; // Multiples to track
        this.allTimeHeroes = {
            strongest: { name: 'None', val: 0 },
            prolific: { name: 'None', val: 0 }
        };
        this.lastStats = {
            avgStr: 0,
            avgInt: 0,
            avgSpd: 0
        };
        this.statHistory = [];
    }

    recordMilestone(tick, msg, type = 'info') {
        const year = Math.floor(tick / CONFIG.TICKS_PER_YEAR);
        if (this.milestones.length < 50) {
            this.milestones.push({ year, msg, type });
        }
    }

    /**
     * Push two agents apart with an active force based on their positions.
     * Prevents agents from getting stuck when they are incompatible.
     */
    pushApart(a, b, force = 0.6) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 1; // avoid division by zero
        const nx = dx / dist;
        const ny = dy / dist;

        // Displace position directly since velocity clamping ruins this effect
        a.x += nx * (force * 3);
        a.y += ny * (force * 3);
        b.x -= nx * (force * 3);
        b.y -= ny * (force * 3);

        a.vx = nx * force * 0.1;
        a.vy = ny * force * 0.1;
        b.vx = -nx * force * 0.1;
        b.vy = -ny * force * 0.1;
    }

    spawnDeathParticles(x, y, particlesArray) {
        for (let i = 0; i < 8; i++) {
            particlesArray.push(new Particle(x, y, '#ef4444'));
        }
    }

    spawnBirthParticles(x, y, particlesArray) {
        for (let i = 0; i < 8; i++) {
            particlesArray.push(new Particle(x, y, '#ffffff'));
        }
    }

    spawnOldAgeParticles(x, y, particlesArray) {
        for (let i = 0; i < 5; i++) {
            particlesArray.push(new Particle(x, y, '#94a3b8')); // gray for old age
        }
    }

    /**
     * Encounter with age-based rules.
     * - Children (< 12) can be killed by adults but cannot initiate fights.
     * - Teens (12-17) and above can fight.
     */
    resolveConflict(a, b, particlesArray, worldTick, isInterTribe = false) {
        if (!CONFIG.ENABLE_FIGHTING) {
            this.pushApart(a, b, 0.4);
            return;
        }

        this.stats.encounters++;

        const aCanFight = a.canFight(worldTick);
        const bCanFight = b.canFight(worldTick);

        // If both are children, they just bump off each other
        if (!aCanFight && !bCanFight) {
            this.pushApart(a, b, 0.4);
            return;
        }

        // If one is a child and the other is an adult/teen, they no longer fight. Children are immune!
        if (!aCanFight || !bCanFight) {
            this.pushApart(a, b, 0.4);
            return;
        }

        // Both can fight — use fighter trait to determine if fight happens
        const avgFighter = (a.fighter + b.fighter) / 2;

        let fightChance;
        if (isInterTribe) {
            // Fix #4: Inter-tribe fight chance scales with desperation.
            // Desperate tribes (pop < 12) are frightened, not aggressive — lower fight chance.
            const desperationPenalty = (a.isDesperate || b.isDesperate) ? 0.3 : 0;
            // Base chance: 30% floor (was 50%), scales up with fighter trait
            fightChance = clamp(avgFighter / 100 + 0.3 - desperationPenalty, 0.15, 0.85);
        } else {
            // Diplomacy: High intelligence can de-escalate inner-tribe conflict
            const avgIntelligence = (a.intelligence + b.intelligence) / 2;
            const deescalationChance = clamp((avgIntelligence - 30) / 100, 0, 1);
            if (Math.random() < deescalationChance) {
                // Successfully de-escalated through diplomacy
                this.pushApart(a, b, 0.5);
                return;
            }
            // Lower chance for inner-tribe scuffles
            fightChance = clamp((avgFighter - 40) / 100, 0.05, 0.4);
        }

        // Manics/Berserkers always fight anyone they touch, overrides everything!
        if (a.isBerserk || b.isBerserk) {
            fightChance = 1.0;
        }

        if (Math.random() > fightChance) {
            this.pushApart(a, b, 0.5);
            return;
        }

        // Fight happens
        this.stats.kills++;

        // Weariness reduces combat effectiveness (up to -50% at max weariness)
        const wearinessPenaltyA = CONFIG.ENABLE_COMBAT_WEARINESS ? (1 - (a.weariness / CONFIG.WEARINESS_MAX) * 0.5) : 1;
        const wearinessPenaltyB = CONFIG.ENABLE_COMBAT_WEARINESS ? (1 - (b.weariness / CONFIG.WEARINESS_MAX) * 0.5) : 1;

        let scoreA = (a.strength + a.intelligence * 0.5 + a.fighter * 0.3) * wearinessPenaltyA;
        let scoreB = (b.strength + b.intelligence * 0.5 + b.fighter * 0.3) * wearinessPenaltyB;

        // Berserker Advantage: Pure Rage is terrifyingly lethal
        if (a.isBerserk && !b.isBerserk) scoreA *= 5;
        if (b.isBerserk && !a.isBerserk) scoreB *= 5;

        const probA = scoreA / (scoreA + scoreB);

        let winner, loser;
        if (Math.random() < probA) {
            winner = a;
            loser = b;
        } else {
            winner = b;
            loser = a;
        }

        loser.markedForDeath = true;
        loser.deathReason = 'murder';
        this.spawnDeathParticles(loser.x, loser.y, particlesArray);

        if (!this.recordedEras.FIRST_BLOOD) {
            this.recordedEras.FIRST_BLOOD = true;
            this.recordMilestone(worldTick, `The first life was taken: ${winner.name} killed ${loser.name}. The Age of Conflict has begun.`, 'danger');
        }
        winner.vx *= -1;
        winner.vy *= -1;

        // Winner gains weariness from the fight (age-dependent)
        winner.addKillWeariness(worldTick);

        if (isInterTribe || winner.strength > 90) {
            this.events.push({
                type: 'combat',
                msg: `⚔️ ${winner.name} brutally struck down ${loser.name} in combat!`
            });
        }
    }

    /**
     * Check if agent `seeker` finds `candidate` acceptable as a mate.
     */
    meetsPreferences(seeker, candidate) {
        let score = 0;
        let checks = 0;

        checks++;
        if (candidate.strength >= seeker.prefMinStrength) score++;

        checks++;
        if (candidate.intelligence >= seeker.prefMinIntelligence) score++;

        if (seeker.prefPersonality !== null) {
            checks++;
            if (candidate.personality === seeker.prefPersonality) score++;
        }

        let compatibility = score / checks;
        const charmBonus = candidate.charm / 300;
        compatibility = clamp(compatibility + charmBonus, 0, 1);

        return compatibility >= 0.5;
    }

    /**
     * Opposite-gender encounter with age-based rules.
     * Only adults (18-49) can reproduce.
     */
    resolveReproduction(parentA, parentB, agentsArray, particlesArray, worldTick, isCrossTribe = false, isDesperateOverride = false) {
        if (!CONFIG.ENABLE_REPRODUCTION) {
            this.pushApart(parentA, parentB, 0.4);
            return;
        }

        this.stats.encounters++;

        // Both must be of reproductive age
        if (!parentA.canReproduce(worldTick) || !parentB.canReproduce(worldTick)) {
            this.pushApart(parentA, parentB, 0.4);
            return;
        }

        if (parentA.cooldown > 0 || parentB.cooldown > 0) {
            this.pushApart(parentA, parentB, 0.3);
            return;
        }
        if (CONFIG.ENABLE_MAX_POPULATION && agentsArray.length >= CONFIG.MAX_POPULATION) return;

        const aMeetsB = this.meetsPreferences(parentA, parentB);
        const bMeetsA = this.meetsPreferences(parentB, parentA);

        if (!aMeetsB || !bMeetsA) {
            // Very occasionally completely ignore preferences if cross tribe ROMANCE!
            if (!isCrossTribe || Math.random() > 0.1) {
                if (!isDesperateOverride) {
                    this.pushApart(parentA, parentB, 0.6);
                    return;
                }
            }
        }

        const avgLibido = (parentA.libido + parentB.libido) / 2;
        // Easier to reproduce when compatible, almost guaranteed if cross tribe romance happened.
        let reproduceChance = isCrossTribe ? 0.95 : clamp(avgLibido / 120, 0.1, 0.8);
        if (isDesperateOverride) reproduceChance = 1.0;

        if (Math.random() > reproduceChance) return;

        this.stats.reproduction_successes++;

        parentA.cooldown = CONFIG.REPRODUCTION_COOLDOWN;
        parentB.cooldown = CONFIG.REPRODUCTION_COOLDOWN;
        parentA.ticksSinceLastMate = 0;
        parentB.ticksSinceLastMate = 0;

        let numChildren;
        const roll = Math.random();
        if (roll < 0.02) numChildren = 0;      // 2% chance of 0
        else if (roll < 0.75) numChildren = 1; // 73% chance of 1 (highest chance)
        else numChildren = 2;                  // 25% chance of 2 (twins)

        for (let i = 0; i < numChildren; i++) {
            if (CONFIG.ENABLE_MAX_POPULATION && agentsArray.length >= CONFIG.MAX_POPULATION) break;

            this.stats.offspring_born++;
            parentA.offspringCount++;
            parentB.offspringCount++;

            if (!this.recordedEras.FIRST_BIRTH) {
                this.recordedEras.FIRST_BIRTH = true;
                this.recordMilestone(worldTick, `The first child, ${parentA.tribe === parentB.tribe ? 'a pure-bred' : 'a hybrid-born'}, was welcomed into the world.`, 'success');
            }

            let isIncest = false;
            // Both agents may have empty parent array if they are origin agents, which is fine
            if (parentA.parents && parentB.parents) {
                // Sibling check (half-siblings included)
                const sharedParent = parentA.parents.some(pid => pid && parentB.parents.includes(pid));
                // Parent-Child check
                const parentChild = parentA.parents.includes(parentB.id) || parentB.parents.includes(parentA.id);

                if (sharedParent || parentChild) {
                    isIncest = true;
                    this.stats.incest_born++;
                }
            }

            let mutationModifier = (isIncest && CONFIG.ENABLE_INCEST_PENALTY) ? -0.4 : 0; // 40% penalty to core stats for incest

            // If the tribe is desperate! No penalty! We must survive!
            if (isIncest && CONFIG.ENABLE_INCEST_PENALTY && (parentA.isDesperate || parentB.isDesperate)) {
                mutationModifier = 0;
            }

            let childStr = Math.floor((parentA.strength + parentB.strength) / 2 * (1 + mutationModifier + rand(-CONFIG.MUTATION_RATE, CONFIG.MUTATION_RATE)));
            let childInt = Math.floor((parentA.intelligence + parentB.intelligence) / 2 * (1 + mutationModifier + rand(-CONFIG.MUTATION_RATE, CONFIG.MUTATION_RATE)));
            let childSpd = Math.floor((parentA.speed + parentB.speed) / 2 * (1 + mutationModifier + rand(-CONFIG.MUTATION_RATE, CONFIG.MUTATION_RATE)));

            // Romeo & Juliet Hidden Mechanic!
            if (isCrossTribe) {
                childStr = clamp(childStr * 1.5, 90, 100);
                childInt = clamp(childInt * 1.5, 90, 100);
                childSpd = clamp(childSpd * 1.5, 90, 100);
            } else {
                childStr = clamp(childStr, 1, 100);
                childInt = clamp(childInt, 1, 100);
                childSpd = clamp(childSpd, 1, 100);
            }

            let traitModifier = (isIncest && CONFIG.ENABLE_INCEST_PENALTY && !parentA.isDesperate && !parentB.isDesperate) ? -30 : 0; // Flat penalty to social traits

            const childTraits = {
                personality: Math.random() > 0.7
                    ? (Math.random() > 0.5 ? PERSONALITY.EXTROVERT : PERSONALITY.INTROVERT)
                    : (Math.random() > 0.5 ? parentA.personality : parentB.personality),
                libido: clamp(Math.floor((parentA.libido + parentB.libido) / 2 + traitModifier + randInt(-10, 10)), 0, 100),
                fighter: isCrossTribe ? 100 : clamp(Math.floor((parentA.fighter + parentB.fighter) / 2 + traitModifier + randInt(-10, 10)), 0, 100),
                charm: clamp(Math.floor((parentA.charm + parentB.charm) / 2 + traitModifier + randInt(-10, 10)), 0, 100),
                prefMinStrength: clamp(randInt(10, 50), 0, 80),
                prefMinIntelligence: clamp(randInt(10, 50), 0, 80),
                prefPersonality: Math.random() < 0.3 ? null : (Math.random() > 0.5 ? PERSONALITY.EXTROVERT : PERSONALITY.INTROVERT),
            };

            let childTribe;
            if (parentA.tribe === parentB.tribe) {
                childTribe = parentA.tribe;
            } else {
                childTribe = Math.random() < 0.5 ? parentA.tribe : parentB.tribe;
            }
            // Child is born at age 0 at current worldTick
            let child = new Agent(
                parentA.x + rand(-10, 10),
                parentA.y + rand(-10, 10),
                null,
                childStr,
                childInt,
                childTraits,
                worldTick,   // birthTick = now
                null,        // no forced age, starts at 0
                [parentA.id, parentB.id], // track parents
                isIncest,    // born of incest flag
                childTribe,
                childSpd     // inherited speed
            );
            agentsArray.push(child);
            this.spawnBirthParticles(child.x, child.y, particlesArray);

            if (isCrossTribe && numChildren > 0 && Math.random() < 0.2) {
                // Not every cross-tribe child needs an announcement, but give it a good chance
                this.events.push({
                    type: 'romance',
                    msg: `❤️ Love blooms! ${parentA.name} and ${parentB.name} crossed enemy lines to have a child.`
                });
            } else if (isDesperateOverride && numChildren > 0 && Math.random() < 0.1) {
                this.events.push({
                    type: 'divine',
                    msg: `✨ Desperate times! ${parentA.name} and ${parentB.name} reproduced to save their tribe.`
                });
            } else if (isIncest && numChildren > 0 && Math.random() < 0.05) {
                this.events.push({
                    type: 'divine',
                    msg: `⚠️ Questionable! ${parentA.name} and ${parentB.name} engaged in incestuous activities.`
                });
            }
        }
    }

    /**
     * Check for old age deaths
     */
    processAging(agentsArray, particlesArray, worldTick) {
        if (!CONFIG.ENABLE_AGING) return;

        for (const agent of agentsArray) {
            if (agent.markedForDeath) continue;
            const age = agent.getAge(worldTick);
            if (age >= CONFIG.MAX_AGE) {
                agent.markedForDeath = true;
                this.stats.natural_deaths++;
                this.spawnOldAgeParticles(agent.x, agent.y, particlesArray);
            }
        }
    }

    processMonsterVsMonster(monstersArray, particlesArray) {
        if (!CONFIG.ENABLE_FIGHTING) return;

        // Process monster starvation
        if (CONFIG.ENABLE_HUNGER) {
            for (let i = 0; i < monstersArray.length; i++) {
                const m = monstersArray[i];
                if (m.markedForDeath) continue;

                m.hunger -= CONFIG.STARVATION_RATE;
                if (m.hunger <= 0) {
                    m.markedForDeath = true;
                    this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 1;
                    this.spawnDeathParticles(m.x, m.y, particlesArray);
                    for (let k = 0; k < 20; k++) particlesArray.push(new Particle(m.x, m.y, '#FF7400'));

                    this.events.push({
                        type: 'plague',
                        msg: `💀 A Monster has succumbed to starvation!`
                    });
                }
            }
        }

        // Process monster vs monster territory fights
        for (let i = 0; i < monstersArray.length; i++) {
            const m1 = monstersArray[i];
            if (m1.markedForDeath) continue;

            for (let j = i + 1; j < monstersArray.length; j++) {
                const m2 = monstersArray[j];
                if (m2.markedForDeath) continue;

                const dist = distance(m1, m2);
                if (dist < m1.radius + m2.radius) {
                    // Territorial fight! Both deal damage to each other.
                    const m1Dmg = m1.strength * 0.4;
                    const m2Dmg = m2.strength * 0.4;

                    m1.hp -= m2Dmg;
                    m2.hp -= m1Dmg;

                    // Knockback to prevent constant clashing
                    this.pushApart(m1, m2, 12.0);

                    this.stats.monster_fights = (this.stats.monster_fights || 0) + 1;

                    let message = null;
                    if (m1.hp <= 0 && m2.hp <= 0) {
                        m1.markedForDeath = true;
                        m2.markedForDeath = true;
                        this.spawnDeathParticles(m1.x, m1.y, particlesArray);
                        this.spawnDeathParticles(m2.x, m2.y, particlesArray);
                        for (let k = 0; k < 20; k++) { particlesArray.push(new Particle(m1.x, m1.y, '#FF7400')); particlesArray.push(new Particle(m2.x, m2.y, '#FF7400')); }

                        message = `🌋 TITAN CLASH! Two monsters destroyed each other in a fierce territorial dispute!`;
                        this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 2;
                    } else if (m1.hp <= 0) {
                        m1.markedForDeath = true;
                        this.spawnDeathParticles(m1.x, m1.y, particlesArray);
                        for (let k = 0; k < 20; k++) particlesArray.push(new Particle(m1.x, m1.y, '#FF7400'));

                        message = `🩸 BRUTAL DOMINANCE! A Monster killed a rival in a territorial fight!`;
                        this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 1;
                    } else if (m2.hp <= 0) {
                        m2.markedForDeath = true;
                        this.spawnDeathParticles(m2.x, m2.y, particlesArray);
                        for (let k = 0; k < 20; k++) particlesArray.push(new Particle(m2.x, m2.y, '#FF7400'));

                        message = `🩸 BRUTAL DOMINANCE! A Monster killed a rival in a territorial fight!`;
                        this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 1;
                    } else if (Math.random() < 0.1) {
                        message = `⚠️ TERRITORIAL DISPUTE: Two monsters clashed violently over hunting grounds!`;
                    }

                    if (message) {
                        this.events.push({
                            type: 'combat',
                            msg: message
                        });
                    }
                }
            }
        }
    }

    process(agentsArray, particlesArray, foodsArray, worldTick, monstersArray = []) {
        // Age check first
        this.processAging(agentsArray, particlesArray, worldTick);
        this.events = [];

        // Build Spatial Hash Grid to transform O(N^2) bottleneck into O(N)
        // Max awareness is now 1.5x for highly intelligent agents
        const cell_size = CONFIG.AWARENESS_RADIUS * 1.5;
        const grid = new Map();

        for (let i = 0; i < agentsArray.length; i++) {
            const a = agentsArray[i];
            if (a.markedForDeath) continue;
            const cx = Math.floor(a.x / cell_size);
            const cy = Math.floor(a.y / cell_size);
            const key = cx + ',' + cy;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(a);
        }

        // Single pass for Steering & Interactions
        for (let i = 0; i < agentsArray.length; i++) {
            const a = agentsArray[i];
            if (a.markedForDeath) continue;

            const cx = Math.floor(a.x / cell_size);
            const cy = Math.floor(a.y / cell_size);

            const nearbyAwareness = [];
            const nearbyInteraction = [];

            // Check 3x3 surrounding cells
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = (cx + dx) + ',' + (cy + dy);
                    const cell = grid.get(key);
                    if (cell) {
                        for (let j = 0; j < cell.length; j++) {
                            const b = cell[j];
                            if (a === b || b.markedForDeath) continue;

                            const dist = distance(a, b);
                            if (dist < a.dynamicAwarenessRadius) {
                                nearbyAwareness.push(b);
                            }
                            // To avoid double-resolving interactions, we enforce a strict ID check
                            // We only process interaction if a.id < b.id (similar to j = i + 1 check)
                            const interactionRange = (a.isBerserk || b.isBerserk) ? CONFIG.INTERACTION_RADIUS * 1.5 : CONFIG.INTERACTION_RADIUS;
                            if (dist < interactionRange && a.id < b.id) {
                                nearbyInteraction.push(b);
                            }
                        }
                    }
                }
            }

            const nearbyMonsters = [];
            if (CONFIG.ENABLE_MONSTERS) {
                for (const m of monstersArray) {
                    if (m.markedForDeath) continue;
                    if (distance(a, m) < a.dynamicAwarenessRadius * 1.5) {
                        nearbyMonsters.push(m);
                    }
                }
            }

            a.steer(nearbyAwareness, foodsArray, nearbyMonsters);

            // Food consumption — Fix #3: Larger eat radius + proximity slowdown
            if (CONFIG.ENABLE_HUNGER) {
                for (let j = 0; j < foodsArray.length; j++) {
                    const f = foodsArray[j];
                    if (f.consumed) continue;
                    const foodDist = distance(a, f);
                    // Increased eat radius from radius+5 to radius+15 to prevent flyover
                    if (foodDist < a.radius + 15) {
                        a.hunger = Math.min(CONFIG.MAX_HUNGER, a.hunger + CONFIG.FOOD_NUTRITION);
                        f.consumed = true;
                    } else if (foodDist < a.radius + 40 && a.hunger < CONFIG.MAX_HUNGER * 0.5) {
                        // Proximity slowdown: hungry agents brake when near food to avoid overshooting
                        a.vx *= 0.85;
                        a.vy *= 0.85;
                    }
                }
            }

            for (const b of nearbyInteraction) {
                // Plague spread guarantees infection on any interaction
                if ((a.isInfected || b.isInfected) && !(a.isInfected && b.isInfected)) {
                    a.isInfected = true;
                    b.isInfected = true;
                    if (Math.random() < 0.05) { // 5% chance to log an infection event so it doesn't spam
                        this.events.push({
                            type: 'plague',
                            msg: `🦠 The Plague spreads between ${a.name} and ${b.name}.`
                        });
                    }
                }

                const isSameTribe = !CONFIG.ENABLE_TRIBES || a.tribe === b.tribe;
                const isOppositeGender = a.gender !== b.gender;

                // If the genders are severely unbalanced and chances of civilisation dying are high
                const isDesperateRepro = isOppositeGender && ((a.seeksScarceGender && b.isScarceGender) || (b.seeksScarceGender && a.isScarceGender));

                if (isDesperateRepro) {
                    // Force reproduction, skip fighting!
                    this.resolveReproduction(a, b, agentsArray, particlesArray, worldTick, !isSameTribe, true);
                } else if (!isSameTribe) {
                    // War breaks out immediately regardless of gender!
                    // EXCEPT... a small chance of cross-tribe romance if opposite gender!
                    if (isOppositeGender && Math.random() < 0.05) { // 5% chance!
                        this.resolveReproduction(a, b, agentsArray, particlesArray, worldTick, true);
                    } else {
                        this.resolveConflict(a, b, particlesArray, worldTick, true);
                    }
                } else if (!isOppositeGender) {
                    // Fix #5: Same tribe, same gender — only attempt scuffle if at least one is aggressive.
                    // Peaceful tribemates (both fighter <= 50) just push apart, preventing silent population bleed.
                    if (a.fighter > 50 || b.fighter > 50) {
                        this.resolveConflict(a, b, particlesArray, worldTick, false);
                    } else {
                        this.pushApart(a, b, 0.3);
                    }
                } else {
                    // Same tribe, opposite gender -> reproduce
                    this.resolveReproduction(a, b, agentsArray, particlesArray, worldTick);
                }
            }
        }
    }

    processMonsterInteractions(agentsArray, monstersArray, particlesArray, worldTick) {
        if (!CONFIG.ENABLE_MONSTERS) return;

        for (const monster of monstersArray) {
            if (monster.markedForDeath) continue;

            for (const agent of agentsArray) {
                if (agent.markedForDeath) continue;

                const dist = distance(agent, monster);
                if (dist < agent.radius + monster.radius + 5) { // +5 buffer to match visual "blobliness"
                    if (!this.recordedEras.FIRST_MONSTER) {
                        this.recordedEras.FIRST_MONSTER = true;
                        this.recordMilestone(worldTick, `Humanity has met its match. The first Monster was spotted near ${agent.name}. The Age of Terror begins.`, 'warning');
                    }

                    // Rare Mating Check
                    const isAdultFemale = agent.gender === 'Female' && agent.canReproduce(worldTick);
                    if (isAdultFemale && Math.random() < 0.15) { // 15% chance when encountering an adult female
                        this.events.push({
                            type: 'romance',
                            msg: `🖤 UNTHINKABLE! A Monster spared ${agent.name} and took her as a mate!`
                        });

                        agent.cooldown = CONFIG.REPRODUCTION_COOLDOWN * 3; // Huge cooldown
                        this.stats.monster_births = (this.stats.monster_births || 0) + 1;
                        agent.offspringCount++;

                        const childStr = Math.min(100, Math.floor((agent.strength + monster.strength) / 2 * 1.8)); // extreme strength
                        const childInt = Math.min(100, Math.floor((agent.intelligence + monster.intelligence) / 2 * 1.3));

                        let newMonster = new Monster(
                            agent.x + rand(-15, 15),
                            agent.y + rand(-15, 15),
                            childStr,
                            childInt
                        );
                        monstersArray.push(newMonster);
                        this.spawnBirthParticles(newMonster.x, newMonster.y, particlesArray);

                        // Push them apart dramatically so she isn't immediately eaten next frame
                        this.pushApart(agent, monster, 12.0);
                        this.pushApart(newMonster, monster, 15.0);

                        continue; // Skip the devour logic!
                    }

                    // Encounter! Agent attempts to fight back
                    // Intelligent agents get a bonus to damage output!
                    let damage = agent.strength * (agent.fighter / 100);
                    damage += damage * (agent.intelligence / 100);
                    monster.hp -= damage;

                    // Survival Check Check! Stronger and Smarter agents can survive a blow, but exhaustion and swarms are deadly!
                    const baseSurvival = (agent.strength / 100) * 0.6 + (agent.intelligence / 100) * 0.3;

                    // Penalty 1: Combat Weariness (Up to 50% penalty at max weariness)
                    const wearinessPenalty = CONFIG.ENABLE_COMBAT_WEARINESS ? (1 - (agent.weariness / CONFIG.WEARINESS_MAX) * 0.5) : 1;

                    // Penalty 2: The Swarm (Being surrounded is lethal)
                    let swarmCount = 0;
                    for (const m of monstersArray) {
                        if (!m.markedForDeath && distance(agent, m) < (agent.radius + m.radius + 15)) {
                            swarmCount++;
                        }
                    }
                    const swarmPenalty = Math.max(0.1, 1 - (swarmCount - 1) * 0.15); // -15% for each monster after the first

                    const finalSurvivalChance = baseSurvival * wearinessPenalty * swarmPenalty;

                    if (Math.random() < finalSurvivalChance) {
                        // Agent survives the clash!
                        this.pushApart(agent, monster, 5.0); // Massive knockback
                        agent.addKillWeariness(worldTick);   // Fighting a monster is exhausting!

                        // Update stats
                        this.stats.monster_fights = (this.stats.monster_fights || 0) + 1;

                        // Small chance to broadcast non-lethal heroic strike
                        if (Math.random() < 0.1) {
                            this.events.push({
                                type: 'combat',
                                msg: `⚔️ AMAZING! ${agent.name} struck a Monster and survived the clash!`
                            });
                        }

                        if (monster.hp <= 0) {
                            monster.markedForDeath = true;
                            this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 1;
                            this.stats.monster_fights = (this.stats.monster_fights || 0) + 1;

                            this.spawnDeathParticles(monster.x, monster.y, particlesArray);
                            for (let i = 0; i < 20; i++) particlesArray.push(new Particle(monster.x, monster.y, '#FF7400'));

                            this.events.push({
                                type: 'combat',
                                msg: `🗡️ LEGENDARY VICTORY! ${agent.name} heroically slayed a Monster and lived to tell the tale!`
                            });
                        }
                    } else {
                        // Agent is devoured
                        agent.markedForDeath = true;
                        this.stats.kills++;
                        this.spawnDeathParticles(agent.x, agent.y, particlesArray);

                        if (monster.hp <= 0) {
                            // Mutual destruction
                            monster.markedForDeath = true;
                            this.stats.monster_deaths = (this.stats.monster_deaths || 0) + 1;
                            this.stats.monster_fights = (this.stats.monster_fights || 0) + 1;

                            this.spawnDeathParticles(monster.x, monster.y, particlesArray);
                            for (let i = 0; i < 20; i++) particlesArray.push(new Particle(monster.x, monster.y, '#FF7400')); // Amber monster blood

                            this.events.push({
                                type: 'combat',
                                msg: `🗡️ NOBLE SACRIFICE! ${agent.name} heroically slayed a Monster before dying!`
                            });
                        } else {
                            // Regular devour
                            this.events.push({
                                type: 'plague', // reuse red style or new type
                                msg: `👹 A Monster brutally devoured ${agent.name}!`
                            });

                            // Monster gains massive Hunger restoration, but NO HP!
                            // Combat damage from heroes is permanent!
                            if (CONFIG.ENABLE_HUNGER) {
                                monster.hunger = Math.min(CONFIG.MAX_HUNGER, monster.hunger + CONFIG.FOOD_NUTRITION * 5); // Huge nutritional value from humans
                            }
                        }
                    }
                }
            }
        }
    }

    checkGlobalMilestones(agents, worldTick) {
        // 0. Genesis Snapshot (Year 0)
        if (worldTick === 0 && agents.length > 0 && this.statHistory.length === 0) {
            const totalStr = agents.reduce((sum, a) => sum + a.strength, 0);
            const totalInt = agents.reduce((sum, a) => sum + a.intelligence, 0);
            this.statHistory.push({
                year: 0,
                avgStr: Math.round(totalStr / agents.length),
                avgInt: Math.round(totalInt / agents.length)
            });
        }

        if (agents.length === 0) {
            if (!this.recordedEras.THE_VOID && worldTick > 500) {
                this.recordedEras.THE_VOID = true;
                this.recordMilestone(worldTick, `The Silence: Humanity has vanished from the world. A final ending.`, 'info');
            }
            return;
        }

        // 1. Berserker check
        const berserkCount = agents.filter(a => a.isBerserk).length;
        if (!this.recordedEras.BERSERKER_CRISIS && berserkCount > 5) {
            this.recordedEras.BERSERKER_CRISIS = true;
            this.recordMilestone(worldTick, `The Berserker Crisis: Overcrowding has driven many into a bloodthirsty rage. Chaos reigns.`, 'danger');
        }

        // 2. Gender scarcity check
        const males = agents.filter(a => a.gender === 'Male' && !a.isElder(worldTick)).length;
        const females = agents.filter(a => a.gender === 'Female' && !a.isElder(worldTick)).length;
        if (!this.recordedEras.GENDER_SCARCITY && (males < 3 || females < 3) && agents.length > 20) {
            this.recordedEras.GENDER_SCARCITY = true;
            const scarce = males < 3 ? 'reproduction-capable males' : 'reproduction-capable females';
            this.recordMilestone(worldTick, `Extinction looms: The population is almost devoid of ${scarce}. Repopulation is nearly impossible.`, 'warning');
        }

        // 3. Population Dynamics Check (Every 500 ticks)
        if (worldTick % 500 === 0) {
            const currentPop = agents.length;

            // Plague check
            const infectedCount = agents.filter(a => a.isInfected).length;
            if (!this.recordedEras.PLAGUE_OUTBREAK && currentPop > 20 && infectedCount / currentPop > 0.1) {
                this.recordedEras.PLAGUE_OUTBREAK = true;
                this.recordMilestone(worldTick, `The Great Plague: A pestilence is spreading rapidly. Over 10% of the civilization is now infected.`, 'danger');
            }

            // Peak check
            if (currentPop > this.peakPop) {
                this.peakPop = currentPop;
                // If we cross a threshold (100, 200, 300)
                if (this.popHistoryThresholds.length > 0 && currentPop >= this.popHistoryThresholds[0]) {
                    const threshold = this.popHistoryThresholds.shift();
                    this.recordMilestone(worldTick, `Population Milestone: The civilization has reached ${threshold} souls. A Golden Age is unfolding.`, 'success');
                }
            }

            // Crash check (The Great Dip) check relative to last snapshot
            if (this.lastSnapPop > 100 && currentPop < this.lastSnapPop * 0.6) {
                // Drop > 40%
                this.recordMilestone(worldTick, `A Great Famine (or War) has devastated the population. Numbers have plummeted by ${Math.floor((1 - currentPop / this.lastSnapPop) * 100)}% in just over a decade.`, 'danger');
            }

            this.lastSnapPop = currentPop;
        }

        // 4. Demographic Snapshot (Every 300 ticks = 5 years - Now stored for graphing)
        if (worldTick > 0 && worldTick % 300 === 0 && agents.length > 2) {
            const totalStr = agents.reduce((sum, a) => sum + a.strength, 0);
            const totalInt = agents.reduce((sum, a) => sum + a.intelligence, 0);
            const avgStr = Math.round(totalStr / agents.length);
            const avgInt = Math.round(totalInt / agents.length);

            this.statHistory.push({
                year: (worldTick / CONFIG.TICKS_PER_YEAR).toFixed(1),
                avgStr,
                avgInt
            });
        }
    }

    reset() {
        this.stats = {
            encounters: 0,
            kills: 0,
            reproduction_successes: 0,
            offspring_born: 0,
            incest_born: 0,
            natural_deaths: 0,
            exhaustion_deaths: 0,
            monster_births: 0,
            monster_fights: 0,
            monster_deaths: 0
        };
        this.events = [];
        this.milestones = [];
        this.recordedEras = {
            FIRST_BLOOD: false,
            FIRST_BIRTH: false,
            FIRST_MONSTER: false,
            PLAGUE_OUTBREAK: false,
            BERSERKER_CRISIS: false,
            GENDER_SCARCITY: false,
            THE_VOID: false
        };
        this.peakPop = 0;
        this.lastSnapPop = 0;
        this.popHistoryThresholds = [100, 200, 300, 400, 500];
        this.allTimeHeroes = {
            strongest: { name: 'None', val: 0 },
            prolific: { name: 'None', val: 0 }
        };
        this.lastStats = {
            avgStr: 0,
            avgInt: 0
        };
        this.statHistory = [];
    }
}

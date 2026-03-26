import { Entity } from './Entity.js?v=123456';
import { CONFIG } from './config.js?v=123456';
import { rand, randInt, generateId } from './utils.js?v=123456';

export class Monster extends Entity {
    constructor(x, y, strength = null, intelligence = null) {
        super(x, y);
        this.id = generateId();
        this.intId = null; // Assigned by worker

        // High base stats
        this.strength = strength || randInt(80, 100);
        this.intelligence = intelligence || randInt(50, 90);

        this.maxHp = this.strength * 5;
        this.hp = this.maxHp;

        this.radius = CONFIG.MONSTER_RADIUS;

        // Initial random vector
        const angle = rand(0, Math.PI * 2);
        const baseSpeed = rand(0.3, CONFIG.MONSTER_SPEED);
        this.vx = Math.cos(angle) * baseSpeed;
        this.vy = Math.sin(angle) * baseSpeed;

        this.markedForDeath = false;
        this.hunger = CONFIG.MAX_HUNGER; // Identical hunger capacity to humans
        this.targetAgentId = null; // Prevent target oscillation

        // How far they can see agents
        this.awarenessRadius = CONFIG.MONSTER_AWARENESS;
    }

    /**
     * Steer towards closest agent or available food.
     */
    steer(nearbyAgents, nearbyFood, worldTick, monstersArray = []) {
        let steerX = 0;
        let steerY = 0;
        let foundTarget = false;

        // Hunt closest agent, with target stickiness to prevent oscillating back and forth
        let closestAgent = null;
        let minDist = Infinity;
        let lockedAgent = null;

        for (const other of nearbyAgents) {
            if (other.markedForDeath) continue;
            const dist = Math.hypot(other.x - this.x, other.y - this.y);
            if (dist < this.awarenessRadius) {
                if (this.targetAgentId === other.id) {
                    lockedAgent = other;
                }
                if (dist < minDist) {
                    minDist = dist;
                    closestAgent = other;
                }
            }
        }

        // Stick to the locked agent if it is still within awareness radius
        if (lockedAgent) {
            closestAgent = lockedAgent;
            minDist = Math.hypot(closestAgent.x - this.x, closestAgent.y - this.y);
        }

        this.targetAgentId = closestAgent ? closestAgent.id : null;

        if (closestAgent) {
            foundTarget = true;
            const dx = closestAgent.x - this.x;
            const dy = closestAgent.y - this.y;
            steerX += (dx / minDist) * 0.8 * CONFIG.STEER_STRENGTH;
            steerY += (dy / minDist) * 0.8 * CONFIG.STEER_STRENGTH;
        }

        // Apply wandering if no targets
        if (!foundTarget) {
            const currentSpeed = Math.hypot(this.vx, this.vy);
            let angle;

            // If they are mostly stopped, blast them in a random direction to reset momentum
            if (currentSpeed < 0.05) {
                angle = Math.random() * Math.PI * 2;
                this.vx = Math.cos(angle) * CONFIG.MONSTER_SPEED;
                this.vy = Math.sin(angle) * CONFIG.MONSTER_SPEED;
            } else {
                // Otherwise keep walking forward, occasionally turning
                angle = Math.atan2(this.vy, this.vx);
                if (Math.random() < 0.05) {
                    angle += (Math.random() - 0.5) * 1.5; // Occasional wide turns
                }

                // Constantly apply strong forward momentum to counteract friction completely
                steerX += Math.cos(angle) * 3.0 * CONFIG.STEER_STRENGTH;
                steerY += Math.sin(angle) * 3.0 * CONFIG.STEER_STRENGTH;
            }
        }

        // ------------------------------------
        // Monster Repulsion (Don't overlap each other)
        // ------------------------------------
        for (const other of monstersArray) {
            if (other.id === this.id || other.markedForDeath) continue;
            const dist = Math.hypot(this.x - other.x, this.y - other.y);
            // Repel strongly if they start overlapping
            if (dist > 0 && dist < this.radius * 3) {
                const dx = this.x - other.x;
                const dy = this.y - other.y;
                steerX += (dx / dist) * 2.5 * CONFIG.STEER_STRENGTH;
                steerY += (dy / dist) * 2.5 * CONFIG.STEER_STRENGTH;
            }
        }

        // Apply friction to prevent high-frequency jitter/oscillating
        this.vx *= 0.92;
        this.vy *= 0.92;

        this.vx += steerX;
        this.vy += steerY;

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > CONFIG.MONSTER_SPEED) {
            this.vx = (this.vx / speed) * CONFIG.MONSTER_SPEED;
            this.vy = (this.vy / speed) * CONFIG.MONSTER_SPEED;
        }
    }

    update(width, height, worldTick, foodsArray) {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off edges with absolute velocity assignment to prevent wall vibration stall
        if (this.x - this.radius <= 0) {
            this.vx = Math.abs(this.vx) + 0.1;
            this.x = this.radius;
        } else if (this.x + this.radius >= width) {
            this.vx = -Math.abs(this.vx) - 0.1;
            this.x = width - this.radius;
        }

        if (this.y - this.radius <= 0) {
            this.vy = Math.abs(this.vy) + 0.1;
            this.y = this.radius;
        } else if (this.y + this.radius >= height) {
            this.vy = -Math.abs(this.vy) - 0.1;
            this.y = height - this.radius;
        }
    }
}

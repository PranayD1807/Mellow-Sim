import { CONFIG, GENDER, PERSONALITY, TRIBE } from './config.js?v=123456';
import { Agent } from './Agent.js?v=123456';
import { InteractionManager } from './InteractionManager.js?v=123456';
import { Particle } from './Particle.js?v=123456';
import { rand, clearAllNames } from './utils.js?v=123456';
import { Monster } from './Monster.js?v=123456';

let agents = [];
let particles = [];
let foods = [];
let monsters = [];
let worldTick = 0;
let interactionManager = new InteractionManager();
let selectedAgentId = null;
let godEvents = [];

let nextAgentId = 1;
const idMap = new Map();

let canvasWidth = 800;
let canvasHeight = 600;
let isPaused = false;
let timeoutId = null;

function reset(w, h) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    agents = [];
    particles = [];
    foods = [];
    monsters = [];
    worldTick = 0;
    idMap.clear();
    clearAllNames();
    interactionManager.reset();
    selectedAgentId = null;
    godEvents = [];

    canvasWidth = w;
    canvasHeight = h;

    const margin = 50;
    for (let i = 0; i < (CONFIG.INITIAL_RED_MALES || 0); i++) {
        let rx = rand(margin, canvasWidth - margin);
        let ry = rand(margin, canvasHeight - margin);
        const startAge = Math.floor(rand(CONFIG.INITIAL_MIN_AGE, CONFIG.INITIAL_MAX_AGE));
        const a = new Agent(rx, ry, GENDER.MALE, null, null, null, worldTick, startAge, [], false, TRIBE.RED);
        a.intId = nextAgentId++;
        idMap.set(a.intId, a);
        agents.push(a);
    }
    for (let i = 0; i < (CONFIG.INITIAL_RED_FEMALES || 0); i++) {
        let rx = rand(margin, canvasWidth - margin);
        let ry = rand(margin, canvasHeight - margin);
        const startAge = Math.floor(rand(CONFIG.INITIAL_MIN_AGE, CONFIG.INITIAL_MAX_AGE));
        const a = new Agent(rx, ry, GENDER.FEMALE, null, null, null, worldTick, startAge, [], false, TRIBE.RED);
        a.intId = nextAgentId++;
        idMap.set(a.intId, a);
        agents.push(a);
    }
    for (let i = 0; i < (CONFIG.INITIAL_BLUE_MALES || 0); i++) {
        let rx = rand(margin, canvasWidth - margin);
        let ry = rand(margin, canvasHeight - margin);
        const startAge = Math.floor(rand(CONFIG.INITIAL_MIN_AGE, CONFIG.INITIAL_MAX_AGE));
        const a = new Agent(rx, ry, GENDER.MALE, null, null, null, worldTick, startAge, [], false, TRIBE.BLUE);
        a.intId = nextAgentId++;
        idMap.set(a.intId, a);
        agents.push(a);
    }
    for (let i = 0; i < (CONFIG.INITIAL_BLUE_FEMALES || 0); i++) {
        let rx = rand(margin, canvasWidth - margin);
        let ry = rand(margin, canvasHeight - margin);
        const startAge = Math.floor(rand(CONFIG.INITIAL_MIN_AGE, CONFIG.INITIAL_MAX_AGE));
        const a = new Agent(rx, ry, GENDER.FEMALE, null, null, null, worldTick, startAge, [], false, TRIBE.BLUE);
        a.intId = nextAgentId++;
        idMap.set(a.intId, a);
        agents.push(a);
    }
    
    if (CONFIG.ENABLE_MONSTERS) {
        for (let i = 0; i < (CONFIG.INITIAL_MONSTERS || 0); i++) {
            let rx = rand(margin, canvasWidth - margin);
            let ry = rand(margin, canvasHeight - margin);
            const m = new Monster(rx, ry);
            m.intId = nextAgentId++;
            idMap.set(m.intId, m);
            monsters.push(m);
        }
    }
}

self.onmessage = function (e) {
    const data = e.data;
    if (data.type === 'INIT') {
        reset(data.width, data.height);
        runLoop();
    } else if (data.type === 'RESIZE') {
        canvasWidth = data.width;
        canvasHeight = data.height;
    } else if (data.type === 'PAUSE') {
        isPaused = data.isPaused;
        if (!isPaused && !timeoutId) runLoop();
    } else if (data.type === 'RESET') {
        reset(canvasWidth, canvasHeight);
    } else if (data.type === 'CONFIG') {
        CONFIG[data.key] = data.value;
    } else if (data.type === 'SELECT') {
        selectedAgentId = data.id;
    } else if (data.type === 'GOD_ACT') {
        if (data.action === 'food') {
            for (let i = 0; i < 5; i++) {
                foods.push({ x: data.x + (Math.random() * 40 - 20), y: data.y + (Math.random() * 40 - 20), consumed: false });
            }
            godEvents.push({ type: 'divine', msg: '🍔 The Heavens dropped a bounty of Food.' });
        } else if (data.action === 'lightning') {
            let closest = null, minD = Infinity;
            agents.forEach(a => { const d = Math.hypot(a.x - data.x, a.y - data.y); if (d < minD) { minD = d; closest = a; } });
            if (minD < 60 && closest) {
                closest.markedForDeath = true;
                // Add red lightning particles
                for (let i = 0; i < 20; i++) particles.push(new Particle(closest.x, closest.y, '#ef4444'));
                godEvents.push({ type: 'divine', msg: `⚡ Divine Smite! ${closest.name} was struck by Lightning.` });
            }
        } else if (data.action === 'potion') {
            let closest = null, minD = Infinity;
            agents.forEach(a => { const d = Math.hypot(a.x - data.x, a.y - data.y); if (d < minD) { minD = d; closest = a; } });
            if (minD < 60 && closest) {
                closest.libido = 100;
                closest.charm = 100;
                // Add pink love particles
                for (let i = 0; i < 15; i++) particles.push(new Particle(closest.x, closest.y, '#f472b6'));
                godEvents.push({ type: 'romance', msg: `💖 ${closest.name} feels undeniably charming after drinking the Love Potion.` });
            }
        }
    }
};

function runLoop() {
    if (isPaused) {
        timeoutId = null;
        return;
    }

    worldTick++;

    const tribeCounts = { Red: 0, Blue: 0 };
    let globalMales = 0;
    let globalFemales = 0;
    for (let i = 0; i < agents.length; i++) {
        tribeCounts[agents[i].tribe]++;
        if (agents[i].gender === GENDER.MALE) globalMales++;
        else globalFemales++;
    }

    // Evaluate if civilization is at risk of gender extinction (if under 25% or flat < 15)
    const totalPop = agents.length;
    let criticallyScarceGender = null;
    if ((globalMales < totalPop * 0.25 || globalMales < 15) && globalMales < globalFemales) {
        criticallyScarceGender = GENDER.MALE;
    } else if ((globalFemales < totalPop * 0.25 || globalFemales < 15) && globalFemales < globalMales) {
        criticallyScarceGender = GENDER.FEMALE;
    }

    for (let i = 0; i < agents.length; i++) {
        agents[i].isDesperate = (tribeCounts[agents[i].tribe] < 12);
        agents[i].seeksScarceGender = (criticallyScarceGender && agents[i].gender !== criticallyScarceGender);
        agents[i].isScarceGender = (agents[i].gender === criticallyScarceGender);
        
        // Pass map dimensions so agents can navigate to Capitals
        agents[i].mapWidth = canvasWidth;
        agents[i].mapHeight = canvasHeight;
    }

    interactionManager.process(agents, particles, foods, worldTick, monsters);
    interactionManager.processMonsterInteractions(agents, monsters, particles, worldTick);
    interactionManager.processMonsterVsMonster(monsters, particles);
    interactionManager.checkGlobalMilestones(agents, worldTick);

    if (CONFIG.ENABLE_HUNGER && worldTick % 30 === 0 && foods.length < CONFIG.MAX_FOOD) {
        foods.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, consumed: false });
    }

    foods = foods.filter(f => !f.consumed);

    agents = agents.filter(a => {
        if (a.markedForDeath) {
            if (a.deathReason === 'exhaustion') {
                interactionManager.stats.exhaustion_deaths++;
            }
            idMap.delete(a.intId);
            return false;
        }
        return true;
    });

    agents.forEach(a => {
        if (!a.intId) {
            a.intId = nextAgentId++;
            idMap.set(a.intId, a);
        }
        a.update(canvasWidth, canvasHeight, worldTick);
    });

    if (CONFIG.ENABLE_MONSTERS) {
        // Periodic Spawning of new monsters automatically
        if (worldTick > 0 && worldTick % CONFIG.MONSTER_SPAWN_INTERVAL === 0) {
            let rx = Math.random() < 0.5 ? rand(-50, 0) : rand(canvasWidth, canvasWidth + 50);
            let ry = rand(-50, canvasHeight + 50);
            const m = new Monster(rx, ry);
            m.intId = nextAgentId++;
            idMap.set(m.intId, m);
            monsters.push(m);
            godEvents.push({ type: 'combat', msg: `🚨 A new Monster has encroached upon the land!` });
        }

        monsters = monsters.filter(m => {
            if (m.markedForDeath) {
                idMap.delete(m.intId);
                return false;
            }
            return true;
        });

        monsters.forEach(m => {
            if (!m.intId) {
                m.intId = nextAgentId++;
                idMap.set(m.intId, m);
            }
            m.steer(agents, foods, worldTick, monsters);
            m.update(canvasWidth, canvasHeight, worldTick, foods);
        });
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Data-Oriented Array Packing (10 floats per agent)
    const agentBuffer = new Float32Array(agents.length * 10);
    let offset = 0;
    let males = 0, females = 0, intro = 0, extro = 0, incest = 0;
    let tribeRed = 0, tribeBlue = 0;

    let totalStr = 0;
    let totalInt = 0;
    let totalSpd = 0;
    let mostProlific = null;
    let strongest = null;

    for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        agentBuffer[offset++] = a.intId;
        agentBuffer[offset++] = a.x;
        agentBuffer[offset++] = a.y;
        agentBuffer[offset++] = a.radius;
        agentBuffer[offset++] = a.gender === GENDER.MALE ? 0 : 1;

        let tInt = 0;
        if (a.tribe === 'Red') { tribeRed++; tInt = 0; }
        else if (a.tribe === 'Blue') { tribeBlue++; tInt = 1; }
        agentBuffer[offset++] = tInt;

        agentBuffer[offset++] = 0; // Padding (previously infection)
        agentBuffer[offset++] = CONFIG.ENABLE_HUNGER ? a.hunger / CONFIG.MAX_HUNGER : 1; // hunger ratio
        agentBuffer[offset++] = CONFIG.ENABLE_COMBAT_WEARINESS ? a.weariness / CONFIG.WEARINESS_MAX : 0; // weariness ratio
        agentBuffer[offset++] = a.isBerserk ? 1 : 0; // 10th float: Manic flag

        if (a.gender === GENDER.MALE) males++; else females++;
        if (a.personality === PERSONALITY.INTROVERT) intro++; else extro++;
        if (a.bornOfIncest) incest++;

        totalStr += a.strength;
        totalInt += a.intelligence;
        totalSpd += a.speed;
        
        // Update All-Time Heroes in InteractionManager
        if (a.offspringCount > interactionManager.allTimeHeroes.prolific.val) {
            interactionManager.allTimeHeroes.prolific = { name: a.name, val: a.offspringCount };
        }
        if (a.strength > interactionManager.allTimeHeroes.strongest.val) {
            interactionManager.allTimeHeroes.strongest = { name: a.name, val: Math.round(a.strength) };
        }
    }

    // Cache latest averages before they potentially go to 0
    if (agents.length > 0) {
        interactionManager.lastStats.avgStr = Math.round(totalStr / agents.length);
        interactionManager.lastStats.avgInt = Math.round(totalInt / agents.length);
        interactionManager.lastStats.avgSpd = Math.round(totalSpd / agents.length);
    }

    const particleBuffer = new Float32Array(particles.length * 4);
    let pOffset = 0;
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        particleBuffer[pOffset++] = p.x;
        particleBuffer[pOffset++] = p.y;
        particleBuffer[pOffset++] = p.life;

        let colorInt = 0;
        if (p.color === '#ef4444') colorInt = 1;
        else if (p.color === '#ffffff') colorInt = 2;
        else if (p.color === '#94a3b8') colorInt = 3;
        else if (p.color === '#f472b6') colorInt = 4; // pink potion
        else if (p.color === '#fbbf24') colorInt = 5; // potential yellow
        particleBuffer[pOffset++] = colorInt;
    }

    const foodBuffer = new Float32Array(foods.length * 2);
    let fOffset = 0;
    for (let i = 0; i < foods.length; i++) {
        foodBuffer[fOffset++] = foods[i].x;
        foodBuffer[fOffset++] = foods[i].y;
    }

    const monsterBuffer = new Float32Array(monsters.length * 5);
    let mOffset = 0;
    for (let i = 0; i < monsters.length; i++) {
        monsterBuffer[mOffset++] = monsters[i].x;
        monsterBuffer[mOffset++] = monsters[i].y;
        monsterBuffer[mOffset++] = monsters[i].radius;
        monsterBuffer[mOffset++] = monsters[i].hp / monsters[i].maxHp; // hp ratio for visual indicator
        monsterBuffer[mOffset++] = CONFIG.ENABLE_HUNGER ? (monsters[i].hunger / CONFIG.MAX_HUNGER) : 1; // hunger ratio
    }

    let selectedAgentData = null;
    if (selectedAgentId && idMap.has(selectedAgentId)) {
        const a = idMap.get(selectedAgentId);
        if (a instanceof Monster) {
            selectedAgentData = {
                id: a.intId,
                name: 'Aberrant Monster',
                gender: 'N/A',
                age: 'Immortal',
                stage: 'Apex Predator',
                strength: a.strength,
                intelligence: a.intelligence,
                speed: 'N/A',
                offspringCount: 'N/A',
                bornOfIncest: 'N/A',
                personality: 'Bloodthirsty',
                libido: 'N/A',
                fighter: 100,
                charm: 'N/A',
                prefMinStrength: 'N/A',
                prefMinIntelligence: 'N/A',
                prefPersonality: 'N/A',
                weariness: 'N/A',
            };
        } else {
            selectedAgentData = {
                id: a.intId,
                name: a.name,
                gender: a.gender,
                age: a.getAge(worldTick),
                stage: a.getLifeStage(worldTick),
                strength: a.strength,
                intelligence: a.intelligence,
                speed: Math.round(a.speed),
                offspringCount: a.offspringCount,
                bornOfIncest: a.bornOfIncest,
                personality: a.personality,
                libido: a.libido,
                fighter: a.fighter,
                charm: a.charm,
                prefMinStrength: a.prefMinStrength,
                prefMinIntelligence: a.prefMinIntelligence,
                prefPersonality: a.prefPersonality,
                weariness: Math.round(a.weariness),
                isBerserk: a.isBerserk,
            };
        }
    } else if (selectedAgentId) {
        selectedAgentData = { dead: true };
    }

    const payload = {
        type: 'RENDER',
        worldTick,
        stats: {
            encounters: interactionManager.stats.encounters,
            kills: interactionManager.stats.kills,
            repros: interactionManager.stats.reproduction_successes,
            born: interactionManager.stats.offspring_born,
            incest_born: interactionManager.stats.incest_born,
            natural_deaths: interactionManager.stats.natural_deaths,
            exhaustion_deaths: interactionManager.stats.exhaustion_deaths,
            peak_pop: interactionManager.peakPop,
            monster_births: interactionManager.stats.monster_births,
            monster_fights: interactionManager.stats.monster_fights,
            monster_deaths: interactionManager.stats.monster_deaths
        },
        demographics: {
            pop: agents.length,
            males, females, intro, extro, incest,
            tribeRed, tribeBlue, foodCount: foods.length, monsterCount: monsters.length
        },
        analytics: {
            avgStr: interactionManager.lastStats.avgStr || '-',
            avgInt: interactionManager.lastStats.avgInt || '-',
            avgSpd: interactionManager.lastStats.avgSpd || '-',
            prolificName: interactionManager.allTimeHeroes.prolific.name,
            prolificCount: interactionManager.allTimeHeroes.prolific.val,
            strongestName: interactionManager.allTimeHeroes.strongest.name,
            strongestStr: interactionManager.allTimeHeroes.strongest.val
        },
        events: [...interactionManager.events, ...godEvents],
        milestones: interactionManager.milestones,
        statHistory: interactionManager.statHistory,
        selectedAgent: selectedAgentData,
        agentBuffer: agentBuffer.buffer,
        particleBuffer: particleBuffer.buffer,
        foodBuffer: foodBuffer.buffer,
        monsterBuffer: monsterBuffer.buffer
    };

    interactionManager.events = [];
    godEvents = [];

    self.postMessage(payload, [agentBuffer.buffer, particleBuffer.buffer, foodBuffer.buffer, monsterBuffer.buffer]);

    timeoutId = setTimeout(runLoop, 16);
}

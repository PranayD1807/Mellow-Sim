import { CONFIG, GENDER } from './config.js?v=123456';

export class SimulationEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.isPaused = false;
        this.selectedAgentId = null;
        this.isGameOverFlag = false;
        this.currentGodAction = 'select';

        this.renderData = null;
        this.latestAgentBuffer = null;

        // Spawn precise Data-Oriented Web Worker
        this.worker = new Worker('./src/worker.js?v=123456', { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

        this.bindEvents();
        this.resize();

        this.loop = this.loop.bind(this);
    }

    handleWorkerMessage(e) {
        const data = e.data;
        if (data.type === 'RENDER') {
            this.renderData = data;
            // Store a persistent reference so clicks don't get silently ignored when renderData is temporarily consumed
            this.latestAgentBuffer = data.agentBuffer;
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('click', (e) => {
            if (!this.latestAgentBuffer && this.currentGodAction === 'select') return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (this.currentGodAction !== 'select') {
                this.worker.postMessage({
                    type: 'GOD_ACT',
                    action: this.currentGodAction,
                    x: mouseX,
                    y: mouseY
                });
                return;
            }

            const clickRadius = Math.max(CONFIG.SPRITE_SIZE * 2.5, 40); // Much more generous click area for fast-moving targets
            const sqRadius = clickRadius * clickRadius;

            if (!this.latestAgentBuffer) return;
            const aBuffer = new Float32Array(this.latestAgentBuffer);

            let clickedId = null;
            for (let i = 0; i < aBuffer.length; i += 10) {
                const id = aBuffer[i];
                const x = aBuffer[i + 1];
                const y = aBuffer[i + 2];
                const dx = x - mouseX;
                const dy = y - mouseY;

                if ((dx * dx + dy * dy) <= sqRadius) {
                    clickedId = id;
                    break;
                }
            }

            if (clickedId !== null) {
                this.selectedAgentId = clickedId;
                document.getElementById('entity-stats-panel').classList.remove('hidden');
                this.worker.postMessage({ type: 'SELECT', id: clickedId });
            } else {
                this.selectedAgentId = null;
                document.getElementById('entity-stats-panel').classList.add('hidden');
                this.worker.postMessage({ type: 'SELECT', id: null });
            }
        });

        const godBtns = document.querySelectorAll('.btn-god');
        godBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                godBtns.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                this.currentGodAction = target.getAttribute('data-action');
            });
        });

        document.getElementById('btn-pause').addEventListener('click', (e) => {
            this.isPaused = !this.isPaused;
            e.target.innerText = this.isPaused ? 'Resume' : 'Pause';
            this.worker.postMessage({ type: 'PAUSE', isPaused: this.isPaused });
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.reset();
        });
        document.getElementById('btn-go-restart').addEventListener('click', () => {
            this.reset();
            this.isPaused = false;
            this.worker.postMessage({ type: 'PAUSE', isPaused: false });
        });

        // Start screen logic
        document.getElementById('btn-show-start-dialog').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('hidden');
            document.getElementById('start-actions').style.display = 'flex';
        });

        document.getElementById('btn-launch-sim').addEventListener('click', () => {
            const updates = {
                INITIAL_RED_MALES: parseInt(document.getElementById('cfg-init-red-males').value) || 0,
                INITIAL_RED_FEMALES: parseInt(document.getElementById('cfg-init-red-females').value) || 0,
                INITIAL_BLUE_MALES: parseInt(document.getElementById('cfg-init-blue-males').value) || 0,
                INITIAL_BLUE_FEMALES: parseInt(document.getElementById('cfg-init-blue-females').value) || 0,
                AWARENESS_RADIUS: parseInt(document.getElementById('cfg-awareness-radius').value) || 200,
                INTERACTION_RADIUS: parseInt(document.getElementById('cfg-interaction-radius').value) || 25,
                ENABLE_SHOW_AWARENESS: document.getElementById('cfg-show-awareness').checked,
                ENABLE_SHOW_INTERACTION: document.getElementById('cfg-show-interaction').checked,

                MAX_FOOD: parseInt(document.getElementById('cfg-max-food').value) || 250,
                FOOD_NUTRITION: parseInt(document.getElementById('cfg-food-nut').value) || 1500,
                ENABLE_TRIBES: document.getElementById('cfg-tribes').checked,
                ENABLE_HUNGER: document.getElementById('cfg-hunger').checked,
                MAX_AGE: parseInt(document.getElementById('cfg-max-age').value) || 75,
                TICKS_PER_YEAR: parseInt(document.getElementById('cfg-ticks-yr').value) || 60,
                MAX_SPEED: parseFloat(document.getElementById('cfg-speed').value) || 0.5,

                ENABLE_FIGHTING: document.getElementById('cfg-fighting').checked,
                ENABLE_REPRODUCTION: document.getElementById('cfg-repro').checked,
                ENABLE_AGING: document.getElementById('cfg-aging').checked,
                ENABLE_INCEST_PENALTY: document.getElementById('cfg-incest').checked,
                ENABLE_PREF_DEGRADE: document.getElementById('cfg-pref').checked,
                ENABLE_MAX_POPULATION: document.getElementById('cfg-limit-pop').checked,
                MAX_POPULATION: parseInt(document.getElementById('cfg-max-pop').value) || 300,
                MUTATION_RATE: parseFloat(document.getElementById('cfg-mutation').value) || 0.15,
                ENABLE_COMBAT_WEARINESS: document.getElementById('cfg-weariness').checked,
                ENABLE_MONSTERS: document.getElementById('cfg-monsters').checked,
                INITIAL_MONSTERS: parseInt(document.getElementById('cfg-init-monsters').value) || 2,

                // New Settings
                INITIAL_MIN_AGE: parseInt(document.getElementById('cfg-init-age-min').value) || 18,
                INITIAL_MAX_AGE: parseInt(document.getElementById('cfg-init-age-max').value) || 30,
                MAX_HUNGER: parseInt(document.getElementById('cfg-max-hunger').value) || 3000,
                STARVATION_RATE: parseFloat(document.getElementById('cfg-starve-rate').value) || 1,
                MONSTER_SPEED: parseFloat(document.getElementById('cfg-monster-speed').value) || 0.45,
                MONSTER_AWARENESS: parseInt(document.getElementById('cfg-monster-awareness').value) || 600,
                MONSTER_SPAWN_INTERVAL: parseInt(document.getElementById('cfg-monster-spawn').value) || 1800,
                REPRODUCTION_COOLDOWN: parseInt(document.getElementById('cfg-repro-cooldown').value) || 100,
                PREF_DEGRADE_INTERVAL: parseInt(document.getElementById('cfg-pref-interval').value) || 150,
                CHILD_AGE: parseInt(document.getElementById('cfg-child-age').value) || 12,
                TEEN_AGE: parseInt(document.getElementById('cfg-teen-age').value) || 18,
                ELDER_AGE: parseInt(document.getElementById('cfg-elder-age').value) || 60,
                STEER_STRENGTH: parseFloat(document.getElementById('cfg-steer').value) || 0.04,
                FOOD_ATTRACTION: parseFloat(document.getElementById('cfg-food-attract').value) || 0.15,
                AGENT_RADIUS: parseInt(document.getElementById('cfg-agent-radius').value) || 15,
                SPRITE_SIZE: parseInt(document.getElementById('cfg-agent-radius').value) || 15
            };

            for (const [key, value] of Object.entries(updates)) {
                CONFIG[key] = value;
                this.worker.postMessage({ type: 'CONFIG', key, value });
            }

            this.worker.postMessage({
                type: 'INIT',
                width: this.canvas.width,
                height: this.canvas.height
            });

            document.getElementById('settings-modal').classList.add('hidden');
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('start-actions').style.display = 'none';

            // Re-hide init state fields after start
            document.getElementById('row-init-red-males').style.display = 'none';
            document.getElementById('row-init-red-females').style.display = 'none';
            document.getElementById('row-init-blue-males').style.display = 'none';
            document.getElementById('row-init-blue-females').style.display = 'none';
            document.getElementById('row-init-age').style.display = 'none';
            document.getElementById('row-init-monsters').style.display = 'none';
            document.getElementById('monster-extra-settings').style.display = 'none';
        });

        // Modal logic
        const settingsModal = document.getElementById('settings-modal');
        document.getElementById('btn-open-settings').addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
        document.getElementById('btn-close-settings').addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
        document.getElementById('settings-backdrop').addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        // Demographics panel logic
        const statsPanel = document.getElementById('stats-panel');
        const btnOpenStats = document.getElementById('btn-open-stats');
        document.getElementById('btn-close-stats').addEventListener('click', () => {
            statsPanel.classList.add('hidden');
            btnOpenStats.classList.remove('hidden');
        });
        btnOpenStats.addEventListener('click', () => {
            statsPanel.classList.remove('hidden');
            btnOpenStats.classList.add('hidden');
        });

        const updateConfig = (key, val) => {
            CONFIG[key] = val;
            this.worker.postMessage({ type: 'CONFIG', key, value: val });
        };

        // Settings bindings
        document.getElementById('cfg-fighting').addEventListener('change', e => updateConfig('ENABLE_FIGHTING', e.target.checked));
        document.getElementById('cfg-repro').addEventListener('change', e => updateConfig('ENABLE_REPRODUCTION', e.target.checked));
        document.getElementById('cfg-aging').addEventListener('change', e => updateConfig('ENABLE_AGING', e.target.checked));
        document.getElementById('cfg-incest').addEventListener('change', e => updateConfig('ENABLE_INCEST_PENALTY', e.target.checked));
        document.getElementById('cfg-pref').addEventListener('change', e => updateConfig('ENABLE_PREF_DEGRADE', e.target.checked));
        document.getElementById('cfg-limit-pop').addEventListener('change', e => updateConfig('ENABLE_MAX_POPULATION', e.target.checked));

        document.getElementById('cfg-max-pop').addEventListener('change', e => updateConfig('MAX_POPULATION', parseInt(e.target.value)));
        document.getElementById('cfg-mutation').addEventListener('change', e => updateConfig('MUTATION_RATE', parseFloat(e.target.value)));
        document.getElementById('cfg-awareness-radius').addEventListener('change', e => updateConfig('AWARENESS_RADIUS', parseInt(e.target.value)));
        document.getElementById('cfg-show-awareness').addEventListener('change', e => updateConfig('ENABLE_SHOW_AWARENESS', e.target.checked));
        document.getElementById('cfg-interaction-radius').addEventListener('change', e => updateConfig('INTERACTION_RADIUS', parseInt(e.target.value)));
        document.getElementById('cfg-show-interaction').addEventListener('change', e => updateConfig('ENABLE_SHOW_INTERACTION', e.target.checked));

        // New Settings bindings
        document.getElementById('cfg-monsters').addEventListener('change', e => updateConfig('ENABLE_MONSTERS', e.target.checked));
        document.getElementById('cfg-max-food').addEventListener('change', e => updateConfig('MAX_FOOD', parseInt(e.target.value)));
        document.getElementById('cfg-food-nut').addEventListener('change', e => updateConfig('FOOD_NUTRITION', parseInt(e.target.value)));
        document.getElementById('cfg-tribes').addEventListener('change', e => updateConfig('ENABLE_TRIBES', e.target.checked));
        document.getElementById('cfg-hunger').addEventListener('change', e => updateConfig('ENABLE_HUNGER', e.target.checked));
        document.getElementById('cfg-max-age').addEventListener('change', e => updateConfig('MAX_AGE', parseInt(e.target.value)));
        document.getElementById('cfg-ticks-yr').addEventListener('change', e => updateConfig('TICKS_PER_YEAR', parseInt(e.target.value)));
        document.getElementById('cfg-speed').addEventListener('change', e => updateConfig('MAX_SPEED', parseFloat(e.target.value)));
        document.getElementById('cfg-weariness').addEventListener('change', e => updateConfig('ENABLE_COMBAT_WEARINESS', e.target.checked));

        // New Settings real-time bindings
        document.getElementById('cfg-max-hunger').addEventListener('change', e => updateConfig('MAX_HUNGER', parseInt(e.target.value)));
        document.getElementById('cfg-starve-rate').addEventListener('change', e => updateConfig('STARVATION_RATE', parseFloat(e.target.value)));
        document.getElementById('cfg-monster-speed').addEventListener('change', e => updateConfig('MONSTER_SPEED', parseFloat(e.target.value)));
        document.getElementById('cfg-monster-awareness').addEventListener('change', e => updateConfig('MONSTER_AWARENESS', parseInt(e.target.value)));
        document.getElementById('cfg-monster-spawn').addEventListener('change', e => updateConfig('MONSTER_SPAWN_INTERVAL', parseInt(e.target.value)));
        document.getElementById('cfg-repro-cooldown').addEventListener('change', e => updateConfig('REPRODUCTION_COOLDOWN', parseInt(e.target.value)));
        document.getElementById('cfg-pref-interval').addEventListener('change', e => updateConfig('PREF_DEGRADE_INTERVAL', parseInt(e.target.value)));
        document.getElementById('cfg-child-age').addEventListener('change', e => updateConfig('CHILD_AGE', parseInt(e.target.value)));
        document.getElementById('cfg-teen-age').addEventListener('change', e => updateConfig('TEEN_AGE', parseInt(e.target.value)));
        document.getElementById('cfg-elder-age').addEventListener('change', e => updateConfig('ELDER_AGE', parseInt(e.target.value)));
        document.getElementById('cfg-steer').addEventListener('change', e => updateConfig('STEER_STRENGTH', parseFloat(e.target.value)));
        document.getElementById('cfg-food-attract').addEventListener('change', e => updateConfig('FOOD_ATTRACTION', parseFloat(e.target.value)));
        document.getElementById('cfg-agent-radius').addEventListener('change', e => {
            const val = parseInt(e.target.value);
            updateConfig('AGENT_RADIUS', val);
            updateConfig('SPRITE_SIZE', val);
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.worker.postMessage({ type: 'RESIZE', width: this.canvas.width, height: this.canvas.height });
    }

    reset() {
        this.selectedAgentId = null;
        this.isGameOverFlag = false;
        document.getElementById('entity-stats-panel').classList.add('hidden');
        document.getElementById('game-over-modal').classList.add('hidden');
        this.worker.postMessage({ type: 'RESET' });
    }

    updateUI(data) {
        document.getElementById('stat-population').innerText = data.demographics.pop;
        document.getElementById('stat-males').innerText = data.demographics.males;
        document.getElementById('stat-females').innerText = data.demographics.females;
        document.getElementById('stat-introverts').innerText = data.demographics.intro;
        document.getElementById('stat-extroverts').innerText = data.demographics.extro;
        document.getElementById('stat-incest-current').innerText = data.demographics.incest;

        document.getElementById('stat-infected').innerText = data.demographics.infectedCount;
        document.getElementById('stat-food').innerText = data.demographics.foodCount;

        document.getElementById('stat-tribe-red').innerText = data.demographics.tribeRed;
        document.getElementById('stat-tribe-blue').innerText = data.demographics.tribeBlue;
        document.getElementById('stat-monsters').innerText = data.demographics.monsterCount || 0;
        if (document.getElementById('stat-monster-births')) {
            document.getElementById('stat-monster-births').innerText = data.stats.monster_births || 0;
            document.getElementById('stat-monster-fights').innerText = data.stats.monster_fights || 0;
            document.getElementById('stat-monster-deaths').innerText = data.stats.monster_deaths || 0;
        }

        document.getElementById('stat-encounters').innerText = data.stats.encounters;
        document.getElementById('stat-kills').innerText = data.stats.kills;
        document.getElementById('stat-repros').innerText = data.stats.repros;
        document.getElementById('stat-born').innerText = data.stats.born;
        document.getElementById('stat-incest-total').innerText = data.stats.incest_born;
        document.getElementById('stat-natural-deaths').innerText = data.stats.natural_deaths;
        document.getElementById('stat-exhaustion-deaths').innerText = data.stats.exhaustion_deaths || 0;

        // World clock
        const worldYear = Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR);
        document.getElementById('world-clock').innerText = `Year ${worldYear}`;
    }

    drawFrame(data) {
        this.ctx.fillStyle = CONFIG.BG_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const aBuffer = new Float32Array(data.agentBuffer);

        for (let i = 0; i < aBuffer.length; i += 10) {
            const id = aBuffer[i];
            const x = aBuffer[i + 1];
            const y = aBuffer[i + 2];
            const s = aBuffer[i + 3]; // Size/radius
            const isFemale = aBuffer[i + 4] === 1;
            const tInt = aBuffer[i + 5];
            const isInfected = aBuffer[i + 6] === 1;
            const isBerserk = aBuffer[i + 9] === 1;

            let color = '#ef4444'; // Red default
            if (tInt === 1) color = '#3b82f6';

            const h = s / 2;

            this.ctx.save();

            // Render Bloom/Glow
            if (isBerserk) {
                const pulse = 10 + Math.sin(Date.now() / 150) * 15;
                this.ctx.shadowBlur = pulse;
                this.ctx.shadowColor = '#9333ea'; // Purple-600 (Vibrant Purple)
                this.ctx.fillStyle = '#581c87'; // Purple-900 (Deep/Dark Purple)
            } else {
                this.ctx.shadowBlur = isInfected ? 20 : 10;
                this.ctx.shadowColor = isInfected ? '#84cc16' : color;
                this.ctx.fillStyle = color;
            }

            if (isInfected && !isBerserk) {
                // Pulse effect or sick color overwrite
                this.ctx.globalAlpha = 0.8;
                this.ctx.fillStyle = '#84cc16';
            }

            if (!isFemale) {
                this.ctx.fillRect(x - h, y - h, s, s);
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - h);
                this.ctx.lineTo(x + h, y + h);
                this.ctx.lineTo(x - h, y + h);
                this.ctx.closePath();
                this.ctx.fill();
            }
            this.ctx.restore();

            // Draw dim awareness glow
            if (CONFIG.ENABLE_SHOW_AWARENESS) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, CONFIG.AWARENESS_RADIUS, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
                this.ctx.fill();
            }

            // Draw dim interaction ring
            if (CONFIG.ENABLE_SHOW_INTERACTION) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, CONFIG.INTERACTION_RADIUS, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                this.ctx.stroke();
            }

            // Draw hunger indicator
            if (CONFIG.ENABLE_HUNGER) {
                const hungerRatio = Math.max(0, Math.min(1, aBuffer[i + 7]));
                this.ctx.beginPath();
                this.ctx.arc(x, y, h + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * hungerRatio));
                const r = Math.floor(255 * (1 - hungerRatio));
                const g = Math.floor(255 * hungerRatio);
                this.ctx.strokeStyle = `rgb(${r}, ${g}, 0)`;
                this.ctx.lineWidth = 1.5;
                this.ctx.stroke();
            }

            // Draw weariness indicator (orange arc, only visible when > 20%)
            if (CONFIG.ENABLE_COMBAT_WEARINESS) {
                const wearinessRatio = Math.max(0, Math.min(1, aBuffer[i + 8]));
                if (wearinessRatio > 0.2) {
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, h + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * wearinessRatio));
                    const orangeAlpha = 0.3 + wearinessRatio * 0.7; // Fades in as weariness increases
                    this.ctx.strokeStyle = `rgba(251, 146, 60, ${orangeAlpha})`; // orange-400
                    this.ctx.lineWidth = 1.5;
                    this.ctx.stroke();
                }
            }

            if (this.selectedAgentId !== null && this.selectedAgentId === id) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, h + 11, 0, Math.PI * 2);
                this.ctx.strokeStyle = '#fbbf24';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                this.ctx.closePath();
            }
        }

        if (data.foodBuffer) {
            const fBuffer = new Float32Array(data.foodBuffer);
            this.ctx.fillStyle = '#a3e635'; // Food color
            for (let i = 0; i < fBuffer.length; i += 2) {
                const fx = fBuffer[i];
                const fy = fBuffer[i + 1];
                this.ctx.beginPath();
                this.ctx.arc(fx, fy, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        const pBuffer = new Float32Array(data.particleBuffer);
        for (let i = 0; i < pBuffer.length; i += 4) {
            const px = pBuffer[i];
            const py = pBuffer[i + 1];
            const alpha = pBuffer[i + 2];
            const cType = pBuffer[i + 3];

            let pColor = '#ffffff';
            if (cType === 1) pColor = '#ef4444';
            else if (cType === 3) pColor = '#94a3b8';
            else if (cType === 4) pColor = '#f472b6'; // Potion pink
            else if (cType === 5) pColor = '#fbbf24'; // Yellow spark

            this.ctx.globalAlpha = Math.max(0, alpha);
            this.ctx.fillStyle = pColor;
            this.ctx.beginPath();
            this.ctx.arc(px, py, 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        }

        if (data.monsterBuffer) {
            const mBuffer = new Float32Array(data.monsterBuffer);
            for (let i = 0; i < mBuffer.length; i += 5) {
                const mx = mBuffer[i];
                const my = mBuffer[i + 1];
                const mr = mBuffer[i + 2];
                const hpRatio = mBuffer[i + 3];
                const hungerRatio = mBuffer[i + 4]; this.ctx.save();
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#FF7400'; // Amber Glow
                this.ctx.fillStyle = '#FFCE00'; // Gold Body

                // Draw irregular blob shape
                this.ctx.beginPath();
                const points = 16;
                for (let j = 0; j <= points; j++) {
                    const angle = (j / points) * Math.PI * 2;
                    // Use sinusoidal offsets with integer multipliers to ensure shape connects seamlessly at 0 and 2pi
                    const offset = Math.sin(angle * 5) * (mr * 0.15) + Math.cos(angle * 4 + mx) * (mr * 0.2);
                    const rad = mr + offset;

                    const px = mx + Math.cos(angle) * rad;
                    const py = my + Math.sin(angle) * rad;
                    if (j === 0) this.ctx.moveTo(px, py);
                    else this.ctx.lineTo(px, py);
                }
                this.ctx.closePath();
                this.ctx.fill();

                // Clear shadow for UI elements so they don't glow
                this.ctx.shadowBlur = 0;

                // Hunger Arc (Draw around monster, completely clearing the wobbly blob body)
                if (CONFIG.ENABLE_HUNGER && hungerRatio < 1.0) {
                    this.ctx.beginPath();
                    this.ctx.arc(mx, my, mr * 1.45, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(1, hungerRatio))));
                    const rgbR = Math.floor(255 * (1 - hungerRatio));
                    const rgbG = Math.floor(255 * hungerRatio);
                    this.ctx.strokeStyle = `rgba(${rgbR}, ${rgbG}, 0, 0.8)`;
                    this.ctx.lineWidth = 4;
                    this.ctx.lineCap = 'round';
                    this.ctx.stroke();
                }

                // HP Bar (Draw cleanly above the hunger arc)
                if (hpRatio < 1.0) {
                    const barWidth = mr * 2.2;
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
                    this.ctx.fillRect(mx - barWidth / 2, my - mr * 1.45 - 12, barWidth, 5);
                    this.ctx.fillStyle = '#10b981';
                    this.ctx.fillRect(mx - barWidth / 2, my - mr * 1.45 - 12, barWidth * hpRatio, 5);
                }

                this.ctx.restore();
            }
        }
    }

    loop() {
        if (!this.isPaused && this.renderData) {
            const data = this.renderData;
            this.renderData = null; // Consume frame data

            this.drawFrame(data);
            this.updateUI(data);

            if (data.events && data.events.length > 0) {
                data.events.forEach(ev => this.displayEventLog(ev));
            }

            if (data.selectedAgent) {
                if (data.selectedAgent.dead) {
                    this.selectedAgentId = null;
                    document.getElementById('entity-stats-panel').classList.add('hidden');
                } else {
                    this.updateEntityStatsPanel(data.selectedAgent);
                }
            }

            this.checkGameOver(data);
        }

        requestAnimationFrame(this.loop);
    }

    displayEventLog(event) {
        const container = document.getElementById('event-logs-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `event-log-entry ${event.type}`;
        el.innerText = event.msg;

        container.prepend(el);

        // Remove older logs if there are too many (max 8)
        while (container.children.length > 8) {
            container.removeChild(container.lastChild);
        }

        setTimeout(() => {
            if (el.parentElement) {
                el.classList.add('fade-out');
                setTimeout(() => {
                    if (el.parentElement) el.remove();
                }, 1000);
            }
        }, 5000); // Wait 5 seconds before fading out
    }

    updateEntityStatsPanel(a) {
        if (!a) return;
        document.getElementById('entity-stats-panel').classList.remove('hidden');

        document.getElementById('ent-name').innerText = a.name;
        document.getElementById('ent-gender').innerText = a.gender;
        document.getElementById('ent-gender').style.color = a.gender === 'N/A' ? '#a1a1aa' : (a.gender === 'Male' ? '#60a5fa' : '#f472b6');

        const ageEl = document.getElementById('ent-age');
        if (a.age === 'Immortal') {
            ageEl.innerText = `Immortal`;
            ageEl.style.color = '#ef4444';
        } else {
            ageEl.innerText = `${a.age} (${a.stage})`;
            if (a.stage === 'Child') ageEl.style.color = '#86efac';
            else if (a.stage === 'Teen') ageEl.style.color = '#fde68a';
            else if (a.stage === 'Adult') ageEl.style.color = '#f8fafc';
            else ageEl.style.color = '#94a3b8';
        }

        document.getElementById('ent-strength').innerText = a.strength;
        document.getElementById('ent-intelligence').innerText = a.intelligence;
        document.getElementById('ent-speed').innerText = a.speed !== undefined && a.speed !== 'N/A' ? `${a.speed} / 100` : (a.speed || 'N/A');
        document.getElementById('ent-offspring').innerText = a.offspringCount;

        const incestEl = document.getElementById('ent-incest');
        incestEl.innerText = a.bornOfIncest === 'N/A' ? 'N/A' : (a.bornOfIncest ? "Yes" : "No");
        incestEl.style.color = a.bornOfIncest === 'N/A' ? '#a1a1aa' : (a.bornOfIncest ? "#ef4444" : "#10b981");

        // Personality & Drives
        document.getElementById('ent-personality').innerText = a.personality;
        document.getElementById('ent-personality').style.color = a.personality === 'Bloodthirsty' ? '#ef4444' : (a.personality === 'Introvert' ? '#818cf8' : '#34d399');
        document.getElementById('ent-libido').innerText = a.libido;
        document.getElementById('ent-fighter').innerText = a.fighter;
        document.getElementById('ent-weariness').innerText = a.weariness !== undefined ? a.weariness : 0;
        document.getElementById('ent-charm').innerText = a.charm;

        // Berserk Status
        const statusEl = document.getElementById('ent-status');
        if (a.isBerserk) {
            statusEl.innerText = "BERSERK (RAGE)";
            statusEl.style.color = "#a855f7"; // purple-500
        } else {
            statusEl.innerText = "Stable";
            statusEl.style.color = "#10b981";
        }

        // Partner Preferences
        document.getElementById('ent-pref-str').innerText = a.prefMinStrength;
        document.getElementById('ent-pref-int').innerText = a.prefMinIntelligence;
        document.getElementById('ent-pref-pers').innerText = (a.prefPersonality === 'none' || a.prefPersonality === 'N/A') ? 'Any' : a.prefPersonality;
    }

    checkGameOver(data) {
        if (this.isPaused || this.isGameOverFlag) return;

        let reason = null;
        if (data.demographics.pop === 0 && data.demographics.monsterCount > 0) {
            reason = "EATEN ALIVE: Monsters devoured humanity.";
        } else if (data.demographics.pop === 0) {
            reason = "EXTINCTION EVENT: The entire population was wiped out.";
        } else if (CONFIG.ENABLE_MAX_POPULATION && data.demographics.pop >= CONFIG.MAX_POPULATION) {
            reason = "OVERPOPULATION: The world reached its max carrying capacity.";
        }

        if (reason) {
            this.showGameOver(reason, data);
        }
    }

    showGameOver(reason, data) {
        this.isGameOverFlag = true;
        this.isPaused = true;
        this.worker.postMessage({ type: 'PAUSE', isPaused: true }); // Make sure worker halts

        const setStat = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setStat('go-reason', reason);
        setStat('go-years', Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR));
        setStat('go-pop', data.demographics.pop);
        setStat('go-peak', data.stats.peak_pop || 0);

        setStat('go-encounters', data.stats.encounters);
        setStat('go-kills', data.stats.kills);
        setStat('go-repros', data.stats.repros);
        setStat('go-born', data.stats.born);
        setStat('go-incest', data.stats.incest_born);
        setStat('go-natural', data.stats.natural_deaths);

        setStat('go-avg-str', data.analytics.avgStr);
        setStat('go-avg-int', data.analytics.avgInt);
        setStat('go-avg-spd', data.analytics.avgSpd || '-');

        setStat('go-monster-pop', data.demographics.monsterCount || 0);
        setStat('go-monster-deaths', data.stats.monster_deaths || 0);
        setStat('go-monster-fights', data.stats.monster_fights || 0);
        setStat('go-monster-births', data.stats.monster_births || 0);

        if (data.analytics.prolificCount > 0) {
            setStat('go-prolific', `${data.analytics.prolificName} (${data.analytics.prolificCount} children)`);
        } else {
            setStat('go-prolific', 'None');
        }

        if (data.analytics.strongestStr > 0) {
            setStat('go-strongest', `${data.analytics.strongestName} (${data.analytics.strongestStr} STR)`);
        } else {
            setStat('go-strongest', 'None');
        }

        // Render History Track
        const track = document.getElementById('go-history-track');
        track.innerHTML = '';
        if (data.milestones && data.milestones.length > 0) {
            data.milestones.forEach(m => {
                const row = document.createElement('div');
                let color = '#d1d5db'; // default info
                if (m.type === 'danger') color = '#ef4444';
                if (m.type === 'warning') color = '#fbbf24';
                if (m.type === 'success') color = '#10b981';

                row.innerHTML = `<span style="color: var(--text-muted); font-weight: 700;">Year ${m.year}:</span> <span style="color: ${color};">${m.msg}</span>`;
                track.appendChild(row);
            });
        } else {
            track.innerHTML = '<div style="color: var(--text-muted); text-align: center; font-style: italic;">No notable history recorded.</div>';
        }

        // Unhide the modal first so dimensions are non-zero
        document.getElementById('game-over-modal').classList.remove('hidden');

        // Render demographic chart after a tiny reflow delay
        setTimeout(() => {
            this.renderStatsChart(data.statHistory);
            this.renderPopChart(data.statHistory);
        }, 50);
    }

    renderStatsChart(history) {
        const canvas = document.getElementById('go-stats-chart');
        if (!canvas || !history || history.length === 0) {
            // No data at all
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.font = 'italic 12px Inter';
                ctx.textAlign = 'center';
                ctx.fillText('No historical data recorded', canvas.width / 2, canvas.height / 2);
            }
            return;
        }

        // Match resolution
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const padding = 25;

        ctx.clearRect(0, 0, w, h);

        // Grid lines (horizontal)
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            let y = padding + (h - padding * 2) * (i / 4);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(w - padding, y);
            ctx.stroke();

            // Y-axis labels (0, 25, 50, 75, 100)
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '9px Inter';
            ctx.fillText(100 - i * 25, 2, y + 3);
            ctx.setLineDash([5, 5]);
        }
        ctx.setLineDash([]);

        const xStep = (w - padding * 2) / Math.max(1, history.length - 1);
        const getY = (val) => h - padding - (val / 100) * (h - padding * 2);

        if (history.length === 1) {
            // Draw Genesis Dots
            const x = padding;
            ctx.fillStyle = '#f87171'; // STR
            ctx.beginPath(); ctx.arc(x, getY(history[0].avgStr), 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#60a5fa'; // INT
            ctx.beginPath(); ctx.arc(x, getY(history[0].avgInt), 5, 0, Math.PI * 2); ctx.fill();
            if (history[0].avgSpd !== undefined) {
                ctx.fillStyle = '#fbbf24'; // SPD
                ctx.beginPath(); ctx.arc(x, getY(history[0].avgSpd), 5, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            // Gradient Area Fills (Strength)
            const strGrad = ctx.createLinearGradient(0, padding, 0, h - padding);
            strGrad.addColorStop(0, 'rgba(248, 113, 113, 0.2)');
            strGrad.addColorStop(1, 'rgba(248, 113, 113, 0)');

            ctx.beginPath();
            ctx.fillStyle = strGrad;
            history.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.avgStr);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.lineTo(padding + (history.length - 1) * xStep, h - padding);
            ctx.lineTo(padding, h - padding);
            ctx.closePath();
            ctx.fill();

            // Strength Line
            ctx.beginPath();
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            history.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.avgStr);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Gradient Area Fills (Intelligence)
            const intGrad = ctx.createLinearGradient(0, padding, 0, h - padding);
            intGrad.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
            intGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');

            ctx.beginPath();
            ctx.fillStyle = intGrad;
            history.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.avgInt);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.lineTo(padding + (history.length - 1) * xStep, h - padding);
            ctx.lineTo(padding, h - padding);
            ctx.closePath();
            ctx.fill();

            // Intelligence Line
            ctx.beginPath();
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            history.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.avgInt);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Gradient Area Fill (Speed)
            const spdData = history.filter(pt => pt.avgSpd !== undefined);
            if (spdData.length > 0) {
                const spdGrad = ctx.createLinearGradient(0, padding, 0, h - padding);
                spdGrad.addColorStop(0, 'rgba(251, 191, 36, 0.15)');
                spdGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');

                const spdXStep = (w - padding * 2) / Math.max(1, spdData.length - 1);
                ctx.beginPath();
                ctx.fillStyle = spdGrad;
                spdData.forEach((pt, i) => {
                    const x = padding + i * spdXStep;
                    const y = getY(pt.avgSpd);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.lineTo(padding + (spdData.length - 1) * spdXStep, h - padding);
                ctx.lineTo(padding, h - padding);
                ctx.closePath();
                ctx.fill();

                // Speed Line
                ctx.beginPath();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]);
                ctx.lineJoin = 'round';
                spdData.forEach((pt, i) => {
                    const x = padding + i * spdXStep;
                    const y = getY(pt.avgSpd);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();
                ctx.setLineDash([]);
            }

        } // end else (history.length > 1)

        // Legend
        ctx.textAlign = 'left';
        ctx.font = 'bold 10px Inter';
        ctx.fillStyle = '#f87171';
        ctx.fillText('STR', padding, h - 5);
        ctx.fillStyle = '#60a5fa';
        ctx.fillText('INT', padding + 36, h - 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('⚡SPD', padding + 68, h - 5);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'right';
        const displayYear = history[history.length - 1].year;
        ctx.fillText(`YEAR ${displayYear}`, w - padding, h - 5);
    }

    renderPopChart(history) {
        const canvas = document.getElementById('go-pop-chart');
        if (!canvas) return;

        if (!history || history.length === 0 || !history.some(h => h.pop !== undefined)) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = 'italic 12px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('No historical data recorded', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Match resolution
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const padding = 25;

        ctx.clearRect(0, 0, w, h);

        const popData = history.filter(pt => pt.pop !== undefined);
        const maxPop = Math.max(...popData.map(pt => pt.pop), 1);
        const xStep = (w - padding * 2) / Math.max(1, popData.length - 1);
        const getY = (val) => h - padding - (val / maxPop) * (h - padding * 2);

        // Horizontal grid lines
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (h - padding * 2) * (i / 4);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(w - padding, y);
            ctx.stroke();

            // Y-axis labels
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '9px Inter';
            ctx.textAlign = 'right';
            const labelVal = Math.round(maxPop * (1 - i / 4));
            ctx.fillText(labelVal, padding - 3, y + 3);
            ctx.setLineDash([5, 5]);
        }
        ctx.setLineDash([]);

        if (popData.length === 1) {
            ctx.fillStyle = '#34d399';
            ctx.beginPath();
            ctx.arc(padding, getY(popData[0].pop), 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Gradient area fill
            const grad = ctx.createLinearGradient(0, padding, 0, h - padding);
            grad.addColorStop(0, 'rgba(52, 211, 153, 0.35)');
            grad.addColorStop(1, 'rgba(52, 211, 153, 0)');

            ctx.beginPath();
            ctx.fillStyle = grad;
            popData.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.pop);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.lineTo(padding + (popData.length - 1) * xStep, h - padding);
            ctx.lineTo(padding, h - padding);
            ctx.closePath();
            ctx.fill();

            // Population line
            ctx.beginPath();
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            popData.forEach((pt, i) => {
                const x = padding + i * xStep;
                const y = getY(pt.pop);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Peak marker
            const peakPt = popData.reduce((best, pt) => pt.pop > best.pop ? pt : best, popData[0]);
            const peakIdx = popData.indexOf(peakPt);
            const peakX = padding + peakIdx * xStep;
            const peakY = getY(peakPt.pop);
            ctx.beginPath();
            ctx.arc(peakX, peakY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
        }

        // Legend
        ctx.textAlign = 'left';
        ctx.font = 'bold 10px Inter';
        ctx.fillStyle = '#34d399';
        ctx.fillText('POPULATION', padding, h - 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('● PEAK', padding + 90, h - 5);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'right';
        const lastYear = popData[popData.length - 1].year;
        ctx.fillText(`YEAR ${lastYear}`, w - padding, h - 5);
    }

    start() {
        requestAnimationFrame(this.loop);
    }
}

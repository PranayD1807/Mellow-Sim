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
            for (let i = 0; i < aBuffer.length; i += 8) {
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
                MUTATION_RATE: parseFloat(document.getElementById('cfg-mutation').value) || 0.15
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
        document.getElementById('cfg-max-food').addEventListener('change', e => updateConfig('MAX_FOOD', parseInt(e.target.value)));
        document.getElementById('cfg-food-nut').addEventListener('change', e => updateConfig('FOOD_NUTRITION', parseInt(e.target.value)));
        document.getElementById('cfg-tribes').addEventListener('change', e => updateConfig('ENABLE_TRIBES', e.target.checked));
        document.getElementById('cfg-hunger').addEventListener('change', e => updateConfig('ENABLE_HUNGER', e.target.checked));
        document.getElementById('cfg-max-age').addEventListener('change', e => updateConfig('MAX_AGE', parseInt(e.target.value)));
        document.getElementById('cfg-ticks-yr').addEventListener('change', e => updateConfig('TICKS_PER_YEAR', parseInt(e.target.value)));
        document.getElementById('cfg-speed').addEventListener('change', e => updateConfig('MAX_SPEED', parseFloat(e.target.value)));
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

        document.getElementById('stat-encounters').innerText = data.stats.encounters;
        document.getElementById('stat-kills').innerText = data.stats.kills;
        document.getElementById('stat-repros').innerText = data.stats.repros;
        document.getElementById('stat-born').innerText = data.stats.born;
        document.getElementById('stat-incest-total').innerText = data.stats.incest_born;
        document.getElementById('stat-natural-deaths').innerText = data.stats.natural_deaths;

        // World clock
        const worldYear = Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR);
        document.getElementById('world-clock').innerText = `Year ${worldYear}`;
    }

    drawFrame(data) {
        this.ctx.fillStyle = CONFIG.BG_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const aBuffer = new Float32Array(data.agentBuffer);

        for (let i = 0; i < aBuffer.length; i += 8) {
            const id = aBuffer[i];
            const x = aBuffer[i + 1];
            const y = aBuffer[i + 2];
            const s = aBuffer[i + 3]; // Size/radius
            const isFemale = aBuffer[i + 4] === 1;
            const tInt = aBuffer[i + 5];
            const isInfected = aBuffer[i + 6] === 1;

            let color = '#ef4444'; // Red default
            if (tInt === 1) color = '#3b82f6';

            const h = s / 2;

            this.ctx.save();
            this.ctx.shadowBlur = isInfected ? 20 : 10;
            this.ctx.shadowColor = isInfected ? '#84cc16' : color;
            this.ctx.fillStyle = color;

            if (isInfected) {
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

            if (this.selectedAgentId !== null && this.selectedAgentId === id) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, h + 8, 0, Math.PI * 2);
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
    }

    loop() {
        if (!this.isPaused && this.renderData) {
            const data = this.renderData;
            this.renderData = null; // Consume frame data

            this.drawFrame(data);
            this.updateUI(data);

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

    updateEntityStatsPanel(a) {
        document.getElementById('ent-name').innerText = a.name;
        document.getElementById('ent-gender').innerText = a.gender;
        document.getElementById('ent-gender').style.color = a.gender === GENDER.MALE ? '#60a5fa' : '#f472b6';
        document.getElementById('ent-age').innerText = `${a.age} (${a.stage})`;

        // Color age by life stage
        const ageEl = document.getElementById('ent-age');
        if (a.stage === 'Child') ageEl.style.color = '#86efac';
        else if (a.stage === 'Teen') ageEl.style.color = '#fde68a';
        else if (a.stage === 'Adult') ageEl.style.color = '#f8fafc';
        else ageEl.style.color = '#94a3b8';

        document.getElementById('ent-strength').innerText = a.strength;
        document.getElementById('ent-intelligence').innerText = a.intelligence;
        document.getElementById('ent-offspring').innerText = a.offspringCount;

        const incestEl = document.getElementById('ent-incest');
        incestEl.innerText = a.bornOfIncest ? "Yes" : "No";
        incestEl.style.color = a.bornOfIncest ? "#ef4444" : "#10b981";

        // Personality & Drives
        document.getElementById('ent-personality').innerText = a.personality;
        document.getElementById('ent-personality').style.color = a.personality === 'Introvert' ? '#818cf8' : '#34d399';
        document.getElementById('ent-libido').innerText = a.libido;
        document.getElementById('ent-fighter').innerText = a.fighter;
        document.getElementById('ent-charm').innerText = a.charm;

        // Partner Preferences
        document.getElementById('ent-pref-str').innerText = a.prefMinStrength;
        document.getElementById('ent-pref-int').innerText = a.prefMinIntelligence;
        document.getElementById('ent-pref-pers').innerText = a.prefPersonality || 'Any';
    }

    checkGameOver(data) {
        if (this.isPaused || this.isGameOverFlag) return;

        let reason = null;
        if (data.demographics.pop === 0) {
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

        document.getElementById('go-reason').innerText = reason;

        const worldYear = Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR);
        document.getElementById('go-years').innerText = worldYear;
        document.getElementById('go-pop').innerText = data.demographics.pop;

        document.getElementById('go-encounters').innerText = data.stats.encounters;
        document.getElementById('go-kills').innerText = data.stats.kills;
        document.getElementById('go-repros').innerText = data.stats.repros;
        document.getElementById('go-born').innerText = data.stats.born;
        document.getElementById('go-natural').innerText = data.stats.natural_deaths;

        document.getElementById('go-avg-str').innerText = data.analytics.avgStr;
        document.getElementById('go-avg-int').innerText = data.analytics.avgInt;

        if (data.analytics.prolificCount > 0) {
            document.getElementById('go-prolific').innerText = `${data.analytics.prolificName} (${data.analytics.prolificCount} children)`;
        } else {
            document.getElementById('go-prolific').innerText = 'None';
        }

        if (data.analytics.strongestStr > 0) {
            document.getElementById('go-strongest').innerText = `${data.analytics.strongestName} (${data.analytics.strongestStr} STR)`;
        } else {
            document.getElementById('go-strongest').innerText = 'None';
        }

        document.getElementById('game-over-modal').classList.remove('hidden');
    }

    start() {
        requestAnimationFrame(this.loop);
    }
}

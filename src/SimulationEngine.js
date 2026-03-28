import { CONFIG, GENDER } from './config.js?v=123456';

export class SimulationEngine {
    constructor(canvasId) {
        this.isPaused = false;
        this.selectedAgentId = null;
        this.isGameOverFlag = false;
        this.currentGodAction = 'select';

        this.renderData = null;
        this.latestAgentBuffer = null;

        // Spawn precise Data-Oriented Web Worker
        this.worker = new Worker('./src/worker.js?v=123456', { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);

        this.initPhaser(canvasId);
        this.bindUIEvents();
    }

    initPhaser(canvasId) {
        const config = {
            type: Phaser.WEBGL,
            width: window.innerWidth,
            height: window.innerHeight,
            canvas: document.getElementById(canvasId),
            backgroundColor: '#0f172a',
            scene: {
                preload: this.preload.bind(this),
                create: this.create.bind(this),
                update: this.update.bind(this)
            },
            fps: {
                target: 60,
                forceSetTimeOut: true
            }
        };

        this.game = new Phaser.Game(config);
    }

    preload() {
        // We'll generate textures programmatically in create
    }

    create() {
        this.scene = this.game.scene.scenes[0];

        // Generate procedural textures
        this.generateTextures();

        // Groups for pooling
        this.agentSprites = new Map();
        this.monsterGraphics = new Map(); // Changed to Map of Graphics for wobbly blobs
        this.foodSprites = [];
        this.particleSprites = [];

        // Layers
        this.foodLayer = this.scene.add.layer();
        this.agentLayer = this.scene.add.layer();
        this.monsterLayer = this.scene.add.layer();
        this.particleLayer = this.scene.add.layer();
        this.uiLayer = this.scene.add.graphics(); // For awareness circles etc.

        // Camera setup
        this.camera = this.scene.cameras.main;
        this.setupCameraControls();

        // Selection ring
        this.selectionRing = this.scene.add.graphics();

        window.addEventListener('resize', () => this.resize());
    }

    generateTextures() {
        // Red Male (Square)
        let graphics = this.scene.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xef4444);
        graphics.fillRect(0, 0, 32, 32);
        graphics.generateTexture('male-red', 32, 32);

        // Blue Male (Square)
        graphics.clear();
        graphics.fillStyle(0x3b82f6);
        graphics.fillRect(0, 0, 32, 32);
        graphics.generateTexture('male-blue', 32, 32);

        // Red Female (Triangle)
        graphics.clear();
        graphics.fillStyle(0xef4444);
        graphics.fillTriangle(16, 0, 32, 32, 0, 32);
        graphics.generateTexture('female-red', 32, 32);

        // Blue Female (Triangle)
        graphics.clear();
        graphics.fillStyle(0x3b82f6);
        graphics.fillTriangle(16, 0, 32, 32, 0, 32);
        graphics.generateTexture('female-blue', 32, 32);

        graphics.clear();
        graphics.fillStyle(0x9333ea);
        graphics.fillTriangle(16, 0, 32, 32, 0, 32);
        graphics.generateTexture('berserk-tri', 32, 32);

        // Monster
        graphics.clear();
        graphics.fillStyle(0xffce00);
        graphics.fillCircle(16, 16, 16);
        graphics.generateTexture('monster-base', 32, 32);

        // Food
        graphics.clear();
        graphics.fillStyle(0xa3e635);
        graphics.fillCircle(4, 4, 4);
        graphics.generateTexture('food', 8, 8);

        // Particle
        graphics.clear();
        graphics.fillStyle(0xffffff);
        graphics.fillCircle(2, 2, 2);
        graphics.generateTexture('particle', 4, 4);
    }

    setupCameraControls() {
        this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            const zoomSpeed = 0.001;
            const newZoom = this.camera.zoom - deltaY * zoomSpeed;
            this.camera.zoom = Phaser.Math.Clamp(newZoom, 0.2, 5);
        });

        this.scene.input.on('pointermove', (pointer) => {
            if (pointer.isDown && this.currentGodAction === 'select') {
                this.camera.scrollX -= (pointer.x - pointer.prevPosition.x) / this.camera.zoom;
                this.camera.scrollY -= (pointer.y - pointer.prevPosition.y) / this.camera.zoom;
            }
        });
    }

    handleWorkerMessage(e) {
        const data = e.data;
        if (data.type === 'RENDER') {
            this.renderData = data;
            this.latestAgentBuffer = data.agentBuffer;
        }
    }

    bindUIEvents() {
        const canvas = document.getElementById('sim-canvas');

        // Input handling via Phaser instead of raw DOM
        // (Wait for scene to be ready)
        const checkScene = setInterval(() => {
            if (this.scene) {
                clearInterval(checkScene);
                this.bindSceneInput();
            }
        }, 100);

        const godBtns = document.querySelectorAll('.btn-god');
        godBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                godBtns.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                this.currentGodAction = target.getAttribute('data-action');
            });
        });

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.addEventListener('click', () => {
                this.isPaused = !this.isPaused;
                this.setText('btn-pause', this.isPaused ? 'Resume' : 'Pause');
                this.worker.postMessage({ type: 'PAUSE', isPaused: this.isPaused });
            });
        }

        document.getElementById('btn-reset').addEventListener('click', () => {
            if (confirm('End the current game and return to the main menu?')) {
                window.location.reload();
            }
        });

        document.getElementById('btn-go-restart').addEventListener('click', () => {
            window.location.reload();
        });

        document.getElementById('btn-show-start-dialog').addEventListener('click', () => {
            this.removeClass('settings-modal', 'hidden');
            this.setDisplay('start-actions', 'flex');
        });

        document.getElementById('btn-launch-sim').addEventListener('click', () => {
            this.launchSimulation();
        });

        // Settings and Panels logic...
        document.getElementById('btn-open-settings').addEventListener('click', () => this.removeClass('settings-modal', 'hidden'));
        document.getElementById('btn-close-settings').addEventListener('click', () => this.addClass('settings-modal', 'hidden'));
        document.getElementById('settings-backdrop').addEventListener('click', () => this.addClass('settings-modal', 'hidden'));

        const statsPanel = document.getElementById('stats-panel');
        const btnOpenStats = document.getElementById('btn-open-stats');
        document.getElementById('btn-close-stats').addEventListener('click', () => {
            this.addClass('stats-panel', 'hidden');
            this.removeClass('btn-open-stats', 'hidden');
        });
        btnOpenStats.addEventListener('click', () => {
            this.removeClass('stats-panel', 'hidden');
            this.addClass('btn-open-stats', 'hidden');
        });

        const CONFIG_MAP = {
            'cfg-fighting': 'ENABLE_FIGHTING',
            'cfg-repro': 'ENABLE_REPRODUCTION',
            'cfg-aging': 'ENABLE_AGING',
            'cfg-incest': 'ENABLE_INCEST_PENALTY',
            'cfg-pref': 'ENABLE_PREF_DEGRADE',
            'cfg-limit-pop': 'ENABLE_MAX_POPULATION',
            'cfg-monsters': 'ENABLE_MONSTERS',
            'cfg-hunger': 'ENABLE_HUNGER',
            'cfg-weariness': 'ENABLE_COMBAT_WEARINESS',
            'cfg-show-awareness': 'ENABLE_SHOW_AWARENESS',
            'cfg-show-interaction': 'ENABLE_SHOW_INTERACTION',
            'cfg-max-pop': 'MAX_POPULATION',
            'cfg-mutation': 'MUTATION_RATE',
            'cfg-awareness-radius': 'AWARENESS_RADIUS',
            'cfg-interaction-radius': 'INTERACTION_RADIUS',
            'cfg-max-food': 'MAX_FOOD',
            'cfg-food-nut': 'FOOD_NUTRITION',
            'cfg-max-age': 'MAX_AGE',
            'cfg-ticks-yr': 'TICKS_PER_YEAR',
            'cfg-speed': 'MAX_SPEED',
            'cfg-max-hunger': 'MAX_HUNGER',
            'cfg-starve-rate': 'STARVATION_RATE',
            'cfg-monster-speed': 'MONSTER_SPEED',
            'cfg-monster-awareness': 'MONSTER_AWARENESS',
            'cfg-monster-spawn': 'MONSTER_SPAWN_INTERVAL',
            'cfg-repro-cooldown': 'REPRODUCTION_COOLDOWN',
            'cfg-pref-interval': 'PREF_DEGRADE_INTERVAL',
            'cfg-child-age': 'CHILD_AGE',
            'cfg-teen-age': 'TEEN_AGE',
            'cfg-elder-age': 'ELDER_AGE',
            'cfg-steer': 'STEER_STRENGTH',
            'cfg-food-attract': 'FOOD_ATTRACTION',
            'cfg-agent-radius': 'AGENT_RADIUS'
        };

        const updateConfig = (id, val) => {
            const key = CONFIG_MAP[id];
            if (!key) return;
            CONFIG[key] = val;
            this.worker.postMessage({ type: 'CONFIG', key, value: val });

            // UI Feedback
            this.displayEventLog({
                msg: `Setting Updated: ${key.replace(/_/g, ' ')} = ${val}`,
                type: 'info'
            });

            if (key === 'AGENT_RADIUS') {
                CONFIG['SPRITE_SIZE'] = val;
                this.worker.postMessage({ type: 'CONFIG', key: 'SPRITE_SIZE', value: val });
            }
        };

        const inputs = Object.keys(CONFIG_MAP);
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', e => {
                    const val = el.type === 'checkbox' ? e.target.checked : parseFloat(e.target.value);
                    updateConfig(id, val);
                });
            }
        });
    }

    bindSceneInput() {
        this.scene.input.on('pointerdown', (pointer) => {
            // Convert screen pointer coordinates to world coordinates (to account for zoom/pan)
            const worldPoint = this.camera.getWorldPoint(pointer.x, pointer.y);
            const mouseX = worldPoint.x;
            const mouseY = worldPoint.y;

            if (this.currentGodAction !== 'select') {
                this.worker.postMessage({
                    type: 'GOD_ACT',
                    action: this.currentGodAction,
                    x: mouseX,
                    y: mouseY
                });
                return;
            }

            // Selection logic
            if (!this.latestAgentBuffer) return;
            const aBuffer = new Float32Array(this.latestAgentBuffer);
            const clickRadius = Math.max(CONFIG.SPRITE_SIZE * 2.5, 40);
            const sqRadius = clickRadius * clickRadius;

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
                this.removeClass('entity-stats-panel', 'hidden');
                this.worker.postMessage({ type: 'SELECT', id: clickedId });
            } else {
                this.selectedAgentId = null;
                this.addClass('entity-stats-panel', 'hidden');
                this.worker.postMessage({ type: 'SELECT', id: null });
            }
        });
    }

    launchSimulation() {
        const updates = {
            INITIAL_RED_MALES: parseInt(this.getVal('cfg-init-red-males')) || 0,
            INITIAL_RED_FEMALES: parseInt(this.getVal('cfg-init-red-females')) || 0,
            INITIAL_BLUE_MALES: parseInt(this.getVal('cfg-init-blue-males')) || 0,
            INITIAL_BLUE_FEMALES: parseInt(this.getVal('cfg-init-blue-females')) || 0,
            AWARENESS_RADIUS: parseInt(this.getVal('cfg-awareness-radius')) || 200,
            INTERACTION_RADIUS: parseInt(this.getVal('cfg-interaction-radius')) || 25,
            ENABLE_SHOW_AWARENESS: this.isChecked('cfg-show-awareness'),
            ENABLE_SHOW_INTERACTION: this.isChecked('cfg-show-interaction'),
            MAX_FOOD: parseInt(this.getVal('cfg-max-food')) || 250,
            FOOD_NUTRITION: parseInt(this.getVal('cfg-food-nut')) || 1500,
            ENABLE_TRIBES: this.isChecked('cfg-tribes'),
            ENABLE_HUNGER: this.isChecked('cfg-hunger'),
            MAX_AGE: parseInt(this.getVal('cfg-max-age')) || 75,
            TICKS_PER_YEAR: parseInt(this.getVal('cfg-ticks-yr')) || 60,
            MAX_SPEED: parseFloat(this.getVal('cfg-speed')) || 0.5,
            ENABLE_FIGHTING: this.isChecked('cfg-fighting'),
            ENABLE_REPRODUCTION: this.isChecked('cfg-repro'),
            ENABLE_AGING: this.isChecked('cfg-aging'),
            ENABLE_INCEST_PENALTY: this.isChecked('cfg-incest'),
            ENABLE_PREF_DEGRADE: this.isChecked('cfg-pref'),
            ENABLE_MAX_POPULATION: this.isChecked('cfg-limit-pop'),
            MAX_POPULATION: parseInt(this.getVal('cfg-max-pop')) || 300,
            MUTATION_RATE: parseFloat(this.getVal('cfg-mutation')) || 0.15,
            ENABLE_COMBAT_WEARINESS: this.isChecked('cfg-weariness'),
            ENABLE_MONSTERS: this.isChecked('cfg-monsters'),
            INITIAL_MONSTERS: parseInt(this.getVal('cfg-init-monsters')) || 2,
            INITIAL_MIN_AGE: parseInt(this.getVal('cfg-init-age-min')) || 18,
            INITIAL_MAX_AGE: parseInt(this.getVal('cfg-init-age-max')) || 30,
            MAX_HUNGER: parseInt(this.getVal('cfg-max-hunger')) || 3000,
            STARVATION_RATE: parseFloat(this.getVal('cfg-starve-rate')) || 1,
            MONSTER_SPEED: parseFloat(this.getVal('cfg-monster-speed')) || 0.45,
            MONSTER_AWARENESS: parseInt(this.getVal('cfg-monster-awareness')) || 600,
            MONSTER_SPAWN_INTERVAL: parseInt(this.getVal('cfg-monster-spawn')) || 1800,
            REPRODUCTION_COOLDOWN: parseInt(this.getVal('cfg-repro-cooldown')) || 100,
            PREF_DEGRADE_INTERVAL: parseInt(this.getVal('cfg-pref-interval')) || 150,
            CHILD_AGE: parseInt(this.getVal('cfg-child-age')) || 12,
            TEEN_AGE: parseInt(this.getVal('cfg-teen-age')) || 18,
            ELDER_AGE: parseInt(this.getVal('cfg-elder-age')) || 60,
            STEER_STRENGTH: parseFloat(this.getVal('cfg-steer')) || 0.04,
            FOOD_ATTRACTION: parseFloat(this.getVal('cfg-food-attract')) || 0.15,
            AGENT_RADIUS: parseInt(this.getVal('cfg-agent-radius')) || 15,
            SPRITE_SIZE: parseInt(this.getVal('cfg-agent-radius')) || 15
        };

        for (const [key, value] of Object.entries(updates)) {
            CONFIG[key] = value;
            this.worker.postMessage({ type: 'CONFIG', key, value });
        }

        this.worker.postMessage({
            type: 'INIT',
            width: window.innerWidth * 2, // Larger world than viewport
            height: window.innerHeight * 2
        });

        this.addClass('settings-modal', 'hidden');
        this.setDisplay('start-screen', 'none');
        this.setDisplay('start-actions', 'none');

        // Hide init rows
        ['row-init-red-males', 'row-init-red-females', 'row-init-blue-males', 'row-init-blue-females', 'row-init-age', 'row-init-monsters', 'monster-extra-settings'].forEach(id => {
            this.setDisplay(id, 'none');
        });

        // Center camera initially
        if (this.camera) this.camera.centerOn(window.innerWidth, window.innerHeight);
    }

    resize() {
        if (this.game) {
            this.game.scale.resize(window.innerWidth, window.innerHeight);
            this.worker.postMessage({ type: 'RESIZE', width: window.innerWidth * 2, height: window.innerHeight * 2 });
        }
    }

    reset() {
        this.selectedAgentId = null;
        this.isGameOverFlag = false;
        this.isPaused = true;
        this.setText('stat-years', 0);
        this.addClass('entity-stats-panel', 'hidden');
        this.addClass('game-over-modal', 'hidden');
        this.worker.postMessage({ type: 'RESET' });

        // Clear all sprites with safety checks
        if (this.agentSprites) {
            this.agentSprites.forEach(s => s.destroy());
            this.agentSprites.clear();
        }
        if (this.monsterGraphics) {
            this.monsterGraphics.forEach(s => s.destroy());
            this.monsterGraphics.clear();
        }
        if (this.foodSprites) {
            this.foodSprites.forEach(s => s && s.destroy ? s.destroy() : null);
            this.foodSprites = [];
        }
        if (this.particleSprites) {
            this.particleSprites.forEach(s => s && s.destroy ? s.destroy() : null);
            this.particleSprites = [];
        }
    }

    update() {
        if (!this.isPaused && this.renderData) {
            const data = this.renderData;
            this.renderData = null;

            this.renderFramePhaser(data);
            this.updateUI(data);

            if (data.events && data.events.length > 0) {
                data.events.forEach(ev => this.displayEventLog(ev));
            }

            if (data.selectedAgent) {
                if (data.selectedAgent.dead) {
                    this.selectedAgentId = null;
                    this.addClass('entity-stats-panel', 'hidden');
                } else {
                    this.updateEntityStatsPanel(data.selectedAgent);
                }
            }

            this.checkGameOver(data);
        }
    }

    renderFramePhaser(data) {
        if (!this.scene) return;

        this.uiLayer.clear();
        this.selectionRing.clear();

        // --- AGENTS ---
        const aBuffer = new Float32Array(data.agentBuffer);
        const activeIds = new Set();

        for (let i = 0; i < aBuffer.length; i += 10) {
            const id = aBuffer[i];
            const x = aBuffer[i + 1];
            const y = aBuffer[i + 2];
            const s = aBuffer[i + 3];
            const isFemale = aBuffer[i + 4] === 1;
            const tInt = aBuffer[i + 5];
            // skip i+6 (padding)
            const hungerRatio = aBuffer[i + 7];
            const wearinessRatio = aBuffer[i + 8];
            const isBerserk = aBuffer[i + 9] === 1;

            activeIds.add(id);

            let sprite = this.agentSprites.get(id);
            if (!sprite) {
                let texture = 'male-red';
                if (isFemale) texture = tInt === 0 ? 'female-red' : 'female-blue';
                else texture = tInt === 0 ? 'male-red' : 'male-blue';

                sprite = this.scene.add.sprite(x, y, texture);
                this.agentLayer.add(sprite);
                this.agentSprites.set(id, sprite);
            }

            // Update texture based on state
            let targetTexture = '';
            if (isBerserk) targetTexture = isFemale ? 'berserk-tri' : 'berserk-sq';
            else {
                if (isFemale) targetTexture = tInt === 0 ? 'female-red' : 'female-blue';
                else targetTexture = tInt === 0 ? 'male-red' : 'male-blue';
            }

            if (sprite.texture.key !== targetTexture) sprite.setTexture(targetTexture);

            sprite.setPosition(x, y);
            sprite.setDisplaySize(s, s);

            // Glow Effects
            if (isBerserk) {
                // Phaser 3.60: Use preFX and manage specific effects manually or check for active flags
                // To avoid repeated 'find' calls (which don't exist in that API), we use a flag on the sprite
                if (sprite.lastFx !== 'berserk') {
                    sprite.preFX.clear();
                    sprite.preFX.addGlow(0xa855f7, 4, 1);
                    sprite.lastFx = 'berserk';
                }
                const pulse = 0.5 + Math.sin(Date.now() / 150) * 0.5;
                sprite.setAlpha(0.8 + pulse * 0.2);
            } else {
                if (sprite.lastFx) {
                    sprite.preFX.clear();
                    sprite.lastFx = null;
                }
                sprite.setAlpha(1);
            }

            // Selection ring
            if (this.selectedAgentId === id) {
                const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                this.selectionRing.lineStyle(2, 0xfbbf24, 0.8 * pulse);
                this.selectionRing.strokeCircle(x, y, s / 2 + 10 * pulse);
            }

            // Indicators (Draw on UI Layer for simplicity, or use specific GameObjects)
            if (CONFIG.ENABLE_HUNGER) {
                const r = Math.floor(255 * (1 - hungerRatio));
                const g = Math.floor(255 * hungerRatio);
                const color = (r << 16) | (g << 8);
                this.uiLayer.lineStyle(2, color, 0.8);
                this.uiLayer.beginPath();
                this.uiLayer.arc(x, y, s / 2 + 4, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + (360 * hungerRatio)), false);
                this.uiLayer.strokePath();
            }

            if (CONFIG.ENABLE_COMBAT_WEARINESS && wearinessRatio > 0.2) {
                this.uiLayer.lineStyle(2, 0xfb923c, 0.3 + wearinessRatio * 0.7);
                this.uiLayer.beginPath();
                this.uiLayer.arc(x, y, s / 2 + 7, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + (360 * wearinessRatio)), false);
                this.uiLayer.strokePath();
            }

            if (CONFIG.ENABLE_SHOW_AWARENESS) {
                this.uiLayer.fillStyle(0xffffff, 0.015);
                this.uiLayer.fillCircle(x, y, CONFIG.AWARENESS_RADIUS);
            }

            if (CONFIG.ENABLE_SHOW_INTERACTION) {
                this.uiLayer.lineStyle(1.5, 0xffffff, 0.06);
                this.uiLayer.strokeCircle(x, y, CONFIG.INTERACTION_RADIUS);
            }
        }

        // Cleanup dead agent sprites
        for (const [id, sprite] of this.agentSprites) {
            if (!activeIds.has(id)) {
                sprite.destroy();
                this.agentSprites.delete(id);
            }
        }

        // --- FOOD ---
        const fBuffer = new Float32Array(data.foodBuffer);
        const foodCount = fBuffer.length / 2;

        while (this.foodSprites.length < foodCount) {
            const s = this.scene.add.sprite(0, 0, 'food');
            this.foodLayer.add(s);
            this.foodSprites.push(s);
        }
        while (this.foodSprites.length > foodCount) {
            this.foodSprites.pop().destroy();
        }

        for (let i = 0; i < foodCount; i++) {
            this.foodSprites[i].setPosition(fBuffer[i * 2], fBuffer[i * 2 + 1]);
        }

        // --- MONSTERS ---
        const mBuffer = new Float32Array(data.monsterBuffer);
        const activeMonsterIds = new Set();
        // Since monsterBuffer doesn't have IDs in the original pack, we'll use index-based mapping or adjust worker later.
        // For now, let's just use index-based pooling if no IDs are present.
        // Actually, looking at worker.js: monsterBuffer pack is mx, my, mr, hpRatio, hungerRatio. No ID.
        // Let's rely on count for now.
        const monsterCount = mBuffer.length / 5;
        this.updateMonsterPool(monsterCount, mBuffer);

        // --- PARTICLES ---
        const pBuffer = new Float32Array(data.particleBuffer);
        const pCount = pBuffer.length / 4;
        this.updateParticlePool(pCount, pBuffer);
    }

    updateMonsterPool(count, buffer) {
        const ids = Array.from(this.monsterGraphics.keys());

        // Ensure we have enough graphics objects
        while (this.monsterGraphics.size < count) {
            const id = `m-${this.monsterGraphics.size}`;
            const g = this.scene.add.graphics();
            this.monsterLayer.add(g);
            this.monsterGraphics.set(id, g);
            // Monsters always glow amber
            if (g.preFX) {
                g.preFX.addGlow(0xff7400, 4, 1);
            }
        }

        const currentIds = Array.from(this.monsterGraphics.keys());

        for (let i = 0; i < count; i++) {
            const mg = this.monsterGraphics.get(currentIds[i]);
            mg.clear();
            mg.setVisible(true);

            const mx = buffer[i * 5];
            const y = buffer[i * 5 + 1];
            const r = buffer[i * 5 + 2];
            const hp = buffer[i * 5 + 3];
            const hunger = buffer[i * 5 + 4];

            // Wobbly Blob Shape
            mg.fillStyle(0xffce00, 1);
            mg.beginPath();
            const points = 16;
            for (let j = 0; j <= points; j++) {
                const angle = (j / points) * Math.PI * 2;
                // Wobble factors
                const offset = Math.sin(angle * 5 + (Date.now() / 200)) * (r * 0.15) +
                    Math.cos(angle * 4 + mx / 100) * (r * 0.2);
                const rad = r + offset;
                const px = mx + Math.cos(angle) * rad;
                const py = y + Math.sin(angle) * rad;
                if (j === 0) mg.moveTo(px, py);
                else mg.lineTo(px, py);
            }
            mg.closePath();
            mg.fill();

            // HP Bar (Draw above)
            if (hp < 1.0) {
                const barWidth = r * 2.2;
                mg.fillStyle(0xff0000, 0.6);
                mg.fillRect(mx - barWidth / 2, y - r * 1.45 - 12, barWidth, 5);
                mg.fillStyle(0x10b981, 1);
                mg.fillRect(mx - barWidth / 2, y - r * 1.45 - 12, barWidth * hp, 5);
            }

            // Monster Hunger Arc
            if (CONFIG.ENABLE_HUNGER && hunger < 1.0) {
                const rgbR = Math.floor(255 * (1 - hunger));
                const rgbG = Math.floor(255 * hunger);
                const color = (rgbR << 16) | (rgbG << 8);
                mg.lineStyle(4, color, 0.8);
                mg.beginPath();
                mg.arc(mx, y, r * 1.45, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(1, hunger))), false);
                mg.strokePath();
            }
        }

        // Hide unused monsters
        for (let i = count; i < currentIds.length; i++) {
            this.monsterGraphics.get(currentIds[i]).setVisible(false);
        }
    }

    updateParticlePool(count, buffer) {
        while (this.particleSprites.length < count) {
            const s = this.scene.add.sprite(0, 0, 'particle');
            this.particleLayer.add(s);
            this.particleSprites.push(s);
        }
        for (let i = 0; i < count; i++) {
            const s = this.particleSprites[i];
            const x = buffer[i * 4];
            const y = buffer[i * 4 + 1];
            const alpha = buffer[i * 4 + 2];
            const type = buffer[i * 4 + 3];

            s.setPosition(x, y);
            s.setAlpha(alpha);
            s.setVisible(true);

            let color = 0xffffff;
            if (type === 1) color = 0xef4444;
            else if (type === 3) color = 0x94a3b8;
            else if (type === 4) color = 0xf472b6;
            else if (type === 5) color = 0xfbbf24;
            s.setTint(color);
        }
        for (let i = count; i < this.particleSprites.length; i++) {
            this.particleSprites[i].setVisible(false);
        }
    }

    // UI Hardening Helpers
    setText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }
    setHTML(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
    getVal(id) { const el = document.getElementById(id); return el ? el.value : null; }
    isChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }
    setDisplay(id, val) { const el = document.getElementById(id); if (el) el.style.display = val; }
    addClass(id, c) { const el = document.getElementById(id); if (el) el.classList.add(c); }
    removeClass(id, c) { const el = document.getElementById(id); if (el) el.classList.remove(c); }
    setInnerText(id, val) { this.setText(id, val); } // compatibility

    updateUI(data) {
        this.setText('stat-population', data.demographics.pop);
        this.setText('stat-males', data.demographics.males);
        this.setText('stat-females', data.demographics.females);
        this.setText('stat-introverts', data.demographics.intro);
        this.setText('stat-extroverts', data.demographics.extro);
        this.setText('stat-incest-current', data.demographics.incest);
        this.setText('stat-food', data.demographics.foodCount);
        this.setText('stat-tribe-red', data.demographics.tribeRed);
        this.setText('stat-tribe-blue', data.demographics.tribeBlue);
        this.setText('stat-monsters', data.demographics.monsterCount || 0);

        if (document.getElementById('stat-monster-births')) {
            this.setText('stat-monster-births', data.stats.monster_births || 0);
            this.setText('stat-monster-fights', data.stats.monster_fights || 0);
            this.setText('stat-monster-deaths', data.stats.monster_deaths || 0);
        }

        this.setText('stat-encounters', data.stats.encounters);
        this.setText('stat-kills', data.stats.kills);
        this.setText('stat-repros', data.stats.repros);
        this.setText('stat-born', data.stats.born);
        this.setText('stat-incest-total', data.stats.incest_born);
        this.setText('stat-natural-deaths', data.stats.natural_deaths);
        this.setText('stat-exhaustion-deaths', data.stats.exhaustion_deaths || 0);

        const worldYear = Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR);
        this.setText('world-clock', `Year ${worldYear}`);
    }

    displayEventLog(event) {
        const container = document.getElementById('event-logs-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `event-log-entry ${event.type}`;
        el.innerText = event.msg;

        container.prepend(el);
        while (container.children.length > 8) container.removeChild(container.lastChild);

        setTimeout(() => {
            if (el.parentElement) {
                el.classList.add('fade-out');
                setTimeout(() => { if (el.parentElement) el.remove(); }, 1000);
            }
        }, 5000);
    }

    updateEntityStatsPanel(a) {
        if (!a) return;
        this.removeClass('entity-stats-panel', 'hidden');

        this.setText('ent-name', a.name);
        this.setText('ent-gender', a.gender);
        const genCol = a.gender === 'N/A' ? '#a1a1aa' : (a.gender === 'Male' ? '#60a5fa' : '#f472b6');
        const genEl = document.getElementById('ent-gender');
        if (genEl) genEl.style.color = genCol;

        const ageEl = document.getElementById('ent-age');
        if (ageEl) {
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
        }

        this.setText('ent-strength', a.strength);
        this.setText('ent-intelligence', a.intelligence);
        this.setText('ent-speed', a.speed !== undefined && a.speed !== 'N/A' ? `${a.speed} / 100` : (a.speed || 'N/A'));
        this.setText('ent-offspring', a.offspringCount);

        const incestEl = document.getElementById('ent-incest');
        if (incestEl) {
            incestEl.innerText = a.bornOfIncest === 'N/A' ? 'N/A' : (a.bornOfIncest ? "Yes" : "No");
            incestEl.style.color = a.bornOfIncest === 'N/A' ? '#a1a1aa' : (a.bornOfIncest ? "#ef4444" : "#10b981");
        }

        this.setText('ent-personality', a.personality);
        const persEl = document.getElementById('ent-personality');
        if (persEl) persEl.style.color = a.personality === 'Bloodthirsty' ? '#ef4444' : (a.personality === 'Introvert' ? '#818cf8' : '#34d399');

        this.setText('ent-libido', a.libido);
        this.setText('ent-fighter', a.fighter);
        this.setText('ent-weariness', a.weariness !== undefined ? a.weariness : 0);
        this.setText('ent-charm', a.charm);

        const statusEl = document.getElementById('ent-status');
        if (statusEl) {
            if (a.isBerserk) {
                statusEl.innerText = "BERSERK (RAGE)";
                statusEl.style.color = "#a855f7";
            } else {
                statusEl.innerText = "Stable";
                statusEl.style.color = "#10b981";
            }
        }

        this.setText('ent-pref-str', a.prefMinStrength);
        this.setText('ent-pref-int', a.prefMinIntelligence);
        this.setText('ent-pref-pers', (a.prefPersonality === 'none' || a.prefPersonality === 'N/A') ? 'Any' : a.prefPersonality);
    }

    checkGameOver(data) {
        if (this.isPaused || this.isGameOverFlag) return;
        let reason = null;
        if (data.demographics.pop === 0 && data.demographics.monsterCount > 0) reason = "EATEN ALIVE: Monsters devoured humanity.";
        else if (data.demographics.pop === 0) reason = "EXTINCTION EVENT: The entire population was wiped out.";
        else if (CONFIG.ENABLE_MAX_POPULATION && data.demographics.pop >= CONFIG.MAX_POPULATION) reason = "OVERPOPULATION: The world reached its max carrying capacity.";

        if (reason) this.showGameOver(reason, data);
    }

    showGameOver(reason, data) {
        this.isGameOverFlag = true;
        this.isPaused = true;
        this.worker.postMessage({ type: 'PAUSE', isPaused: true });

        this.setText('go-reason', reason);
        this.setText('go-years', Math.floor(data.worldTick / CONFIG.TICKS_PER_YEAR));
        this.setText('go-pop', data.demographics.pop);
        this.setText('go-peak', data.stats.peak_pop || 0);
        this.setText('go-encounters', data.stats.encounters);
        this.setText('go-kills', data.stats.kills);
        this.setText('go-repros', data.stats.repros);
        this.setText('go-born', data.stats.born);
        this.setText('go-incest', data.stats.incest_born);
        this.setText('go-natural', data.stats.natural_deaths);
        this.setText('go-avg-str', data.analytics.avgStr);
        this.setText('go-avg-int', data.analytics.avgInt);
        this.setText('go-avg-spd', data.analytics.avgSpd || '-');
        this.setText('go-monster-pop', data.demographics.monsterCount || 0);
        this.setText('go-monster-deaths', data.stats.monster_deaths || 0);
        this.setText('go-monster-fights', data.stats.monster_fights || 0);
        this.setText('go-monster-births', data.stats.monster_births || 0);

        this.setText('go-prolific', data.analytics.prolificCount > 0 ? `${data.analytics.prolificName} (${data.analytics.prolificCount} children)` : 'None');
        this.setText('go-strongest', data.analytics.strongestStr > 0 ? `${data.analytics.strongestName} (${data.analytics.strongestStr} STR)` : 'None');

        const track = document.getElementById('go-history-track');
        if (track) {
            track.innerHTML = '';
            if (data.milestones && data.milestones.length > 0) {
                data.milestones.forEach(m => {
                    const row = document.createElement('div');
                    let color = '#d1d5db';
                    if (m.type === 'danger') color = '#ef4444';
                    if (m.type === 'warning') color = '#fbbf24';
                    if (m.type === 'success') color = '#10b981';
                    row.innerHTML = `<span style="color: var(--text-muted); font-weight: 700;">Year ${m.year}:</span> <span style="color: ${color};">${m.msg}</span>`;
                    track.appendChild(row);
                });
            } else {
                track.innerHTML = '<div style="color: var(--text-muted); text-align: center; font-style: italic;">No notable history recorded.</div>';
            }
        }

        this.removeClass('game-over-modal', 'hidden');
        setTimeout(() => {
            this.renderStatsChart(data.statHistory);
            this.renderPopChart(data.statHistory);
        }, 50);
    }

    renderStatsChart(history) {
        const canvas = document.getElementById('go-stats-chart');
        if (!canvas || !history || history.length === 0) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const w = canvas.width, h = canvas.height, padding = 35;

        ctx.clearRect(0, 0, w, h);

        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '10px Inter';
        for (let i = 0; i <= 4; i++) {
            let y = padding + (h - padding * 2) * (i / 4);
            ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
            ctx.fillText(100 - i * 25, 5, y + 4);
        }
        ctx.setLineDash([]);

        // Average lines
        const xStep = (w - padding * 2) / Math.max(1, history.length - 1);
        const getY = (val) => h - padding - (val / 100) * (h - padding * 2);

        // STR line
        ctx.beginPath(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3;
        history.forEach((pt, i) => { const x = padding + i * xStep, y = getY(pt.avgStr); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();

        // INT line
        ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 3;
        history.forEach((pt, i) => { const x = padding + i * xStep, y = getY(pt.avgInt); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter';
        ctx.fillText('Evolution of Average Stats', w / 2 - 60, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Time (Years)', w / 2 - 30, h - 5);

        // Legend
        ctx.fillStyle = '#f87171'; ctx.fillText('🔴 Strength', w - 85, 20);
        ctx.fillStyle = '#60a5fa'; ctx.fillText('🔵 Intelligence', w - 85, 35);
    }

    renderPopChart(history) {
        const canvas = document.getElementById('go-pop-chart');
        if (!canvas || !history || history.length === 0) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width; canvas.height = rect.height;
        const w = canvas.width, h = canvas.height, padding = 35;

        ctx.clearRect(0, 0, w, h);
        const maxPop = Math.max(...history.map(pt => pt.pop), 10);
        const xStep = (w - padding * 2) / Math.max(1, history.length - 1);
        const getY = (val) => h - padding - (val / maxPop) * (h - padding * 2);

        // Grid
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '10px Inter';
        for (let i = 0; i <= 2; i++) {
            let y = padding + (h - padding * 2) * (i / 2);
            ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
            ctx.fillText(Math.round(maxPop - i * (maxPop / 2)), 5, y + 4);
        }
        ctx.setLineDash([]);

        ctx.beginPath(); ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3;
        history.forEach((pt, i) => { const x = padding + i * xStep, y = getY(pt.pop); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter';
        ctx.fillText('Population Over Time', w / 2 - 50, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Time (Years)', w / 2 - 30, h - 5);
        ctx.fillStyle = '#10b981'; ctx.fillText('🟢 Population', w - 85, 20);
    }

    start() {
        // Phaser starts automatically upon instantiation of the Game object
        // but we can trigger initial events if needed
    }
}

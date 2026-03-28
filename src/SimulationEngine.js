import { CONFIG, GENDER, ANIMATION_STATE } from './config.js?v=123456';

export class SimulationEngine {
    constructor(canvasId) {
        this.isPaused = false;
        this.selectedAgentId = null;
        this.isGameOverFlag = false;
        this.currentGodAction = 'select';

        this.renderData = null;
        this.latestAgentBuffer = null;

        // Fixed World Dimensions
        this.WORLD_WIDTH = 2500;
        this.WORLD_HEIGHT = 2000;

        // Spawn precise Data-Oriented Web Worker
        this.worker = new Worker('./src/worker.js?v=123456', { type: 'module' });
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = (e) => console.error('[Worker Error]', e.message, e);

        this.initPhaser(canvasId);
        this.bindUIEvents();
    }

    initPhaser(canvasId) {
        const self = this;
        const config = {
            type: Phaser.WEBGL,
            width: window.innerWidth,
            height: window.innerHeight,
            canvas: document.getElementById(canvasId),
            backgroundColor: '#f8fafc',
            scene: {
                preload: function () { self.preload(this); },
                create: function () { self.create(this); },
                update: function () { self.update(this); }
            },
            fps: {
                target: 60,
                forceSetTimeOut: true
            }
        };

        this.game = new Phaser.Game(config);
    }

    preload(scene) {
        this.scene = scene;

        // === MALE SPRITES ===
        // Red Tribe -> Swordsman, Blue Tribe -> Knight
        const maleTribalDirs = { 'red': 'Swordsman', 'blue': 'Knight' };
        const maleActionMap = {
            'idle': 'Idle',
            'walk': 'Run',
            'attack': 'Attack_1',
            'hurt': 'Hurt',
            'dead': 'Dead'
        };
        ['red', 'blue'].forEach(t => {
            const dir = maleTribalDirs[t];
            Object.entries(maleActionMap).forEach(([key, file]) => {
                this.scene.load.spritesheet(
                    `male-${t}-${key}`,
                    `./src/sprites/${dir}/${file}.png`,
                    { frameWidth: 128, frameHeight: 128 }
                );
            });
        });

        // === FEMALE SPRITES ===
        // Red Tribe -> Archer, Blue Tribe -> Enchantress
        const femaleTribalDirs = { 'red': 'Archer', 'blue': 'Enchantress' };
        const femaleActionMap = {
            'idle': 'Idle',
            'walk': 'Run',
            'attack': 'Attack_1',
            'hurt': 'Hurt',
            'dead': 'Dead'
        };
        ['red', 'blue'].forEach(t => {
            const dir = femaleTribalDirs[t];
            Object.entries(femaleActionMap).forEach(([key, file]) => {
                this.scene.load.spritesheet(
                    `female-${t}-${key}`,
                    `./src/sprites/${dir}/${file}.png`,
                    { frameWidth: 128, frameHeight: 128 }
                );
            });
        });

        // === MONSTER SPRITES ===
        const monsterActions = ['Idle', 'Walk', 'Attack', 'Hurt', 'Dead'];
        monsterActions.forEach(a => {
            this.scene.load.spritesheet(
                `monster-1-${a.toLowerCase()}`,
                `./src/sprites/Monster/Minotaur_1/${a}.png`,
                { frameWidth: 128, frameHeight: 128 }
            );
            this.scene.load.spritesheet(
                `monster-2-${a.toLowerCase()}`,
                `./src/sprites/Monster/Minotaur_2/${a}.png`,
                { frameWidth: 128, frameHeight: 128 }
            );
        });

        // Background Custom Tiles
        this.scene.load.image('bg-grass', './src/sprites/BG/1 Tiles/FieldsTile_02.png');

        // Environment Props for Fixed Handcrafted Map
        this.scene.load.image('prop-tent', './src/sprites/BG/2 Objects/8 Camp/1.png');
        this.scene.load.image('prop-tent2', './src/sprites/BG/2 Objects/8 Camp/3.png');
        this.scene.load.image('prop-log', './src/sprites/BG/2 Objects/7 Decor/Log1.png');
        this.scene.load.image('prop-bush', './src/sprites/BG/2 Objects/9 Bush/1.png');
        this.scene.load.image('prop-tree', './src/sprites/BG/2 Objects/7 Decor/Tree1.png');
        this.scene.load.image('prop-dirt', './src/sprites/BG/2 Objects/7 Decor/Dirt4.png');
        this.scene.load.image('prop-fence', './src/sprites/BG/2 Objects/2 Fence/2.png');
        this.scene.load.image('prop-stone', './src/sprites/BG/2 Objects/4 Stone/1.png');
        this.scene.load.image('prop-fire', './src/sprites/BG/3 Animated Objects/2 Campfire/1.png');
    }

    create(scene) {
        this.scene = scene;

        // Generate procedural textures (fallback/particles/bg)
        this.generateTextures();

        // Background Terrain using provided Tileset
        this.terrainBg = this.scene.add.tileSprite(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT, 'bg-grass');
        this.terrainBg.setOrigin(0, 0);
        this.terrainBg.setTileScale(2.5); // Scale up the 16x16 or 32x32 tiles to fit the scene nicely

        // Faint overlay grid for spatial readability (very subtle)
        this.grid = this.scene.add.grid(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT, 100, 100, 0x000000, 0, 0x000000, 0.04);
        this.grid.setOrigin(0, 0);

        // Layers (MUST be created before rendering map props)
        this.gridLayer = this.scene.add.layer();
        this.gridLayer.add(this.grid);
        this.foodLayer = this.scene.add.layer();
        this.agentLayer = this.scene.add.layer();
        this.monsterLayer = this.scene.add.layer();
        this.particleLayer = this.scene.add.layer();
        this.uiLayer = this.scene.add.graphics(); // For awareness circles etc.

        // Camera setup (MUST be initialized early in case of early worker events)
        this.camera = this.scene.cameras.main;
        this.camera.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);
        this.camera.setScroll(this.WORLD_WIDTH / 2 - window.innerWidth / 2, this.WORLD_HEIGHT / 2 - window.innerHeight / 2);
        this.setupCameraControls();

        // Fixed Handmade Map Environment
        const placeProp = (key, x, y, scale = 2.0) => {
            const prop = this.scene.add.sprite(x, y, key);
            prop.setOrigin(0.5, 1);
            prop.setScale(scale);
            prop.setAlpha(1.0);
            this.gridLayer.add(prop);
        };

        // 1. Draw central dirt roads winding through the map
        const pathScale = 4.0;
        const pathSpacing = 30; // Closer spacing to make continuous path
        const drawHorizontalPath = (startX, startY, endX) => {
            let y = startY;
            for (let x = startX; x < endX; x += pathSpacing) {
                y += (Math.random() - 0.5) * 10; // Winding
                placeProp('prop-dirt', x, y, pathScale + (Math.random() * 1.5));
                // Add occasional stones near path
                if (Math.random() < 0.1) placeProp('prop-stone', x + (Math.random() > 0.5 ? 40 : -40), y, 1.5);
            }
        };

        // Main highway across middle bounds
        drawHorizontalPath(100, this.WORLD_HEIGHT / 2, this.WORLD_WIDTH - 100);

        const drawVerticalPath = (startX, startY, endY) => {
            let x = startX;
            for (let y = startY; y < endY; y += pathSpacing) {
                x += (Math.random() - 0.5) * 10;
                placeProp('prop-dirt', x, y, pathScale + (Math.random() * 1.5));
            }
        }

        // Branching paths to camps
        drawVerticalPath(this.WORLD_WIDTH / 3, this.WORLD_HEIGHT / 2 - 200, this.WORLD_HEIGHT / 2);
        drawVerticalPath((this.WORLD_WIDTH / 3) * 2, this.WORLD_HEIGHT / 2, this.WORLD_HEIGHT / 2 + 300);

        // 2. Build the Red Tribe Camp (Top Left)
        const redCampX = this.WORLD_WIDTH / 3 - 50;
        const redCampY = this.WORLD_HEIGHT / 2 - 300;
        placeProp('prop-tent', redCampX - 100, redCampY, 2.0);
        placeProp('prop-tent', redCampX + 50, redCampY - 80, 2.0);
        placeProp('prop-tent2', redCampX + 100, redCampY + 20, 2.0);
        placeProp('prop-fire', redCampX, redCampY + 20, 1.5);
        placeProp('prop-log', redCampX - 40, redCampY + 50, 2.0);
        placeProp('prop-log', redCampX + 40, redCampY + 40, 2.0);

        // Fences protecting red camp
        for (let i = 0; i < 6; i++) {
            placeProp('prop-fence', redCampX - 250 + (i * 40), redCampY - 100 + (Math.random() * 10), 1.5);
        }

        // 3. Build the Blue Tribe Camp (Bottom Right)
        const blueCampX = (this.WORLD_WIDTH / 3) * 2 + 50;
        const blueCampY = this.WORLD_HEIGHT / 2 + 400;
        placeProp('prop-tent', blueCampX, blueCampY, 2.0);
        placeProp('prop-tent2', blueCampX - 120, blueCampY + 50, 2.0);
        placeProp('prop-tent', blueCampX + 100, blueCampY + 60, 2.0);
        placeProp('prop-fire', blueCampX - 20, blueCampY + 100, 1.5);
        placeProp('prop-log', blueCampX + 30, blueCampY + 120, 2.0);

        for (let i = 0; i < 5; i++) {
            placeProp('prop-fence', blueCampX + 150 + (i * 40), blueCampY - 50, 1.5);
        }

        // 4. Fill edges with dense forests
        for (let i = 0; i < 80; i++) {
            // Top border forest
            placeProp('prop-tree', Math.random() * this.WORLD_WIDTH, Math.random() * 300, 2.5 + Math.random());
            placeProp('prop-bush', Math.random() * this.WORLD_WIDTH, Math.random() * 300, 1.5 + Math.random());
            // Bottom border forest
            placeProp('prop-tree', Math.random() * this.WORLD_WIDTH, this.WORLD_HEIGHT - Math.random() * 300, 2.5 + Math.random());
            placeProp('prop-bush', Math.random() * this.WORLD_WIDTH, this.WORLD_HEIGHT - Math.random() * 300, 1.5 + Math.random());
        }

        // Random bushes & trees safely scattered in empty fields
        for (let i = 0; i < 40; i++) {
            placeProp('prop-tree', Math.random() * this.WORLD_WIDTH, 400 + Math.random() * (this.WORLD_HEIGHT - 800), 2.5);
            placeProp('prop-bush', Math.random() * this.WORLD_WIDTH, 400 + Math.random() * (this.WORLD_HEIGHT - 800), 1.5);
        }

        // World Border
        const border = this.scene.add.graphics();
        border.lineStyle(4, 0x3b82f6, 0.8);
        border.strokeRect(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

        // Animations
        this.createAnimations();

        // Groups for pooling
        this.agentSprites = new Map();
        this.monsterSprites = new Map();
        this.foodSprites = [];
        this.particleSprites = [];

        // Track last positions for flipping
        this.agentLastX = new Map();
        this.monsterLastX = new Map();

        // (Camera and layers have been moved to the top of create)

        // Selection ring
        this.selectionRing = this.scene.add.graphics();

        window.addEventListener('resize', () => this.resize());
    }

    createAnimations() {
        const safeCreate = (key, frameRate, repeat) => {
            if (!this.scene.textures.exists(key)) return;
            if (this.scene.anims.exists(key)) return;
            this.scene.anims.create({
                key,
                frames: this.scene.anims.generateFrameNumbers(key),
                frameRate,
                repeat: repeat ? -1 : 0
            });
        };

        // Male animations (all 5 states available)
        ['red', 'blue'].forEach(t => {
            ['idle', 'walk', 'attack', 'hurt', 'dead'].forEach(a => {
                safeCreate(`male-${t}-${a}`, 10, a !== 'dead' && a !== 'hurt' && a !== 'attack');
            });
        });

        // Female animations now have all 5 states available
        ['red', 'blue'].forEach(t => {
            ['idle', 'walk', 'attack', 'hurt', 'dead'].forEach(a => {
                safeCreate(`female-${t}-${a}`, 10, a !== 'dead' && a !== 'hurt' && a !== 'attack');
            });
        });

        // Monster animations
        [1, 2].forEach(num => {
            ['idle', 'walk', 'attack', 'hurt', 'dead'].forEach(a => {
                safeCreate(`monster-${num}-${a}`, 8, a !== 'dead');
            });
        });
    }

    generateTextures() {
        let graphics = this.scene.make.graphics({ x: 0, y: 0, add: false });

        // Terrain Background Texture - Incredibly clean 2-tone classic checkerboard grass tile
        graphics.clear();
        const color1 = 0x567d46; // Muted forest green
        const color2 = 0x517742; // Slightly darker forest green

        const size = 64;
        const half = size / 2;

        // Draw top-left and bottom-right
        graphics.fillStyle(color1);
        graphics.fillRect(0, 0, half, half);
        graphics.fillRect(half, half, half, half);

        // Draw top-right and bottom-left
        graphics.fillStyle(color2);
        graphics.fillRect(half, 0, half, half);
        graphics.fillRect(0, half, half, half);

        graphics.generateTexture('terrain', size, size);

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
            const currentMinZoom = Math.max(window.innerWidth / this.WORLD_WIDTH, window.innerHeight / this.WORLD_HEIGHT);
            const zoomSpeed = 0.0015;
            // Clamp deltaY to limit trackpad hyperscrolling
            const clampedDelta = Phaser.Math.Clamp(deltaY, -100, 100);
            const newZoom = this.camera.zoom - clampedDelta * zoomSpeed;
            this.camera.zoom = Phaser.Math.Clamp(newZoom, currentMinZoom, 5);
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
            width: this.WORLD_WIDTH,
            height: this.WORLD_HEIGHT
        });

        this.addClass('settings-modal', 'hidden');
        this.setDisplay('start-screen', 'none');
        this.setDisplay('start-actions', 'none');

        // Hide init rows
        ['row-init-red-males', 'row-init-red-females', 'row-init-blue-males', 'row-init-blue-females', 'row-init-age', 'row-init-monsters', 'monster-extra-settings'].forEach(id => {
            this.setDisplay(id, 'none');
        });

        // Center camera initially
        if (this.camera) this.camera.centerOn(this.WORLD_WIDTH / 2, this.WORLD_HEIGHT / 2);
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
        if (this.monsterSprites) {
            this.monsterSprites.forEach(s => { if (s && s.destroy) s.destroy(); });
            this.monsterSprites.clear();
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

    update(scene) {
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
            const state = aBuffer[i + 6];
            const hungerRatio = aBuffer[i + 7];
            const wearinessRatio = aBuffer[i + 8];
            const isBerserk = aBuffer[i + 9] === 1;

            activeIds.add(id);

            let sprite = this.agentSprites.get(id);
            if (!sprite) {
                sprite = this.scene.add.sprite(x, y, 'male-red-idle');
                this.agentLayer.add(sprite);
                this.agentSprites.set(id, sprite);
            }

            // Determine Animation Key
            const genderStr = isFemale ? 'female' : 'male';
            const tribeStr = tInt === 0 ? 'red' : 'blue';
            let actionStr = 'idle';
            if (state === ANIMATION_STATE.WALK) actionStr = 'walk';
            else if (state === ANIMATION_STATE.ATTACK) actionStr = 'attack';
            else if (state === ANIMATION_STATE.HURT) actionStr = 'hurt';
            else if (state === ANIMATION_STATE.DEAD) actionStr = 'dead';

            // For females, fall back to 'idle' if the action animation doesn't exist
            let resolvedAction = actionStr;
            if (isFemale && !this.scene.anims.exists(`${genderStr}-${tribeStr}-${resolvedAction}`)) {
                resolvedAction = 'idle';
            }
            const animKey = `${genderStr}-${tribeStr}-${resolvedAction}`;
            if (this.scene.anims.exists(animKey) && sprite.anims.currentAnim?.key !== animKey) {
                sprite.play(animKey, true);
            }

            // Direction Flipping - prevent violent jittering during combat
            if (state !== ANIMATION_STATE.ATTACK && state !== ANIMATION_STATE.HURT) {
                const lastX = this.agentLastX.get(id) || x;
                if (x < lastX - 0.5) sprite.setFlipX(true);
                else if (x > lastX + 0.5) sprite.setFlipX(false);
                this.agentLastX.set(id, x);
            }

            sprite.setPosition(x, y);

            // Adjust scale to fit the BG tiles mathematically
            // Adjust scale to fit the BG tiles (Premium sprites have heavy padding, so need a harsh multiplier!)
            const scale = (s * 8.5) / 128; 
            sprite.setScale(scale);

            // Berserk Effects
            if (isBerserk) {
                if (sprite.lastFx !== 'berserk') {
                    sprite.lastFx = 'berserk';
                    sprite.setTint(0xff66ff);
                }
            } else {
                if (sprite.lastFx) {
                    sprite.lastFx = null;
                    sprite.clearTint();
                }
            }

            const visualHalfHeight = (128 * scale) / 2;

            // Selection ring - Heavily expanded to wrap around the visual body (considering padding)
            if (this.selectedAgentId === id) {
                const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                this.selectionRing.lineStyle(4, 0xfbbf24, 0.9 * pulse);
                // Draw circle around the feet/character
                this.selectionRing.strokeCircle(x, y + visualHalfHeight - 30, (s * 4.5) + (5 * pulse));
            }

            // Indicators
            if (CONFIG.ENABLE_HUNGER) {
                const r = Math.floor(255 * (1 - hungerRatio));
                const g = Math.floor(255 * hungerRatio);
                const color = (r << 16) | (g << 8);

                const barWidth = 60; 
                const barHeight = 8;
                const barX = x - barWidth / 2;
                const barY = y + visualHalfHeight + 10; // Placed clearly below sprite box

                this.uiLayer.fillStyle(0x000000, 0.6);
                this.uiLayer.fillRect(barX, barY, barWidth, barHeight);
                this.uiLayer.fillStyle(color, 0.8);
                this.uiLayer.fillRect(barX, barY, barWidth * hungerRatio, barHeight);
            }

            // Weariness
            if (CONFIG.ENABLE_COMBAT_WEARINESS && wearinessRatio > 0.1) {
                const barWidth = 60;
                const barHeight = 8;
                const barX = x - barWidth / 2;
                const barY = y + visualHalfHeight + 20;

                this.uiLayer.fillStyle(0x000000, 0.6);
                this.uiLayer.fillRect(barX, barY, barWidth, barHeight);
                this.uiLayer.fillStyle(0xfb923c, 0.8);
                this.uiLayer.fillRect(barX, barY, barWidth * wearinessRatio, barHeight);
            }
        }

        // Cleanup dead agents (play death animation if available)
        for (const [id, sprite] of this.agentSprites) {
            if (!activeIds.has(id)) {
                if (sprite.getData('deadPlaying')) {
                    if (sprite.anims.currentFrame && sprite.anims.currentFrame.isLast) {
                        sprite.destroy();
                        this.agentSprites.delete(id);
                        this.agentLastX.delete(id);
                    }
                    continue;
                }
                const animKey = sprite.anims.currentAnim?.key;
                if (animKey) {
                    const parts = animKey.split('-');
                    if (parts.length >= 2) {
                        const genderStr = parts[0];
                        const tribeStr = parts[1];
                        const deadKey = `${genderStr}-${tribeStr}-dead`;
                        if (this.scene.anims.exists(deadKey)) {
                            sprite.play(deadKey, true);
                            sprite.setData('deadPlaying', true);
                            continue;
                        }
                    }
                }
                sprite.destroy();
                this.agentSprites.delete(id);
                this.agentLastX.delete(id);
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
            this.foodSprites[i].setScale(6.0); // Make food visible!
        }

        // --- MONSTERS ---
        const mBuffer = new Float32Array(data.monsterBuffer);
        const activeMonsterIds = new Set();
        for (let i = 0; i < mBuffer.length; i += 7) {
            const id = mBuffer[i];
            const mx = mBuffer[i + 1];
            const my = mBuffer[i + 2];
            const mr = mBuffer[i + 3];
            const hp = mBuffer[i + 4];
            const hunger = mBuffer[i + 5];
            const mState = mBuffer[i + 6];

            activeMonsterIds.add(id);

            let mSprite = this.monsterSprites.get(id);
            if (!mSprite) {
                const type = (id % 2) + 1;
                mSprite = this.scene.add.sprite(mx, my, `monster-${type}-idle`);
                this.monsterLayer.add(mSprite);
                this.monsterSprites.set(id, mSprite);
            }

            const type = (id % 2) + 1;
            let mAction = 'idle';
            if (mState === ANIMATION_STATE.WALK) mAction = 'walk';
            else if (mState === ANIMATION_STATE.ATTACK) mAction = 'attack';
            else if (mState === ANIMATION_STATE.HURT) mAction = 'hurt';
            else if (mState === ANIMATION_STATE.DEAD) mAction = 'dead';

            const mAnimKey = `monster-${type}-${mAction}`;
            if (mSprite.anims.currentAnim?.key !== mAnimKey) {
                mSprite.play(mAnimKey, true);
            }

            // Direction Flipping - prevent jittering
            if (mState !== ANIMATION_STATE.ATTACK && mState !== ANIMATION_STATE.HURT) {
                const lastMX = this.monsterLastX.get(id) || mx;
                if (mx < lastMX - 0.5) mSprite.setFlipX(true);
                else if (mx > lastMX + 0.5) mSprite.setFlipX(false);
                this.monsterLastX.set(id, mx);
            }

            const mScale = (mr * 7.0) / 128; // Restored boss scale to tower over the heroes
            const mVisualHalfHeight = (128 * mScale) / 2;
            mSprite.setPosition(mx, my);
            mSprite.setScale(mScale);

            // HP Bar - Shifted further down
            if (hp < 1.0) {
                const barWidth = 80; 
                const barHeight = 10;
                const barY = my + mVisualHalfHeight + 10; 
                this.uiLayer.fillStyle(0xff0000, 0.6);
                this.uiLayer.fillRect(mx - barWidth / 2, barY, barWidth, barHeight);
                this.uiLayer.fillStyle(0x10b981, 1);
                this.uiLayer.fillRect(mx - barWidth / 2, barY, barWidth * hp, barHeight);
            }
        }

        // Cleanup dead monsters
        for (const [id, sprite] of this.monsterSprites) {
            if (!activeMonsterIds.has(id)) {
                if (sprite.getData('deadPlaying')) {
                    if (sprite.anims.currentFrame && sprite.anims.currentFrame.isLast) {
                        sprite.destroy();
                        this.monsterSprites.delete(id);
                        this.monsterLastX.delete(id);
                    }
                    continue;
                }
                const animKey = sprite.anims.currentAnim?.key;
                if (animKey) {
                    const parts = animKey.split('-');
                    if (parts.length >= 2) {
                        const monsterType = parts[1]; // e.g. "1" or "2"
                        const deadKey = `monster-${monsterType}-dead`;
                        if (this.scene.anims.exists(deadKey)) {
                            sprite.play(deadKey, true);
                            sprite.setData('deadPlaying', true);
                            continue;
                        }
                    }
                }
                sprite.destroy();
                this.monsterSprites.delete(id);
                this.monsterLastX.delete(id);
            }
        }

        // --- PARTICLES ---
        const pBuffer = new Float32Array(data.particleBuffer);
        const pCount = pBuffer.length / 4;
        this.updateParticlePool(pCount, pBuffer);
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

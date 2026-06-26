let scene, camera, renderer, world;
let player, playerBody, obstacles = [], debris = [], snowflakes, hills = [];
let trailParticles = [], speedLines = [], landParticles = [];
let score = 0, giftCount = 0, gameActive = false, currentSpeed = 0, startTime;
let WORLD_WIDTH = 65;
let keys = {};
let playerX = 0, playerY = 1.5, playerVelX = 0, playerVelY = 0;
let isJumping = false;
let sounds = {};

const game = {
    config: {
        graphics: localStorage.getItem('sr3d_gfx') || 'medium',
        sensitivity: parseFloat(localStorage.getItem('sr3d_sens')) || 1.2,
        volume: parseFloat(localStorage.getItem('sr3d_vol')) || 0.8,
        skin: parseInt(localStorage.getItem('sr3d_skin')) || 0,
        fov: parseInt(localStorage.getItem('sr3d_fov')) || 70
    },

    init() {
        this.setupThree();
        this.setupPhysics();
        this.createWorld();
        this.setupAudio();
        this.setupUI();
        this.setupControls();
        
        if(document.getElementById('loader')) {
            document.getElementById('loader').style.opacity = '0';
            setTimeout(() => { if(document.getElementById('loader')) document.getElementById('loader').remove(); }, 500);
        }
        
        this.animate();
    },

    setupThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xd0f4ff);
        scene.fog = new THREE.FogExp2(0xd0f4ff, 0.0008);

        camera = new THREE.PerspectiveCamera(this.config.fov, window.innerWidth / window.innerHeight, 0.1, 15000);
        camera.position.set(0, 15, 45);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        
        if(this.config.graphics === 'high') {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        document.body.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(200, 500, 200);
        if(this.config.graphics === 'high') sun.castShadow = true;
        scene.add(sun);
    },

    setupPhysics() {
        world = new CANNON.World();
        world.gravity.set(0, -9.82, 0);
    },

    createWorld() {
        const gGeo = new THREE.PlaneGeometry(6000, 25000, 80, 80);
        const pos = gGeo.attributes.position.array;
        for(let i=0; i<pos.length; i+=3) {
            const x = pos[i];
            const y = pos[i+1];
            if(Math.abs(x) > 65) {
                pos[i+2] = Math.sin(x*0.04) * 25 + Math.cos(y*0.01) * 20;
            }
        }
        gGeo.computeVertexNormals();
        const gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1 });
        const ground = new THREE.Mesh(gGeo, gMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const snowGeo = new THREE.BufferGeometry();
        const snowCount = this.config.graphics === 'high' ? 6000 : 2000;
        const pts = [];
        for(let i=0; i<snowCount; i++) pts.push(Math.random()*4000-2000, Math.random()*800, Math.random()*4000-2000);
        snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        snowflakes = new THREE.Points(snowGeo, new THREE.PointsMaterial({
            color: 0xffffff, 
            size: 0.15, 
            transparent: true, 
            opacity: 0.15,
            depthWrite: false
        }));
        scene.add(snowflakes);

        const group = new THREE.Group();
        const sled = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 4.2), new THREE.MeshStandardMaterial({
            color: [0xc0392b, 0x2980b9, 0x27ae60][this.config.skin], 
            metalness: 0.6,
            emissive: [0xc0392b, 0x2980b9, 0x27ae60][this.config.skin],
            emissiveIntensity: 0.2
        }));
        sled.castShadow = true;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.2), new THREE.MeshStandardMaterial({color: 0x111111}));
        seat.position.y = 0.5;
        group.add(sled, seat);
        
        const glow = new THREE.PointLight([0xffffff, 0x2980b9, 0x27ae60][this.config.skin], 1.5, 15);
        glow.position.y = 2;
        group.add(glow);

        player = group;
        player.position.set(0, playerY, 0);
        player.renderOrder = 999;
        scene.add(player);

        playerBody = new CANNON.Body({ mass: 1, isTrigger: true });
        playerBody.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1, 2.1)));
        playerBody.position.set(0, playerY, 0);
        world.addBody(playerBody);

        for(let i=0; i<300; i++) this.spawnObstacle(-600 - i * 45);
        
        for(let i=0; i<150; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const hill = new THREE.Mesh(new THREE.SphereGeometry(60 + Math.random()*120, 16, 12), new THREE.MeshStandardMaterial({color: 0xfafafa}));
            hill.position.set(side * (300 + Math.random()*500), -50, -i * 180);
            scene.add(hill);
        }
    },

    spawnObstacle(z) {
        const type = Math.random();
        const x = (Math.random() - 0.5) * WORLD_WIDTH * 2.8;
        let mesh, shape, bodyY, isMoving = false;

        if(type < 0.1) { // Gift
            mesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.5, 3.5), new THREE.MeshStandardMaterial({color: 0xf1c40f, metalness: 0.6}));
            bodyY = 1.75; shape = new CANNON.Box(new CANNON.Vec3(1.75, 1.75, 1.75));
        } else if(type < 0.2) { // Rock
            mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(5, 0), new THREE.MeshStandardMaterial({color: 0x444444, flatShading: true}));
            bodyY = 2.5; shape = new CANNON.Sphere(5);
        } else if(type < 0.3) { // Speed Boost Pad (Interactive)
            mesh = new THREE.Group();
            const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 8), new THREE.MeshStandardMaterial({color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.5}));
            const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0, 3, 4, 3), new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xffffff}));
            arrow.rotation.x = -Math.PI/2; arrow.position.y = 0.5;
            mesh.add(pad, arrow);
            bodyY = 0.2; shape = new CANNON.Box(new CANNON.Vec3(5, 0.2, 4));
        } else if(type < 0.4) { // Ramp
            mesh = new THREE.Group();
            const ramp = new THREE.Mesh(new THREE.BoxGeometry(15, 6, 25), new THREE.MeshStandardMaterial({color: 0xdddddd}));
            ramp.rotation.x = -0.25;
            mesh.add(ramp);
            bodyY = 3; shape = new CANNON.Box(new CANNON.Vec3(7.5, 3, 12.5));
        } else if(type < 0.5) { // Giant Moving Snowball (New)
            mesh = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshStandardMaterial({color: 0xffffff}));
            bodyY = 6; shape = new CANNON.Sphere(6);
            isMoving = true;
        } else { // Tree
            mesh = new THREE.Group();
            mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 6), new THREE.MeshStandardMaterial({color: 0x3d2b1f})));
            for(let l=0; l<4; l++) {
                const leaves = new THREE.Mesh(new THREE.ConeGeometry(8 - l*1.5, 10, 8), new THREE.MeshStandardMaterial({color: 0x0a3d24}));
                leaves.position.y = 8 + l*5; mesh.add(leaves);
            }
            bodyY = 12; shape = new CANNON.Box(new CANNON.Vec3(2.5, 9, 2.5));
        }

        mesh.position.set(x, 0, z);
        scene.add(mesh);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
        body.position.set(x, bodyY, z);
        
        // Triggers for non-fatal objects
        if(type < 0.1 || type < 0.3 || type < 0.4) body.isTrigger = true;

        body.addEventListener("collide", (e) => {
            if(!gameActive) return;
            const isPlayer = (e.body === playerBody || e.target === playerBody);
            if(isPlayer) {
                if(type < 0.1) { // Gift
                    giftCount++;
                    document.getElementById('gifts-hud').innerText = giftCount;
                    localStorage.setItem('sr3d_gifts', (parseInt(localStorage.getItem('sr3d_gifts') || 0) + 1));
                    this.playSound('gift');
                    scene.remove(mesh); world.removeBody(body);
                } else if(type < 0.3) { // Speed Boost
                    currentSpeed += 25;
                    this.playSound('boost');
                } else if(type < 0.4) { // Ramp
                    if(!isJumping) { isJumping = true; playerVelY = 35; this.playSound('boost'); }
                } else { // Crash (Trees, Rocks, Snowballs)
                    this.crash();
                }
            }
        });

        world.addBody(body);
        obstacles.push({ mesh, body, type, isMoving, originalX: x });
    },

    start(diff) {
        const dMap = { easy: 70, medium: 110, hard: 160 };
        currentSpeed = dMap[diff];
        score = 0; giftCount = 0;
        document.getElementById('gifts-hud').innerText = '0';
        document.getElementById('score-hud').innerText = '0';
        document.getElementById('menu').style.display = 'none';
        document.getElementById('hud').style.visibility = 'visible';
        
        gameActive = true;
        startTime = Date.now();
        this.playSound('bg');
        this.playSound('slide');
    },

    crash() {
        if(!gameActive) return;
        gameActive = false;
        this.stopSound('slide');
        this.playSound('crash');
        
        for(let i=0; i<40; i++) {
            const size = 0.3 + Math.random() * 0.7;
            const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({color: [0xc0392b, 0x2980b9, 0x27ae60][this.config.skin]}));
            const b = new CANNON.Body({ mass: 1 });
            b.addShape(new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)));
            b.position.set(player.position.x, player.position.y, player.position.z);
            b.velocity.set((Math.random()-0.5)*80, 40 + Math.random()*30, (Math.random()-0.5)*80);
            scene.add(m); world.addBody(b);
            debris.push({mesh: m, body: b});
        }
        scene.remove(player);
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('final-time').innerText = Math.floor(score) + 's';
        document.getElementById('final-gifts').innerText = giftCount;
    },

    retry() { location.reload(); },
    toMenu() { location.reload(); },

    setupAudio() {
        const urls = {
            bg: 'https://assets.mixkit.co/music/preview/mixkit-winter-forest-background-ambience-1210.mp3',
            crash: 'https://assets.mixkit.co/sfx/preview/mixkit-heavy-impact-3012.mp3',
            gift: 'https://assets.mixkit.co/sfx/preview/mixkit-sci-fi-confirmation-914.mp3',
            slide: 'https://assets.mixkit.co/sfx/preview/mixkit-shoveling-snow-step-2443.mp3',
            boost: 'https://assets.mixkit.co/sfx/preview/mixkit-fast-rocket-whoosh-1714.mp3'
        };
        for(let key in urls) {
            sounds[key] = new Audio(urls[key]);
            if(key === 'bg' || key === 'slide') sounds[key].loop = true;
            sounds[key].volume = this.config.volume;
        }
    },

    playSound(key) { if(sounds[key]) { sounds[key].currentTime = 0; sounds[key].play().catch(()=>{}); } },
    stopSound(key) { if(sounds[key]) sounds[key].pause(); },

    setupUI() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.tab-btn, .panel').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            };
        });
        document.getElementById('best-hud').innerText = localStorage.getItem('sr3d_hs') || 0;
        document.getElementById('garage-gifts').innerText = localStorage.getItem('sr3d_gifts') || 0;
    },

    setupControls() {
        window.onkeydown = (e) => keys[e.key.toLowerCase()] = true;
        window.onkeyup = (e) => keys[e.key.toLowerCase()] = false;
    },

    updateSetting(key, val) {
        this.config[key] = val;
        localStorage.setItem('sr3d_' + key, val);
        if(key === 'fov') { camera.fov = parseInt(val); camera.updateProjectionMatrix(); }
        if(key === 'graphics') location.reload();
        if(key === 'volume') for(let k in sounds) sounds[k].volume = val;
    },

    setSkin(id) {
        this.config.skin = id;
        localStorage.setItem('sr3d_skin', id);
        if(player) {
            player.children[0].material.color.set([0xc0392b, 0x2980b9, 0x27ae60][id]);
            player.children[0].material.emissive.set([0xc0392b, 0x2980b9, 0x27ae60][id]);
        }
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = 0.016;

        if(!gameActive) {
            if(playerBody) { playerBody.velocity.set(0,0,0); playerBody.position.set(0, playerY, 0); }
            if(player) player.position.set(0, playerY, 0);
            debris.forEach(d => { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
            world.step(dt);
        }

        if(gameActive) {
            let input = 0;
            if(keys['a'] || keys['arrowleft']) input -= 1;
            if(keys['d'] || keys['arrowright']) input += 1;
            
            playerVelX += input * 360 * this.config.sensitivity * dt;
            playerVelX *= 0.82;
            playerX += playerVelX * dt;
            playerX = Math.max(-WORLD_WIDTH/2 - 20, Math.min(WORLD_WIDTH/2 + 20, playerX));

            if((keys[' '] || keys['w'] || keys['arrowup']) && !isJumping) {
                isJumping = true; playerVelY = 32;
                this.playSound('boost');
            }
            if(isJumping) {
                playerVelY -= 65 * dt;
                playerY += playerVelY * dt;
                if(playerY <= 0.75) { playerY = 0.75; isJumping = false; }
            }

            player.position.set(playerX, playerY, 0);
            player.rotation.z += (-input * 0.45 - player.rotation.z) * 0.18;
            player.rotation.y = -player.rotation.z * 0.6;
            playerBody.position.copy(player.position);

            score = (Date.now() - startTime) / 1000;
            document.getElementById('score-hud').innerText = Math.floor(score);
            document.getElementById('speed-val').innerText = Math.floor(currentSpeed * 1.5);
            currentSpeed += 0.4 * dt;

            const speedFOV = parseInt(this.config.fov) + (currentSpeed - 60) * 0.3;
            camera.fov += (speedFOV - camera.fov) * 0.05;
            camera.updateProjectionMatrix();

            obstacles.forEach(obj => {
                obj.body.position.z += currentSpeed * dt;
                if(obj.isMoving) {
                    obj.body.position.x = obj.originalX + Math.sin(Date.now()*0.002 + obj.body.position.z*0.01) * 30;
                    obj.mesh.rotation.x += 0.1;
                }
                if(obj.body.position.z > 250) {
                    obj.body.position.z = -12000;
                    obj.body.position.x = (Math.random()-0.5) * WORLD_WIDTH * 2.5;
                    obj.originalX = obj.body.position.x;
                }
                obj.mesh.position.copy(obj.body.position);
            });

            const snow = snowflakes.geometry.attributes.position.array;
            for(let i=1; i<snow.length; i+=3) {
                snow[i] -= 3.5; if(snow[i] < 0) snow[i] = 600;
            }
            snowflakes.geometry.attributes.position.needsUpdate = true;

            camera.position.x += (playerX * 0.85 - camera.position.x) * 0.08;
            camera.position.y += (13 + (currentSpeed-60)*0.15 - camera.position.y) * 0.07;
            camera.lookAt(playerX * 0.4, 4, -150);

            world.step(dt);
        }
        renderer.render(scene, camera);
    }
};

window.addEventListener('load', () => game.init());
window.onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};
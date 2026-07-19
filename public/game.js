const socket = io();

// --- THREE.JS KURULUMU ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Işıklandırma
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// Blok Geometrisi ve Materyalleri (Performans için tek geometri)
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = {
    1: new THREE.MeshLambertMaterial({ color: 0x55dd55 }), // Toprak/Çim
    2: new THREE.MeshLambertMaterial({ color: 0x888888 })  // Taş
};

let worldBlocks = {}; // İçinde meshleri tutacak
let remotePlayers = {}; // Diğer oyuncuların meshleri

// --- DELTA TIME & HAREKET HIZI SENKRONİZASYONU ---
// Tableti güçlü olanın hızlı koşmasını engellemek için zaman tabanlı hesaplama
let clock = new THREE.Clock();
const PLAYER_SPEED = 5.0; // Saniyede 5 birim kare hareket

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let moveDirection = new THREE.Vector3();

// --- KONTROLLER VE POINTER LOCK ---
const instructions = document.getElementById('instructions');
document.addEventListener('click', () => {
    document.body.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        instructions.style.display = 'none';
    } else {
        instructions.style.display = 'block';
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== document.body) return;
    camera.rotation.y -= e.movementX * 0.002;
    camera.rotation.x -= e.movementY * 0.002;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
});

// Klavye Dinleyicileri
const onKeyDown = (e) => {
    if (e.code === 'KeyW') moveForward = true;
    if (e.code === 'KeyS') moveBackward = true;
    if (e.code === 'KeyA') moveLeft = true;
    if (e.code === 'KeyD') moveRight = true;
};
const onKeyUp = (e) => {
    if (e.code === 'KeyW') moveForward = false;
    if (e.code === 'KeyS') moveBackward = false;
    if (e.code === 'KeyA') moveLeft = false;
    if (e.code === 'KeyD') moveRight = false;
};
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// İlk başta boş bir zemin oluşturalım (Veri tabanında hiç blok yoksa diye başlangıç)
function createInitialFloor() {
    for(let x = -10; x < 10; x++) {
        for(let z = -10; z < 10; z++) {
            const id = `${x},0,${z}`;
            spawnBlock(x, 0, z, 1, id);
        }
    }
}

function spawnBlock(x, y, z, type, id) {
    if (worldBlocks[id]) return;
    const mesh = new THREE.Mesh(blockGeometry, materials[type]);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    worldBlocks[id] = mesh;
}

// --- BLOK ETKİLEŞİMİ (Kırma / Koyma) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0); // Ekranın tam ortası

document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== document.body) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(worldBlocks));

    if (intersects.length > 0) {
        const intersect = intersects[0];

        if (e.button === 0) { // SOL TIK: BLOK KIRMA
            const clickedMesh = intersect.object;
            let targetId = null;
            for (let id in worldBlocks) {
                if (worldBlocks[id] === clickedMesh) {
                    targetId = id;
                    break;
                }
            }
            if (targetId) {
                scene.remove(clickedMesh);
                delete worldBlocks[targetId];
                socket.emit('blockBreak', { blockId: targetId });
            }
        } 
        else if (e.button === 2) { // SAĞ TIK: BLOK KOYMA
            const position = new THREE.Vector3();
            position.copy(intersect.point).add(intersect.face.normal).round(); // Normal doğrultusunda yuvarla

            const newId = `${position.x},${position.y},${position.z}`;
            spawnBlock(position.x, position.y, position.z, 2, newId);
            socket.emit('blockPlace', { blockId: newId, type: 2 });
        }
    }
});
// Sağ tık menüsünü engellemek için
document.addEventListener('contextmenu', e => e.preventDefault());


// --- SOCKET.IO AĞ OLAYLARI ---
socket.on('currentWorld', (worldData) => {
    if (Object.keys(worldData).length === 0) {
        createInitialFloor();
    } else {
        for (let id in worldData) {
            const [x, y, z] = id.split(',').map(Number);
            spawnBlock(x, y, z, worldData[id], id);
        }
    }
});

socket.on('blockPlaced', (data) => {
    const [x, y, z] = data.blockId.split(',').map(Number);
    spawnBlock(x, y, z, data.type, data.blockId);
});

socket.on('blockBroken', (data) => {
    if (worldBlocks[data.blockId]) {
        scene.remove(worldBlocks[data.blockId]);
        delete worldBlocks[data.blockId];
    }
});

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            createPlayerMesh(id, players[id]);
        }
    });
});

socket.on('playerJoined', (data) => {
    if (data.id !== socket.id) {
        createPlayerMesh(data.id, data.pos);
    }
});

socket.on('playerMoved', (data) => {
    if (remotePlayers[data.id]) {
        remotePlayers[data.id].position.set(data.pos.x, data.pos.y, data.pos.z);
        remotePlayers[data.id].rotation.y = data.pos.rotation;
    }
});

socket.on('playerLeft', (id) => {
    if (remotePlayers[id]) {
        scene.remove(remotePlayers[id]);
        delete remotePlayers[id];
    }
});

function createPlayerMesh(id, pos) {
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    scene.add(mesh);
    remotePlayers[id] = mesh;
}

// Başlangıç Kamera Pozisyonu
camera.position.set(0, 3, 5);
camera.rotation.order = "YXZ"; // Kamera rotasyon sırası düzeltildi

// --- ANA OYUN DÖNGÜSÜ (TICK RATE / FPS BAĞIMSIZ) ---
function animate() {
    requestAnimationFrame(animate);

    // Delta time alınıyor (Her cihazda aynı hızda hareket için kritik nokta!)
    const delta = clock.getDelta();

    // Kamera/Oyuncu Hareket Hesaplaması
    moveDirection.z = Number(moveBackward) - Number(moveForward);
    moveDirection.x = Number(moveRight) - Number(moveLeft);
    moveDirection.normalize();

    // İleri/Geri ve Sağ/Sol yön vektörlerini kameranın baktığı açıya göre ayarla
    const camDirection = new THREE.Vector3();
    camera.getWorldDirection(camDirection);
    camDirection.y = 0; // Uçmayı engellemek için y eksenini sıfırla
    camDirection.normalize();

    const camSideways = new THREE.Vector3(-camDirection.z, 0, camDirection.x);

    if (moveForward || moveBackward) {
        camera.position.addScaledVector(camDirection, moveDirection.z * PLAYER_SPEED * delta);
    }
    if (moveLeft || moveRight) {
        camera.position.addScaledVector(camSideways, moveDirection.x * PLAYER_SPEED * delta);
    }

    // Pozisyonu sunucuya bildir (Sadece hareket ediyorsak)
    if (moveForward || moveBackward || moveLeft || moveRight || Math.abs(camera.rotation.y) > 0) {
        socket.emit('playerMove', {
            x: camera.position.x,
            y: camera.position.y - 1, // Göz hizasından ayak hizasına
            z: camera.position.z,
            rotation: camera.rotation.y
        });
    }

    renderer.render(scene, camera);
}

// Ekran Boyutu Değişirse Uyarla
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

let scene, camera, renderer, clock;
let localPlayerId;
let remotePlayers = {};
let blocks = {};
let isGameStarted = false;

// Mobil Kontrol Değişkenleri
let moveJoystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0 };
let moveForward = 0, moveLeft = 0;
let playerVelocity = new THREE.Vector3();
let playerDirection = new THREE.Vector3();
let pitch = 0, yaw = 0; // Kamera rotasyonları

// Oyunu Başlatma Butonuna Basıldığında Çalışacak Fonksiyon
function startGame() {
    const worldAccess = document.getElementById('world-access').value;
    document.getElementById('play-menu').classList.add('hidden');
    document.getElementById('crosshair').classList.remove('hidden');
    
    isGameStarted = true;
    initGame3D();
}

// --- 3D OYUN DÜNYASI KURULUMU ---
function initGame3D() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Minecraft Gökyüzü Mavisi
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.05);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 0); // Başlangıç pozisyonu

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Işıklandırmalar
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    // Temel Dünya Haritası Oluşturma (Taban Çimen Katmanı)
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x55aa44 });

    for (let x = -15; x <= 15; x++) {
        for (let z = -15; z <= 15; z++) {
            const block = new THREE.Mesh(blockGeo, grassMat);
            block.position.set(x, 0, z);
            scene.add(block);
            blocks[`${x},0,${z}`] = block;
        }
    }

    // Dokunmatik Kontrolleri Tanımla
    setupMobileControls();

    // Klavye Kontrolleri (PC için yedek)
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Döngüyü Başlat
    animateGame();
}

// --- KOSTÜMLÜ OYUNCU (STEVE) OLUŞTURMA SİHİRBAZI ---
function createSteveMesh(colorArray) {
    const playerGroup = new THREE.Group();
    const pixelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // 8x8'lik piksel dizisini 3D küp kafaya dönüştürür (Editörün aynısı)
    let idx = 0;
    for (let y = 4; y > -4; y--) {
        for (let x = -4; x < 4; x++) {
            const colorHex = colorArray[idx] || "#ffffff";
            const pixelMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorHex) });
            const pMesh = new THREE.Mesh(pixelGeo, pixelMat);
            // Kafayı hafif yukarı yerleştiriyoruz ki gövde hizası otursun
            pMesh.position.set(x * 0.1, (y * 0.1) + 1.2, 0); 
            playerGroup.add(pMesh);
            idx++;
        }
    }

    // Basit Gövde/Bacak Kutusu (Kostüm tamamlayıcı)
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3355ff });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.6, 0);
    playerGroup.add(bodyMesh);

    return playerGroup;
}

// --- MOBİL DOKUNMATİK JOYSTICK SİSTEMİ ---
function setupMobileControls() {
    // Sol Ekran: Yürüme Joysticki, Sağ Ekran: Kamera/Blok İşlemleri
    window.addEventListener('touchstart', (e) => {
        if (!isGameStarted) return;
        const touch = e.touches[0];
        
        if (touch.clientX < window.innerWidth / 2) {
            // Ekranın sol yarısı -> Joystick Başlat
            moveJoystick.active = true;
            moveJoystick.startX = touch.clientX;
            moveJoystick.startY = touch.clientY;
            moveJoystick.curX = touch.clientX;
            moveJoystick.curY = touch.clientY;
        } else {
            // Ekranın sağ yarısı -> Kamera döndürme başlangıcı veya blok etkileşimi
            moveJoystick.rightTouchId = touch.identifier;
            moveJoystick.rightStartX = touch.clientX;
            moveJoystick.rightStartY = touch.clientY;
            moveJoystick.rightLastX = touch.clientX;
            moveJoystick.rightLastY = touch.clientY;
            moveJoystick.rightTime = Date.now();
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!isGameStarted) return;
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            
            if (touch.clientX < window.innerWidth / 2 && moveJoystick.active) {
                // Sol taraf sürükleme -> Joystick hareket ettir
                moveJoystick.curX = touch.clientX;
                moveJoystick.curY = touch.clientY;

                let dx = moveJoystick.curX - moveJoystick.startX;
                let dy = moveJoystick.curY - moveJoystick.startY;
                let dist = Math.sqrt(dx*dx + dy*dy);
                if(dist > 50) { dx = (dx/dist)*50; dy = (dy/dist)*50; }

                moveForward = -dy / 50;
                moveLeft = -dx / 50;
            } else {
                // Sağ taraf sürükleme -> Kamerayı Çevir
                let rdx = touch.clientX - moveJoystick.rightLastX;
                let rdy = touch.clientY - moveJoystick.rightLastY;

                yaw -= rdx * 0.005;
                pitch -= rdy * 0.005;
                pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, pitch));

                moveJoystick.rightLastX = touch.clientX;
                moveJoystick.rightLastY = touch.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        // Hangi dokunuşun bittiğini kontrol et
        if (e.touches.length === 0 || e.changedTouches[0].clientX < window.innerWidth / 2) {
            moveJoystick.active = false;
            moveForward = 0;
            moveLeft = 0;
        } else {
            // Sağ ekranda kısa süreli dokunuş olduysa (Sürükleme az ise) -> BLOK KOY/KIR
            let duration = Date.now() - moveJoystick.rightTime;
            let moveDist = Math.sqrt(Math.pow(moveJoystick.rightLastX - moveJoystick.rightStartX, 2) + Math.pow(moveJoystick.rightLastY - moveJoystick.rightStartY, 2));
            if (duration < 250 && moveDist < 10) {
                handleScreenTap();
            }
        }
    });
}

// Dokunarak Blok Kırma/Koyma Mekaniği
function handleScreenTap() {
    const raycaster = new THREE.Raycaster();
    // Ekranın tam ortasını (Crosshair'in olduğu yer) hedef alıyoruz
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(blocks));

    if (intersects.length > 0) {
        const hit = intersects[0];
        // Basitlik adına: Eğer tıklanan blok y=0 (Zemin) ise üzerine blok koy, yüksekse kır
        if (hit.object.position.y === 0) {
            const blockGeo = new THREE.BoxGeometry(1, 1, 1);
            const blockMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b }); // Tahta/Toprak rengi
            const newBlock = new THREE.Mesh(blockGeo, blockMat);
            newBlock.position.copy(hit.object.position).add(hit.face.normal);
            scene.add(newBlock);
            blocks[`${newBlock.position.x},${newBlock.position.y},${newBlock.position.z}`] = newBlock;
        } else {
            scene.remove(hit.object);
            delete blocks[`${hit.object.position.x},${hit.object.position.y},${hit.object.position.z}`];
        }
    }
}

// --- PC KLAVYE DESTEĞİ (Yedek & Test İçin) ---
function onKeyDown(e) {
    if(!isGameStarted) return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') moveForward = 1;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') moveForward = -1;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveLeft = 1;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') moveLeft = -1;
}
function onKeyUp(e) {
    if(!isGameStarted) return;
    if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) moveForward = 0;
    if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) moveLeft = 0;
}

// --- ANA OYUN DÖNGÜSÜ (Delta Time & Senkronizasyon) ---
function animateGame() {
    if (!isGameStarted) return;
    requestAnimationFrame(animateGame);

    const delta = clock.getDelta();

    // Kameranın Bakış Açısını Güncelle (Sağ ekran sürüklemesi)
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);

    // Hareket Fizikleri (Delta Time ile hız sabitleme)
    playerVelocity.x -= playerVelocity.x * 10.0 * delta;
    playerVelocity.z -= playerVelocity.z * 10.0 * delta;

    playerDirection.z = Number(moveForward) - Number(false);
    playerDirection.x = Number(moveLeft) - Number(false);
    playerDirection.normalize();

    if (moveForward !== 0) playerVelocity.z -= playerDirection.z * 40.0 * delta;
    if (moveLeft !== 0) playerVelocity.x -= playerDirection.x * 40.0 * delta;

    camera.translateX(-playerVelocity.x * delta);
    camera.translateZ(-playerVelocity.z * delta);
    camera.position.y = 2; // Havada uçmayı önle, zeminde tut

    // Pozisyonumuzu Sunucuya ve Diğer Oyunculara Gönder
    socket.emit('playerMove', {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        rotation: yaw
    });

    renderer.render(scene, camera);
}

// --- SUNUCUDAN GELEN ÇOKLU OYUNCU BİLGİLERİ ---
socket.on('loginSuccess', (data) => {
    localPlayerId = socket.id;
    // Mevcut aktif oyuncuları haritaya ekle (Kostümleriyle birlikte!)
    for (let id in data.activePlayers) {
        if (id !== localPlayerId) {
            addRemotePlayer(id, data.activePlayers[id]);
        }
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== localPlayerId) {
        addRemotePlayer(data.id, data.player);
    }
});

function addRemotePlayer(id, pData) {
    if (remotePlayers[id]) scene.remove(remotePlayers[id]);
    
    // Sunucudan gelen skinData dizisiyle 3D Steve modelini oluşturuyoruz!
    const playerMesh = createSteveMesh(pData.skin);
    playerMesh.position.set(pData.x, pData.y, pData.z);
    scene.add(playerMesh);
    remotePlayers[id] = playerMesh;
}

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

function onWindowResize() {
    if(!isGameStarted) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

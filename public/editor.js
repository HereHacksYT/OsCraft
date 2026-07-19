const socket = io();
let editorScene, editorCamera, editorRenderer, steveMesh;
let isRotating = false;
let previousMousePosition = { x: 0, y: 0 };
let skinPixels = Array(64).fill("#ffffff"); // 8x8 yüz matrisi

// Arayüz Geçiş Fonksiyonları
function login() {
    const user = document.getElementById('username-input').value.trim();
    if(user) socket.emit('login', user);
}

socket.on('loginSuccess', (data) => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `Hoş Geldin, ${data.user.username}!`;
    skinPixels = data.user.skinData;
    updateFriendsUI(data.user.friends);
});

function openSkinEditor() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('skin-editor-panel').classList.remove('hidden');
    initEditor3D();
}

// --- 3D EDİTÖR MOTORU ---
function initEditor3D() {
    const container = document.getElementById('canvas-container');
    container.innerHTML = ""; // Temizle

    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x2c3e50);

    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    editorCamera.position.set(0, 0, 5);

    editorRenderer = new THREE.WebGLRenderer({ antialias: true });
    editorRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(editorRenderer.domElement);

    const light1 = new THREE.AmbientLight(0xffffff, 0.7);
    editorScene.add(light1);
    const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
    light2.position.set(5, 10, 5);
    editorScene.add(light2);

    // 8x8 Piksel Küplerinden Oluşan Steve Kafası Oluşturma
    steveMesh = new THREE.Group();
    const cubeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);

    let index = 0;
    for (let y = 3; y >= -4; y--) {
        for (let x = -4; x < 4; x++) {
            const colorVal = skinPixels[index] || "#ffffff";
            const cubeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorVal) });
            const pixelCube = new THREE.Mesh(cubeGeo, cubeMat);
            pixelCube.position.set(x * 0.21, y * 0.21, 0);
            pixelCube.userData = { pixelIndex: index }; // Hangi piksel olduğunu kaydet
            steveMesh.add(pixelCube);
            index++;
        }
    }
    editorScene.add(steveMesh);

    // Dokunma ve Mouse Olayları (Döndürme ve Boyama Ayrımı)
    container.addEventListener('mousedown', onEditorMouseDown);
    container.addEventListener('mousemove', onEditorMouseMove);
    container.addEventListener('mouseup', () => isRotating = false);
    
    // Mobil Dokunmatik Desteği
    container.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        onEditorMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target: e.target });
    });
    container.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        onEditorMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    });
    container.addEventListener('touchend', () => isRotating = false);

    animateEditor();
}

function animateEditor() {
    if (!editorScene) return;
    requestAnimationFrame(animateEditor);
    editorRenderer.render(editorScene, editorCamera);
}

// Tıklama Algılama (Boyama mı Döndürme mi?)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onEditorMouseDown(e) {
    const container = document.getElementById('canvas-container');
    const rect = editorRenderer.domElement.getBoundingClientRect();
    
    // Tıklanan yerin 3D koordinatını bul
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, editorCamera);
    const intersects = raycaster.intersectObjects(steveMesh.children);

    if (intersects.length > 0) {
        // Bir küpe tıklandı -> BOYAMA YAP
        const clickedCube = intersects[0].object;
        const chosenColor = document.getElementById('pixel-color').value;
        clickedCube.material.color.set(chosenColor);
        skinPixels[clickedCube.userData.pixelIndex] = chosenColor; // Rengi diziye kaydet
    } else {
        // Boşluğa tıklandı -> DÖNDÜRME MODU
        isRotating = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    }
}

function onEditorMouseMove(e) {
    if (!isRotating) return;
    const deltaMove = { x: e.clientX - previousMousePosition.x, y: e.clientY - previousMousePosition.y };
    
    steveMesh.rotation.y += deltaMove.x * 0.01;
    steveMesh.rotation.x += deltaMove.y * 0.01;

    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function saveSkinAndExit() {
    socket.emit('saveSkin', skinPixels); // Sunucuya ve MongoDB'ye gönder
    document.getElementById('skin-editor-panel').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    editorScene = null; // Belleği temizle
}

// --- ARKADAŞ SİSTEMİ KONTROLLERİ ---
function openOynaMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('play-menu').classList.remove('hidden');
}
function backToMain() {
    document.getElementById('play-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
}
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}
function searchFriend() {
    const name = document.getElementById('friend-search-input').value.trim();
    if(name) socket.emit('searchFriend', name);
}
socket.on('friendFound', (name) => {
    document.getElementById('search-result').innerHTML = `<p style="color:#55ff55">${name} bulundu! <button onclick="addFriend('${name}')" style="width:auto; padding:5px;">Ekle</button></p>`;
});
socket.on('friendNotFound', () => {
    document.getElementById('search-result').innerHTML = `<p style="color:#ff5555">Kullanıcı bulunamadı.</p>`;
});
function addFriend(name) {
    socket.emit('addFriend', name);
}
socket.on('friendAdded', (friendsList) => {
    updateFriendsUI(friendsList);
    document.getElementById('search-result').innerHTML = `<p style="color:#55ff55">Eklendi!</p>`;
});
function updateFriendsUI(friends) {
    const list = document.getElementById('friends-list');
    list.innerHTML = "";
    friends.forEach(f => {
        list.innerHTML += `<li>🟩 ${f}</li>`;
    });
}

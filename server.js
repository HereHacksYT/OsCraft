const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Bağlantısı
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/oscraft";
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Pro Sürüm Bağlantısı Başarılı!"))
  .catch(err => console.error("Veri tabanı hatası:", err));

// --- YENİ MONGODB ŞEMALARI ---

// Oyuncu ve Kostüm Şeması
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    skinData: { type: [String], default: Array(64).fill("#ffffff") }, // 8x8'lik basit Steve yüzü/vücudu için renk dizisi
    friends: { type: [String], default: [] } // Arkadaşların kullanıcı adları
});
const User = mongoose.model('User', UserSchema);

// Dünya Şeması
const WorldSchema = new mongoose.Schema({
    worldName: { type: String, default: "Ana Dunya" },
    owner: String,
    isPublic: { type: Boolean, default: true },
    blocks: [{ blockId: String, type: Number }]
});
const World = mongoose.model('World', WorldSchema);

// --- SOCKET.IO OYUN LOGİC ---
let activePlayers = {};

io.on('connection', (socket) => {
    console.log(`Bağlantı: ${socket.id}`);

    // Giriş Yapma / Hesap Oluşturma
    socket.on('login', async (username) => {
        let user = await User.findOne({ username });
        if (!user) {
            user = new User({ username });
            await user.save();
        }
        socket.username = username;
        activePlayers[socket.id] = { username, x: 0, y: 5, z: 0, rotation: 0, skin: user.skinData };
        
        socket.emit('loginSuccess', { user, activePlayers });
        socket.broadcast.emit('playerJoined', { id: socket.id, player: activePlayers[socket.id] });
    });

    // Kostüm Kaydetme
    socket.on('saveSkin', async (skinData) => {
        if (socket.username) {
            await User.findOneAndUpdate({ username: socket.username }, { skinData });
            if (activePlayers[socket.id]) activePlayers[socket.id].skin = skinData;
            console.log(`${socket.username} kostümünü güncelledi!`);
        }
    });

    // Arkadaş Arama ve Ekleme
    socket.on('searchFriend', async (targetName) => {
        const target = await User.findOne({ username: targetName });
        if (target) {
            socket.emit('friendFound', targetName);
        } else {
            socket.emit('friendNotFound');
        }
    });

    socket.on('addFriend', async (targetName) => {
        if (socket.username && targetName !== socket.username) {
            await User.findOneAndUpdate({ username: socket.username }, { $addToSet: { friends: targetName } });
            const user = await User.findOne({ username: socket.username });
            socket.emit('friendAdded', user.friends);
        }
    });

    // Hareket Senkronizasyonu
    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            activePlayers[socket.id].z = data.z;
            activePlayers[socket.id].rotation = data.rotation;
            socket.broadcast.emit('playerMoved', { id: socket.id, pos: data });
        }
    });

    socket.on('disconnect', () => {
        delete activePlayers[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT} üzerinde uçuyor...`));

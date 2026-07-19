const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 1. MONGODB BAĞLANTISI (Kayıt Sistemi) ---
// NOT: Render'a yüklerken Environment Variables kısmına MONGO_URI ekleyeceksin.
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:2017/oscraft"; 
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB'ye başarıyla bağlanıldı! Dünyalar güvende."))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Dünya Şeması
const WorldSchema = new mongoose.Schema({
    blockId: String, // "x,y,z" formatında
    type: Number     // Blok tipi (1: Toprak, 2: Taş vb.)
});
const Block = mongoose.model('Block', WorldSchema);

// --- 2. OYUNCU VE DÜNYA YÖNETİMİ ---
let players = {};

io.on('connection', async (socket) => {
    console.log(`Yeni oyuncu bağlandı: ${socket.id}`);

    // Yeni gelen oyuncuya mevcut tüm dünyayı veri tabanından çekip gönderiyoruz
    try {
        const savedWorld = await Block.find({});
        const worldData = {};
        savedWorld.forEach(b => { worldData[b.blockId] = b.type; });
        socket.emit('currentWorld', worldData);
    } catch (err) {
        console.error("Dünya yüklenirken hata oluştu:", err);
    }

    // Yeni oyuncuyu diğerlerine bildir
    players[socket.id] = { x: 0, y: 5, z: 0, rotation: 0 };
    io.emit('playerJoined', { id: socket.id, pos: players[socket.id] });
    socket.emit('currentPlayers', players);

    // Oyuncu hareket ettiğinde (Herkes aynı hızda senkronize olsun diye)
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit('playerMoved', { id: socket.id, pos: data });
        }
    });

    // Blok Koyulduğunda (Veri tabanına kaydeder ve herkese iletir)
    socket.on('blockPlace', async (data) => {
        const { blockId, type } = data;
        socket.broadcast.emit('blockPlaced', data);
        
        // MongoDB'ye kaydet (Yoksa ekle, varsa güncelle)
        await Block.findOneAndUpdate({ blockId }, { type }, { upsert: true });
    });

    // Blok Kırıldığında (Veri tabanından siler ve herkese iletir)
    socket.on('blockBreak', async (data) => {
        const { blockId } = data;
        socket.broadcast.emit('blockBroken', data);
        
        // MongoDB'den sil
        await Block.deleteOne({ blockId });
    });

    // Oyuncu çıktığında
    socket.on('disconnect', () => {
        console.log(`Oyuncu ayrıldı: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});

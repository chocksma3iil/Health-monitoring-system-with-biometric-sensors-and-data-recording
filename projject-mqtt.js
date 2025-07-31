const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mqtt = require("mqtt");
const mysql = require("mysql");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware pour parser JSON
app.use(express.json());

// Servir les fichiers statiques depuis le dossier courant
app.use(express.static(path.join(__dirname, ".")));

// Route par défaut pour servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const MQTT_BROKER = "mqtt://test.mosquitto.org";
const MQTT_TOPIC = "sante/capteurs/utilisateur1";
const MQTT_THRESHOLD_TOPIC = "sante/seuils/utilisateur1";

const mqttClient = mqtt.connect(MQTT_BROKER);

// Seuils par défaut
let currentThresholds = {
  tempMin: 35.0,
  tempMax: 38.0,
  chuteMin: 5.0,
  chuteMax: 15.0
};

// Configuration MySQL avec pool de connexions pour plus de stabilité
const db = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "iot_user",
  password: "iot_password",
  database: "iot_health",
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

// Test de connexion MySQL
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Erreur MySQL:", err);
    console.error("Code d'erreur:", err.code);
    console.error("Message:", err.sqlMessage || err.message);
    // Vérifications communes
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("⚠️  Vérifiez le nom d'utilisateur et mot de passe MySQL");
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error("⚠️  La base de données 'iot_health' n'existe pas");
    } else if (err.code === 'ECONNREFUSED') {
      console.error("⚠️  MySQL n'est pas démarré ou n'écoute pas sur le port 3306");
    }
  } else {
    console.log("🗄️ Connecté à MySQL");
    connection.release();

    // Vérifier si la table existe
    const checkTableQuery = `
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'iot_health' 
      AND table_name = 'donnees_sante'
    `;
    
    db.query(checkTableQuery, (err, results) => {
      if (err) {
        console.error("❌ Erreur vérification table:", err);
      } else if (results[0].count === 0) {
        console.error("❌ La table 'donnees_sante' n'existe pas!");
        console.log("💡 Créez la table avec cette commande SQL:");
        console.log(`
CREATE TABLE donnees_sante (
  id INT AUTO_INCREMENT PRIMARY KEY,
  temp_corporelle FLOAT NOT NULL,
  temp_ambiante FLOAT NOT NULL,
  accX FLOAT NOT NULL,
  accY FLOAT NOT NULL,
  accZ FLOAT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);
      } else {
        console.log("✅ Table 'donnees_sante' trouvée");
        
        // Insertion automatique au démarrage
        const sql = `INSERT INTO donnees_sante (temp_corporelle, temp_ambiante, accX, accY, accZ) VALUES (?, ?, ?, ?, ?)`;
        const initialData = [36.5, 22.0, 0.1, 0.2, 9.8];
        
        db.query(sql, initialData, (err, result) => {
          if (err) {
            console.error("❌ Erreur insertion initiale MySQL:", err.sqlMessage || err.message);
            console.error("Code d'erreur:", err.code);
          } else {
            console.log("✅ Insertion initiale réussie, ID:", result.insertId);
          }
        });
      }
    });
  }
});

mqttClient.on("connect", () => {
  console.log("✅ Connecté au broker MQTT");
  
  // S'abonner aux topics de données et de seuils
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error("❌ Erreur abonnement données:", err);
    } else {
      console.log("📡 Abonné au topic données:", MQTT_TOPIC);
    }
  });
  
  mqttClient.subscribe(MQTT_THRESHOLD_TOPIC, (err) => {
    if (err) {
      console.error("❌ Erreur abonnement seuils:", err);
    } else {
      console.log("📡 Abonné au topic seuils:", MQTT_THRESHOLD_TOPIC);
    }
  });
});

mqttClient.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === MQTT_TOPIC) {
      // Message de données capteurs
      console.log("📨 Données capteurs reçues:", data);
      
      // Validation des données avant insertion
      if (!data.tempCorp || !data.tempAmb || data.accX === undefined || data.accY === undefined || data.accZ === undefined) {
        console.error("❌ Données incomplètes:", data);
        return;
      }
      
      // Sauvegarder en base de données
      const sql = `INSERT INTO donnees_sante (temp_corporelle, temp_ambiante, accX, accY, accZ) VALUES (?, ?, ?, ?, ?)`;
      const values = [data.tempCorp, data.tempAmb, data.accX, data.accY, data.accZ];
      
      console.log("💾 Tentative d'insertion:", values);
      
      db.query(sql, values, (err, result) => {
        if (err) {
          console.error("❌ Erreur insertion MySQL:", err.sqlMessage || err.message);
          console.error("Code d'erreur:", err.code);
          console.error("SQL:", sql);
          console.error("Valeurs:", values);
        } else {
          console.log("✅ Données insérées en base, ID:", result.insertId);
        }
      });
      
      // Envoyer aux clients WebSocket
      console.log("📤 Envoi données aux clients WebSocket");
      io.emit("updateData", data);
      
    } else if (topic === MQTT_THRESHOLD_TOPIC) {
      // Message de mise à jour des seuils depuis ESP32
      console.log("⚙️ Seuils mis à jour depuis ESP32:", data);
      
      // Mettre à jour les seuils locaux
      currentThresholds = { ...currentThresholds, ...data };
      
      // Notifier tous les clients WebSocket
      io.emit("thresholdUpdated", data);
    }
    
  } catch (err) {
    console.error("❌ Erreur parsing JSON:", err);
  }
});

// Fonction pour publier les seuils vers les ESP32
function publishThresholds(thresholds) {
  const payload = JSON.stringify(thresholds);
  mqttClient.publish(MQTT_THRESHOLD_TOPIC, payload);
  console.log("📤 Seuils publiés vers ESP32:", payload);
}

io.on("connection", (socket) => {
  console.log("🔗 Client WebSocket connecté:", socket.id);
  
  // Envoyer les seuils actuels au nouveau client
  socket.emit("thresholdUpdated", currentThresholds);
  
  // Envoyer des données de test
  socket.emit("updateData", {
    tempCorp: 36.5,
    tempAmb: 22.0,
    accX: 0.1,
    accY: 0.2,
    accZ: 9.8
  });
  
  // Gérer les mises à jour de seuils depuis l'interface web
  socket.on("updateThresholds", (data) => {
    console.log("⚙️ Mise à jour seuils depuis interface web:", data);
    
    // Mettre à jour les seuils locaux
    if (data.type === 'temperature') {
      currentThresholds.tempMin = data.tempMin;
      currentThresholds.tempMax = data.tempMax;
    } else if (data.type === 'chute') {
      currentThresholds.chuteMin = data.chuteMin;
      currentThresholds.chuteMax = data.chuteMax;
    } else if (data.type === 'reset') {
      currentThresholds = {
        tempMin: data.tempMin,
        tempMax: data.tempMax,
        chuteMin: data.chuteMin,
        chuteMax: data.chuteMax
      };
    }
    
    // Publier les nouveaux seuils vers les ESP32
    publishThresholds(currentThresholds);
    
    // Notifier tous les autres clients
    socket.broadcast.emit("thresholdUpdated", currentThresholds);
  });
  
  socket.on("disconnect", () => {
    console.log("🔌 Client déconnecté:", socket.id);
  });
});

// Route API pour obtenir les seuils actuels
app.get('/api/thresholds', (req, res) => {
  res.json(currentThresholds);
});

// Route API pour mettre à jour les seuils
app.post('/api/thresholds', (req, res) => {
  const { tempMin, tempMax, chuteMin, chuteMax } = req.body;
  
  // Validation des données
  if (tempMin >= tempMax) {
    return res.status(400).json({ error: 'tempMin doit être inférieur à tempMax' });
  }
  if (chuteMin >= chuteMax) {
    return res.status(400).json({ error: 'chuteMin doit être inférieur à chuteMax' });
  }
  
  // Mettre à jour les seuils
  currentThresholds = { tempMin, tempMax, chuteMin, chuteMax };
  
  // Publier vers les ESP32
  publishThresholds(currentThresholds);
  
  // Notifier les clients WebSocket
  io.emit("thresholdUpdated", currentThresholds);
  
  res.json({ success: true, thresholds: currentThresholds });
});

// Route API pour consulter les données
app.get('/api/data', (req, res) => {
  const sql = 'SELECT * FROM donnees_sante ORDER BY timestamp DESC LIMIT 50';
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Erreur récupération données:", err);
      res.status(500).json({ error: 'Erreur base de données' });
    } else {
      res.json(results);
    }
  });
});

// Publier les seuils par défaut au démarrage
setTimeout(() => {
  publishThresholds(currentThresholds);
  console.log("📤 Seuils par défaut publiés");
}, 2000);

// Utiliser le port 8080 comme dans votre configuration
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`🚀 Serveur HTTP démarré sur http://localhost:${PORT}`);
  console.log(`📡 WebSocket disponible sur ws://localhost:${PORT}`);
  console.log(`⚙️ Seuils par défaut:`, currentThresholds);
});
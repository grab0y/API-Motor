// server.js

require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');

// CORRECCIÓN: Usando los nombres de archivo que proporcionaste
const eventoRoutes = require('./routeEventos');
const { iniciarAnalisis } = require('./utilsAnalisis'); 
// 💡 NUEVO: Importar el middleware de autenticación
const { verificarToken } = require('./authMiddleware');

const app = express();
const port = process.env.PORT || 3000;
const ID_DE_TU_BOMBA = "Bomba_Reservorio_01"; 

// ===============================================
// 1. CONFIGURACIÓN DE MIDDLEWARES GLOBALES (DEBE IR PRIMERO)
// ===============================================

// Middleware CRÍTICO: Debe estar siempre al principio para parsear el JSON
app.use(express.json());

// 💡 Middleware de DEBUG (añadido para confirmar la llegada de la petición)
app.use((req, res, next) => {
    console.log(`[DEBUG - Petición Recibida] Método: ${req.method}, URL: ${req.originalUrl}`);
    next();
});

// Ruta de prueba nuclear que usamos antes
app.post('/', (req, res) => {
    console.log("🟢 [PRUEBA] Conexión POST a la raíz (/). ¡Express está vivo!");
    res.status(200).json({ status: 'Express vivo', test: 'ok' });
});

// 2. Ruta principal para los eventos de la bomba
// 🚨 APLICAMOS el middleware verificarToken AQUÍ para proteger TODAS las rutas en /api/bomba
app.use('/api/bomba', verificarToken, eventoRoutes); 

// ===============================================
// 3. CONEXIÓN A LA BASE DE DATOS E INICIO DEL SERVIDOR
// ===============================================

mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'bombas' 
  })
  .then(() => {
    console.log('✅ Conectado a MongoDB Atlas/Local. (Usando DB: bombas)');
    
    // ⭐️ INICIAMOS EL ANÁLISIS CRON
    iniciarAnalisis(ID_DE_TU_BOMBA); 
    
    // 4. INICIAR EL SERVIDOR SOLO DESPUÉS DE LA CONEXIÓN EXITOSA
    app.listen(port, () => {
        console.log(`🚀 Servidor Express escuchando en http://localhost:${port}`);
    });
    
  })
  .catch((err) => {
    // Si la conexión falla, solo muestra el error y NO inicia el servidor
    console.error('❌ Error de conexión a MongoDB:', err.message);
  });
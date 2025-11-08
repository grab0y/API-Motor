// server.js

require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 

// 1. Importaciones de Rutas y Middleware
const eventoRoutes = require('./routeEventos'); // Rutas de eventos (POST del Arduino)
const estadoRoutes = require('./routeEstado'); // Rutas de lectura (GET del Dashboard)
const authRoutes = require('./routesAuth'); // NUEVO: Rutas de Login
const { iniciarAnalisis } = require('./utilsAnalisis'); 
// Importamos AMBOS Middlewares: verificarToken (Arduino) y verificarJWT (Usuario)
const { verificarToken, verificarJWT } = require('./authMiddleware'); 

const app = express();
const port = process.env.PORT || 3000;
const ID_DE_TU_BOMBA = "Bomba_Reservorio_01"; 

// ===============================================
// 1. CONFIGURACIÓN DE MIDDLEWARES GLOBALES
// ===============================================

app.use(cors()); 
app.use(express.json());

// Middleware de DEBUG 
app.use((req, res, next) => {
    console.log(`[DEBUG - Petición Recibida] Método: ${req.method}, URL: ${req.originalUrl}`);
    next();
});

// Servir archivos estáticos (Dashboard)
app.use(express.static('public'));


// ===============================================
// 2. DEFINICIÓN DE RUTAS PROTEGIDAS Y PÚBLICAS
// ===============================================

// Rutas de AUTENTICACIÓN (PÚBLICA: No necesita Token para generar uno)
// Endpoint: /api/auth/login
app.use('/api/auth', authRoutes);


// Ruta de EVENTOS (PROTEGIDA POR TOKEN FIJO - ARDUINO)
// Endpoint: /api/bomba/evento
app.use('/api/bomba', verificarToken, eventoRoutes); 


// Rutas de LECTURA (PROTEGIDA POR JWT - USUARIO/FRONTEND)
// Endpoint: /api/lectura/*
// Todas las peticiones a /api/lectura deben llevar un JWT válido.
app.use('/api/lectura', verificarJWT, estadoRoutes); 


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
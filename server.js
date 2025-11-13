// server.js

require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const rateLimit = require('express-rate-limit'); // 🚨 NUEVO: Importamos el rate limiter

// 1. Importaciones de Rutas y Middleware
const eventoRoutes = require('./routeEventos'); 
const estadoRoutes = require('./routeEstado'); 
const authRoutes = require('./routesAuth'); 
const { iniciarAnalisis } = require('./utilsAnalisis'); 
const { verificarToken, verificarJWT } = require('./authMiddleware'); 

const app = express();
const port = process.env.PORT || 3000;
const ID_DE_TU_BOMBA = "1"; 

// ===============================================
// 1. CONFIGURACIÓN DE MIDDLEWARES GLOBALES
// ===============================================

// Middleware CRÍTICO de CORS y JSON
app.use(cors()); 
app.use(express.json());

// 💡 Middleware de DEBUG 
/* app.use((req, res, next) => {
    console.log(`[DEBUG - Petición Recibida] Método: ${req.method}, URL: ${req.originalUrl}`);
    next();
}); */

// 🚨 CONFIGURACIÓN DEL RATE LIMITER 🚨
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos (tiempo de ventana)
    max: 10, // Límite de 10 peticiones por IP en 15 minutos (ajustable)
    standardHeaders: true, 
    legacyHeaders: false,
    message: {
        success: false, 
        message: "Demasiados intentos de login. Intente de nuevo en 15 minutos."
    }
});

// Servir archivos estáticos (Dashboard)
app.use(express.static('public'));


// ===============================================
// 2. DEFINICIÓN DE RUTAS PROTEGIDAS Y PÚBLICAS
// ===============================================

// 🚨 APLICAMOS EL RATE LIMITER SOLO A LA RUTA DE AUTENTICACIÓN
app.use('/api/auth', loginLimiter, authRoutes);


// Ruta de EVENTOS (PROTEGIDA POR TOKEN FIJO - ARDUINO)
app.use('/api/bomba', verificarToken, eventoRoutes); 


// Rutas de LECTURA (PROTEGIDA POR JWT - USUARIO/FRONTEND)
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
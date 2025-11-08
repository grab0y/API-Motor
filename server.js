// server.js

require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 

// ... imports ...
const eventoRoutes = require('./routeEventos');
const estadoRoutes = require('./routeEstado'); 
const { iniciarAnalisis } = require('./utilsAnalisis'); 
const { verificarToken } = require('./authMiddleware');

const app = express();
const port = process.env.PORT || 3000;
const ID_DE_TU_BOMBA = "Bomba_Reservorio_01"; 

// ===============================================
// 1. CONFIGURACIÓN DE MIDDLEWARES GLOBALES (DEBE IR PRIMERO)
// ===============================================

// 🚨 CRÍTICO: Configuración de CORS
app.use(cors()); 

// Middleware CRÍTICO: Debe estar siempre al principio para parsear el JSON
app.use(express.json());

// 💡 Middleware de DEBUG 
app.use((req, res, next) => {
    console.log(`[DEBUG - Petición Recibida] Método: ${req.method}, URL: ${req.originalUrl}`);
    next();
});

// 🚀 NUEVO: Servir archivos estáticos desde la carpeta 'public'
// Cuando se accede a la raíz de la API (http://localhost:3000/), Express buscará index.html en 'public'.
app.use(express.static('public'));


// 2. Rutas
// Ruta principal para los eventos de la bomba (PROTEGIDA)
app.use('/api/bomba', verificarToken, eventoRoutes); 

// Rutas de lectura de estado (SIN protección de token)
app.use('/api/lectura', estadoRoutes); 

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
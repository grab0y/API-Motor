// middleware/authMiddleware.js

const jwt = require('jsonwebtoken'); // Importamos JWT para este nuevo middleware
require('dotenv').config();

// --- CONFIGURACIÓN DE TOKENS ---
const SECRET_TOKEN = process.env.BOMBA_API_TOKEN;
const JWT_SECRETO = process.env.JWT_SECRET; // Usamos el secreto para verificar el JWT del usuario

// ==============================================================
// 1. Middleware para el ARDUINO (BOMBA_API_TOKEN)
// ==============================================================

const verificarToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('❌ [SEGURIDAD] Intento de acceso sin Bearer Token.');
        return res.status(401).json({ success: false, message: 'Acceso denegado. Se requiere un Bearer Token.' });
    }

    const token = authHeader.split(' ')[1];

    if (token === SECRET_TOKEN) {
        console.log('✅ [SEGURIDAD] Bearer Token (Arduino) verificado.');
        next();
    } else {
        console.error('🚨 [SEGURIDAD] Token inválido (Arduino): ', token);
        return res.status(403).json({ success: false, message: 'Token de acceso inválido.' });
    }
};

// ==============================================================
// 2. Middleware para el USUARIO/FRONTEND (JWT)
// ==============================================================

const verificarJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('❌ [JWT] Acceso a ruta protegida sin token.');
        return res.status(401).json({ success: false, message: 'Acceso denegado. Token JWT faltante.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verificar y decodificar el token usando la clave secreta
        const decoded = jwt.verify(token, JWT_SECRETO);
        
        req.user = decoded; 
        
        //console.log('✅ [JWT] Token verificado. Acceso concedido.');
        next();
    } catch (err) {
        console.error('🚨 [JWT] Verificación fallida:', err.message);
        return res.status(403).json({ success: false, message: `Token JWT inválido o expirado. Error: ${err.message}` });
    }
};

module.exports = { verificarToken, verificarJWT }; // 🚨 AHORA EXPORTA AMBAS FUNCIONES
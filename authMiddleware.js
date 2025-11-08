// middleware/authMiddleware.js

// Usamos dotenv para acceder a las variables de entorno
require('dotenv').config();

// El token secreto se debe definir en el archivo .env
const SECRET_TOKEN = process.env.BOMBA_API_TOKEN;

/**
 * Middleware para verificar si la petición incluye un Bearer Token válido.
 * * El Arduino debe enviar la cabecera: 
 * Authorization: Bearer MI_TOKEN_SECRETO
 */
const verificarToken = (req, res, next) => {
    // 1. Obtener el valor de la cabecera Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('❌ [SEGURIDAD] Intento de acceso sin Bearer Token.');
        return res.status(401).json({ success: false, message: 'Acceso denegado. Se requiere un Bearer Token.' });
    }

    // 2. Extraer el token (eliminar "Bearer ")
    const token = authHeader.split(' ')[1];

    // 3. Comparar el token recibido con el token secreto del servidor
    if (token === SECRET_TOKEN) {
        // 4. Token válido: permitir el acceso a la siguiente función (el controlador)
        console.log('✅ [SEGURIDAD] Bearer Token verificado.');
        next();
    } else {
        // 5. Token inválido: rechazar la petición
        console.error('🚨 [SEGURIDAD] Token inválido: ', token);
        return res.status(403).json({ success: false, message: 'Token de acceso inválido.' });
    }
};

module.exports = { verificarToken };